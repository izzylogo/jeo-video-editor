// JEO Editor: several Claude jobs at once, each tied to one project.
//
// - A job is one message to Claude for one project. Up to `maxJobs` run at
//   the same time (default 2); more wait in a queue.
// - Claude's editing tools reach the project they belong to: the main window
//   when that project is showing there, otherwise a hidden background editor
//   window opened just for that project. The background window saves and
//   closes when the job ends.
// - Chat messages for a project that is not showing are written straight into
//   its chat.json, so they are there when the user switches back.
//
// main.cjs owns the main window and the Claude process details; it hands them
// in through `setup()`.

const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

let deps = null;
const jobs = new Map(); // projectId -> job
const queue = []; // projectIds waiting, in order
const background = new Map(); // projectId -> { window, ready: Promise<boolean>, closeTimer }
let mainProject = null; // project showing in the main window (null = none / switching)
let claimingProject = null; // the main window is on its way to this project
const inFlight = new Map(); // projectId -> number of tool calls running in the main window
const leaving = new Map(); // projectId -> { promise, resolve } while the main window saves it before leaving
const chatWrites = new Map(); // projectId -> Promise (one writer at a time)

function settingsFile() {
	return path.join(deps.app.getPath("userData"), "jeo-jobs.json");
}

function readSettings() {
	try {
		return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
	} catch {
		return {};
	}
}

function maxJobs() {
	const value = Number(readSettings().maxJobs);
	return Number.isFinite(value) && value >= 1 && value <= 4 ? Math.round(value) : 2;
}

function setMaxJobs(value) {
	const next = Math.min(4, Math.max(1, Math.round(Number(value) || 2)));
	fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
	fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), maxJobs: next }));
	startQueued();
	broadcast();
	return next;
}

function running() {
	return [...jobs.values()].filter((job) => job.status === "working").length;
}

/** What the tabs show: { [projectId]: { status, startedAt, unread, queuedAt, position } } */
function snapshot() {
	const out = {};
	for (const [id, job] of jobs) {
		out[id] = {
			status: job.status,
			startedAt: job.startedAt ?? null,
			finishedAt: job.finishedAt ?? null,
			unread: Boolean(job.unread),
			position: job.status === "queued" ? queue.indexOf(id) + 1 : 0,
			error: job.error ?? null,
		};
	}
	return { jobs: out, maxJobs: maxJobs(), running: running() };
}

function broadcast() {
	const win = deps.getMainWindow();
	if (win && !win.isDestroyed()) win.webContents.send("jeo:jobs", snapshot());
}

// ---------- chat transcript for projects that are not showing ----------

/** Runs one chat-file write after the ones before it for that project. */
function queueChatWrite(projectId, work) {
	const previous = chatWrites.get(projectId) || Promise.resolve();
	const next = previous.catch(() => {}).then(work);
	chatWrites.set(projectId, next);
	return next;
}

/** Resolves once every queued chat write for the project is on disk. */
function chatSettled(projectId) {
	return (chatWrites.get(projectId) || Promise.resolve()).catch(() => {});
}

function writeChat(projectId, change) {
	return queueChatWrite(projectId, async () => {
			const dir = await deps.ensureProjectDir({ id: projectId });
			const file = path.join(dir, "chat.json");
			let saved = { sessionId: null, messages: [] };
			try {
				saved = JSON.parse(await fsp.readFile(file, "utf8"));
			} catch {
				// new chat
			}
			if (!Array.isArray(saved.messages)) saved.messages = [];
			change(saved);
			saved.messages = saved.messages.slice(-400);
			await deps.writeFileAtomic(file, JSON.stringify(saved));
	});
}

let idCounter = 0;
function messageId() {
	idCounter += 1;
	return `bg-${Date.now().toString(36)}-${idCounter}`;
}

/** One chat event for one project: to the window if it is showing, else to disk. */
function chatEvent(projectId, event) {
	const win = deps.getMainWindow();
	const showing = mainProject === projectId && claimingProject === null;
	if (showing && win && !win.isDestroyed()) {
		win.webContents.send("jeo:chatEvent", { ...event, projectId });
		return;
	}
	void writeChat(projectId, (saved) => {
		const last = saved.messages[saved.messages.length - 1];
		if (event.type === "text") {
			saved.messages.push({ id: messageId(), role: "assistant", text: event.text });
		} else if (event.type === "tool") {
			// steps are kept together in one line, as the chat shows them
			if (last && last.role === "tool") last.text = `${last.text}\n${event.summary}`;
			else saved.messages.push({ id: messageId(), role: "tool", text: event.summary });
		} else if (event.type === "done") {
			if (event.sessionId) saved.sessionId = event.sessionId;
			if (event.error) saved.messages.push({ id: messageId(), role: "error", text: event.error });
		} else if (event.type === "user") {
			saved.messages.push({ id: messageId(), role: "user", text: event.text });
		}
	});
}

// ---------- jobs ----------

const VALID_ID = /^[a-zA-Z0-9-]{1,64}$/;

function send({ projectId, text, sessionId }) {
	if (!projectId) return { ok: false, error: "Open a project first." };
	if (!VALID_ID.test(String(projectId))) return { ok: false, error: "That project id is not valid." };
	const existing = jobs.get(projectId);
	if (existing && (existing.status === "working" || existing.status === "queued")) {
		return { ok: false, error: "Claude is still working on this project's last message." };
	}
	const job = { projectId, text: String(text), sessionId, status: "queued", queuedAt: Date.now(), unread: false };
	jobs.set(projectId, job);
	if (running() >= maxJobs()) {
		queue.push(projectId);
		broadcast();
		return { ok: true, queued: true, position: queue.length };
	}
	start(job);
	return { ok: true, queued: false };
}

function start(job) {
	job.status = "working";
	job.startedAt = Date.now();
	broadcast();
	deps
		.startClaude({
			projectId: job.projectId,
			text: job.text,
			sessionId: job.sessionId,
			onEvent: (event) => chatEvent(job.projectId, event),
			onChild: (child) => {
				job.child = child;
			},
			onDone: ({ error, sessionId }) => finish(job, { error, sessionId }),
		})
		.catch((error) => finish(job, { error: String(error && error.message ? error.message : error) }));
}

function finish(job, { error, sessionId }) {
	if (job.finished) return;
	job.finished = true;
	job.child = null;
	job.status = job.stopped ? "stopped" : error ? "error" : "done";
	job.error = error || null;
	job.finishedAt = Date.now();
	// a finished job on a tab the user is not looking at gets a "new" mark
	job.unread = mainProject !== job.projectId;
	chatEvent(job.projectId, { type: "done", sessionId: sessionId || null, ...(error ? { error } : {}) });
	scheduleBackgroundClose(job.projectId);
	broadcast();
	startQueued();
}

function startQueued() {
	while (queue.length > 0 && running() < maxJobs()) {
		const projectId = queue.shift();
		const job = jobs.get(projectId);
		if (job && job.status === "queued") start(job);
	}
	broadcast();
}

function stop(projectId) {
	const job = jobs.get(projectId);
	if (!job) return;
	if (job.status === "queued") {
		const at = queue.indexOf(projectId);
		if (at >= 0) queue.splice(at, 1);
		job.status = "stopped";
		job.finished = true;
		chatEvent(projectId, { type: "done", sessionId: job.sessionId || null });
		broadcast();
		return;
	}
	if (job.child) {
		job.stopped = true;
		deps.killTree(job.child);
	}
}

function seen(projectId) {
	const job = jobs.get(projectId);
	if (job) {
		job.unread = false;
		broadcast();
	}
}

function isBusy(projectId) {
	const job = jobs.get(projectId);
	return Boolean(job && (job.status === "working" || job.status === "queued"));
}

// ---------- where a tool call goes ----------

function waitForEditor(contents, id, timeoutMs = 60000) {
	const script = `(async () => {
		const until = Date.now() + ${timeoutMs};
		while (Date.now() < until) {
			const active = window.__jeoEditor?.project?.getActiveOrNull?.();
			if (active && active.metadata.id === ${JSON.stringify(id)} && window.__jeoControl) return true;
			await new Promise((r) => setTimeout(r, 300));
		}
		return false;
	})()`;
	return contents.executeJavaScript(script, true).catch(() => false);
}

function ensureBackground(projectId) {
	const existing = background.get(projectId);
	if (existing && !existing.window.isDestroyed()) {
		clearTimeout(existing.closeTimer);
		return existing;
	}
	const { BrowserWindow } = require("electron");
	const window = new BrowserWindow({
		show: false,
		width: 1280,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			backgroundThrottling: false,
		},
	});
	window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	const entry = { window, closeTimer: null, ready: null };
	entry.ready = window
		.loadURL(`http://localhost:${deps.port}/editor/${projectId}?bg=1`)
		.catch(() => {})
		.then(() => waitForEditor(window.webContents, projectId));
	window.on("closed", () => {
		if (background.get(projectId) === entry) background.delete(projectId);
	});
	background.set(projectId, entry);
	return entry;
}

async function saveAndCloseBackground(projectId) {
	const entry = background.get(projectId);
	if (!entry || entry.window.isDestroyed()) return false;
	clearTimeout(entry.closeTimer);
	background.delete(projectId);
	try {
		await entry.ready;
		await entry.window.webContents.executeJavaScript(
			`(async () => { try { await window.__jeoEditor?.project?.saveCurrentProject?.(); } catch {} return true; })()`,
			true,
		);
	} catch {
		// window already gone
	}
	if (!entry.window.isDestroyed()) entry.window.destroy();
	// the main window's remembered undo steps for this project no longer fit
	const win = deps.getMainWindow();
	if (win && !win.isDestroyed()) win.webContents.send("jeo:projectChangedElsewhere", { projectId });
	return true;
}

function scheduleBackgroundClose(projectId) {
	const entry = background.get(projectId);
	if (!entry) return;
	clearTimeout(entry.closeTimer);
	entry.closeTimer = setTimeout(() => {
		if (!isBusy(projectId)) void saveAndCloseBackground(projectId);
	}, 2500);
}

/**
 * The web contents a tool call for `projectId` should run in.
 * No project (the live link from a chat outside the app) = the main window.
 */
async function targetFor(projectId) {
	const win = deps.getMainWindow();
	if (!projectId) return win && !win.isDestroyed() ? win.webContents : null;
	// the main window is saving this project before leaving it: wait, so a
	// background editor never opens an older copy
	const left = leaving.get(projectId);
	if (left) await left.promise;
	if (claimingProject === projectId) {
		// the user is switching to this project right now: wait for it
		if (win && !win.isDestroyed() && (await waitForEditor(win.webContents, projectId))) return win.webContents;
	}
	if (mainProject === projectId && win && !win.isDestroyed()) return win.webContents;
	if (!VALID_ID.test(String(projectId))) return null;
	const entry = ensureBackground(projectId);
	const ok = await entry.ready;
	return ok && !entry.window.isDestroyed() ? entry.window.webContents : null;
}

async function runIn(projectId, run) {
	const contents = await targetFor(projectId);
	if (!contents) return { ok: false, error: "That project could not be opened for editing." };
	const win = deps.getMainWindow();
	const isMain = win && !win.isDestroyed() && contents === win.webContents;
	if (isMain && projectId) inFlight.set(projectId, (inFlight.get(projectId) || 0) + 1);
	try {
		return await run(contents);
	} finally {
		if (isMain && projectId) inFlight.set(projectId, Math.max(0, (inFlight.get(projectId) || 1) - 1));
	}
}

// ---------- the main window tells us what it shows ----------

async function setMainProject(projectId) {
	mainProject = projectId || null;
	if (projectId && claimingProject === projectId) claimingProject = null;
	if (projectId) seen(projectId);
	broadcast();
	// from here on, new chat lines go to the window; the window reads the file
	// after this resolves, so it sees every line written before
	if (projectId) await chatSettled(projectId);
}

/** Before the main window leaves a project: wait for its tool calls to finish. */
async function releaseProject(projectId) {
	if (mainProject === projectId) mainProject = null;
	if (!leaving.has(projectId)) {
		let resolve;
		const promise = new Promise((done) => {
			resolve = done;
		});
		const entry = { promise, resolve: null };
		const timer = setTimeout(() => leftProject(projectId), 20000); // never wait forever
		entry.resolve = () => {
			clearTimeout(timer);
			resolve();
		};
		leaving.set(projectId, entry);
	}
	const until = Date.now() + 15000;
	while ((inFlight.get(projectId) || 0) > 0 && Date.now() < until) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return true;
}

/** The main window has saved the project it left: background editors may open it. */
function leftProject(projectId) {
	const entry = leaving.get(projectId);
	if (!entry) return;
	leaving.delete(projectId);
	entry.resolve();
}

/** Before the main window opens a project: take it back from a background editor. */
async function claimProject(projectId) {
	claimingProject = projectId;
	await saveAndCloseBackground(projectId);
	return true;
}

function closeAll() {
	for (const job of jobs.values()) if (job.child) deps.killTree(job.child);
	for (const entry of background.values()) if (!entry.window.isDestroyed()) entry.window.destroy();
}

function setup(options) {
	deps = options;
}

module.exports = {
	setup,
	queueChatWrite,
	chatSettled,
	send,
	stop,
	seen,
	snapshot,
	setMaxJobs,
	runIn,
	setMainProject,
	releaseProject,
	leftProject,
	claimProject,
	closeAll,
	isBusy,
};
