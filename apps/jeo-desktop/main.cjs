// JEO Editor desktop window.
// Starts the editor's local web server, opens it in a window, and gives the
// editor a way to save projects as real folders on disk.

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.JEO_PORT || 3210);
const APP_URL = `http://localhost:${PORT}`;
const WEB_DIR = path.resolve(__dirname, "../web");
const PROJECTS_DIR =
	process.env.JEO_PROJECTS_DIR || path.resolve(__dirname, "../../../projects");
const OUTPUT_DIR =
	process.env.JEO_OUTPUT_DIR || path.resolve(__dirname, "../../../output");
const ASSETS_DIR =
	process.env.JEO_ASSETS_DIR || path.resolve(__dirname, "../../../assets");
const ICON_PATH = path.join(__dirname, "icon.ico");

// Test helpers: --capture=<png path> [--eval-file=<js path>] [--capture-delay=<ms>]
const argValue = (name) => {
	const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : null;
};
const CAPTURE_PATH = argValue("capture");
const EVAL_FILE = argValue("eval-file");
const CAPTURE_DELAY = Number(argValue("capture-delay") || 8000);
const FORCE_DEV = process.argv.includes("--dev");

// A video editor should never have its preview sound blocked.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let serverProcess = null;
let mainWindow = null;

function ping() {
	return new Promise((resolve) => {
		const request = http.get(APP_URL, (response) => {
			response.resume();
			resolve(true);
		});
		request.on("error", () => resolve(false));
		request.setTimeout(1500, () => {
			request.destroy();
			resolve(false);
		});
	});
}

async function waitForServer({ timeoutMs }) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (await ping()) return true;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	return false;
}

function findNextBin() {
	const candidates = [
		path.join(WEB_DIR, "node_modules/next/dist/bin/next"),
		path.resolve(WEB_DIR, "../../node_modules/next/dist/bin/next"),
	];
	return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function startServer() {
	if (await ping()) return; // already running (for example a dev server)

	const nextBin = findNextBin();
	if (!nextBin) throw new Error("Could not find Next.js. Run `bun install`.");

	const hasBuild = fs.existsSync(path.join(WEB_DIR, ".next", "BUILD_ID"));
	const mode = hasBuild && !FORCE_DEV ? "start" : "dev";
	const args = [nextBin, mode, "-p", String(PORT)];
	if (mode === "dev") args.push("--turbopack");

	serverProcess = spawn(process.execPath, args, {
		cwd: WEB_DIR,
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: String(PORT) },
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true,
	});
	const logPath = path.join(app.getPath("userData"), "server.log");
	const log = fs.createWriteStream(logPath, { flags: "w" });
	serverProcess.stdout.pipe(log);
	serverProcess.stderr.pipe(log);
	serverProcess.on("exit", () => {
		serverProcess = null;
	});

	const ready = await waitForServer({ timeoutMs: mode === "dev" ? 180000 : 60000 });
	if (!ready) throw new Error(`The editor server did not start. See ${logPath}`);
}

function stopServer() {
	if (!serverProcess) return;
	const pid = serverProcess.pid;
	serverProcess = null;
	if (process.platform === "win32") {
		execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => {});
	} else {
		process.kill(pid);
	}
}

// ---------- project folders on disk ----------

const shortId = (id) => String(id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
const safeName = (name) =>
	String(name || "Untitled")
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 60) || "Untitled";
const isSafeId = (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);

async function findProjectDir({ id }) {
	if (!isSafeId(id)) throw new Error("Bad project id");
	await fsp.mkdir(PROJECTS_DIR, { recursive: true });
	const suffix = `[${shortId(id)}]`;
	const entries = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true });
	const hit = entries.find(
		(entry) => entry.isDirectory() && entry.name.endsWith(suffix),
	);
	return hit ? path.join(PROJECTS_DIR, hit.name) : null;
}

async function ensureProjectDir({ id, name }) {
	const existing = await findProjectDir({ id });
	const wantedName = name ? `${safeName(name)} [${shortId(id)}]` : null;
	if (existing) {
		if (wantedName && path.basename(existing) !== wantedName) {
			const renamed = path.join(PROJECTS_DIR, wantedName);
			try {
				await fsp.rename(existing, renamed);
				return renamed;
			} catch {
				return existing; // folder busy; keep the old name
			}
		}
		return existing;
	}
	const created = path.join(
		PROJECTS_DIR,
		wantedName || `Untitled [${shortId(id)}]`,
	);
	await fsp.mkdir(path.join(created, "media"), { recursive: true });
	return created;
}

async function writeFileAtomic(filePath, data) {
	const tempPath = `${filePath}.tmp`;
	await fsp.writeFile(tempPath, data);
	await fsp.rename(tempPath, filePath);
}

function mediaFileName({ mediaId, fileName }) {
	const extension = path.extname(String(fileName || "")).slice(0, 10);
	return `${mediaId}${/^\.[a-zA-Z0-9]+$/.test(extension) ? extension : ""}`;
}

function registerIpc() {
	ipcMain.handle("jeo:writeProject", async (_event, { id, name, json }) => {
		const dir = await ensureProjectDir({ id, name });
		await writeFileAtomic(path.join(dir, "project.json"), json);
	});

	ipcMain.handle("jeo:listProjects", async () => {
		await fsp.mkdir(PROJECTS_DIR, { recursive: true });
		const entries = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true });
		const projects = [];
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
			try {
				const json = await fsp.readFile(
					path.join(PROJECTS_DIR, entry.name, "project.json"),
					"utf8",
				);
				projects.push({ json });
			} catch {
				// not a project folder
			}
		}
		return projects;
	});

	// Deleting a project in the app moves its folder to projects\_trash.
	ipcMain.handle("jeo:trashProject", async (_event, { id }) => {
		const dir = await findProjectDir({ id });
		if (!dir) return;
		const trashDir = path.join(PROJECTS_DIR, "_trash");
		await fsp.mkdir(trashDir, { recursive: true });
		await fsp.rename(
			dir,
			path.join(trashDir, `${path.basename(dir)} ${Date.now()}`),
		);
	});

	ipcMain.handle(
		"jeo:writeMedia",
		async (_event, { projectId, mediaId, fileName, metaJson, data }) => {
			if (!isSafeId(mediaId)) throw new Error("Bad media id");
			const dir = await ensureProjectDir({ id: projectId });
			const mediaDir = path.join(dir, "media");
			await fsp.mkdir(mediaDir, { recursive: true });
			await writeFileAtomic(
				path.join(mediaDir, mediaFileName({ mediaId, fileName })),
				Buffer.from(data),
			);
			await writeFileAtomic(path.join(mediaDir, `${mediaId}.json`), metaJson);
		},
	);

	ipcMain.handle("jeo:listMedia", async (_event, { projectId }) => {
		const dir = await findProjectDir({ id: projectId });
		if (!dir) return [];
		const mediaDir = path.join(dir, "media");
		let names = [];
		try {
			names = await fsp.readdir(mediaDir);
		} catch {
			return [];
		}
		const items = [];
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			try {
				items.push({
					mediaId: name.slice(0, -5),
					metaJson: await fsp.readFile(path.join(mediaDir, name), "utf8"),
				});
			} catch {
				// skip unreadable entries
			}
		}
		return items;
	});

	ipcMain.handle("jeo:readMedia", async (_event, { projectId, mediaId }) => {
		if (!isSafeId(mediaId)) throw new Error("Bad media id");
		const dir = await findProjectDir({ id: projectId });
		if (!dir) return null;
		const mediaDir = path.join(dir, "media");
		const names = await fsp.readdir(mediaDir).catch(() => []);
		const fileName = names.find(
			(name) =>
				!name.endsWith(".json") &&
				!name.endsWith(".tmp") &&
				path.parse(name).name === mediaId,
		);
		if (!fileName) return null;
		const buffer = await fsp.readFile(path.join(mediaDir, fileName));
		return {
			data: buffer.buffer.slice(
				buffer.byteOffset,
				buffer.byteOffset + buffer.byteLength,
			),
		};
	});

	ipcMain.handle("jeo:deleteMedia", async (_event, { projectId, mediaId }) => {
		if (!isSafeId(mediaId)) throw new Error("Bad media id");
		const dir = await findProjectDir({ id: projectId });
		if (!dir) return;
		const mediaDir = path.join(dir, "media");
		const names = await fsp.readdir(mediaDir).catch(() => []);
		for (const name of names) {
			if (path.parse(name).name === mediaId) {
				await fsp.rm(path.join(mediaDir, name), { force: true });
			}
		}
	});

	// ---- my assets folder: music, sound-effects, emoji ----
	const ASSET_KINDS = ["music", "sound-effects", "emoji"];
	const ASSET_EXTENSIONS = new Set([
		".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac",
		".png", ".jpg", ".jpeg", ".webp",
	]);

	ipcMain.handle("jeo:listAssets", async () => {
		const assets = [];
		for (const kind of ASSET_KINDS) {
			const dir = path.join(ASSETS_DIR, kind);
			await fsp.mkdir(dir, { recursive: true }).catch(() => {});
			const names = await fsp.readdir(dir).catch(() => []);
			for (const name of names.sort()) {
				if (!ASSET_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
				const stat = await fsp.stat(path.join(dir, name)).catch(() => null);
				if (!stat || !stat.isFile()) continue;
				assets.push({ kind, name, relPath: `${kind}/${name}`, size: stat.size });
			}
		}
		return assets;
	});

	ipcMain.handle("jeo:readAsset", async (_event, { relPath }) => {
		const full = path.resolve(ASSETS_DIR, String(relPath));
		const inside = full.startsWith(path.resolve(ASSETS_DIR) + path.sep);
		if (!inside || !ASSET_EXTENSIONS.has(path.extname(full).toLowerCase())) {
			throw new Error("Not an asset file");
		}
		const buffer = await fsp.readFile(full);
		return {
			data: buffer.buffer.slice(
				buffer.byteOffset,
				buffer.byteOffset + buffer.byteLength,
			),
		};
	});

	ipcMain.handle("jeo:showAssetsFolder", async (_event, { kind }) => {
		const dir = ASSET_KINDS.includes(kind)
			? path.join(ASSETS_DIR, kind)
			: ASSETS_DIR;
		await fsp.mkdir(dir, { recursive: true }).catch(() => {});
		await shell.openPath(dir);
	});

	// ---- auto-follow: track a point with OpenCV (Python) ----
	ipcMain.handle(
		"jeo:trackPoint",
		async (_event, { projectId, mediaId, start, end, x, y, box }) => {
			if (!isSafeId(mediaId)) throw new Error("Bad media id");
			const dir = await findProjectDir({ id: projectId });
			const mediaDir = dir ? path.join(dir, "media") : null;
			const names = mediaDir ? await fsp.readdir(mediaDir).catch(() => []) : [];
			const fileName = names.find(
				(name) =>
					!name.endsWith(".json") &&
					!name.endsWith(".tmp") &&
					path.parse(name).name === mediaId,
			);
			if (!fileName) {
				return { ok: false, error: "The clip's file is not in the project folder.", points: [] };
			}
			const numbers = [start, end, x, y, box].map((value) => String(Number(value)));
			return await new Promise((resolve) => {
				execFile(
					"py",
					[path.join(__dirname, "tools", "track_point.py"), path.join(mediaDir, fileName), ...numbers],
					{ windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024 },
					(error, stdout) => {
						try {
							resolve(JSON.parse(String(stdout).trim().split(/\r?\n/).pop()));
						} catch {
							resolve({
								ok: false,
								error: error ? `Tracking could not run: ${error.message}` : "Tracking gave no result.",
								points: [],
							});
						}
					},
				);
			});
		},
	);

	// ---- AI chat history, kept in the project folder ----
	ipcMain.handle("jeo:readChat", async (_event, { projectId }) => {
		const dir = await findProjectDir({ id: projectId });
		if (!dir) return null;
		return await fsp.readFile(path.join(dir, "chat.json"), "utf8").catch(() => null);
	});

	ipcMain.handle("jeo:writeChat", async (_event, { projectId, json }) => {
		const dir = await ensureProjectDir({ id: projectId });
		await writeFileAtomic(path.join(dir, "chat.json"), String(json));
	});

	ipcMain.handle("jeo:chatSend", async (_event, args) => chatSend(args));
	ipcMain.handle("jeo:chatStop", async () => chatStop());

	ipcMain.handle("jeo:showProjectFolder", async (_event, { id }) => {
		const dir = (await findProjectDir({ id })) || PROJECTS_DIR;
		await shell.openPath(dir);
	});
}

// ---------- control channel (for the MCP server) ----------

const crypto = require("node:crypto");
const CONTROL_TOKEN = crypto.randomBytes(24).toString("hex");
let controlPort = 0;

async function callEditor(payload) {
	if (!mainWindow || mainWindow.isDestroyed()) {
		return { ok: false, error: "The JEO Editor window is closed." };
	}
	const script = payload.list
		? `(() => ({ tools: window.__jeoControl ? window.__jeoControl.listTools() : [] }))()`
		: `(async () => window.__jeoControl
				? await window.__jeoControl.callTool(${JSON.stringify({
						name: String(payload.tool || ""),
						args: payload.args || {},
					})})
				: { ok: false, error: "Open a project in JEO Editor first." })()`;
	try {
		return await mainWindow.webContents.executeJavaScript(script, true);
	} catch (error) {
		return { ok: false, error: String(error && error.message ? error.message : error) };
	}
}

function startControlServer() {
	return new Promise((resolve) => {
		const server = http.createServer((request, response) => {
			const reply = (status, body) => {
				response.writeHead(status, { "content-type": "application/json" });
				response.end(JSON.stringify(body));
			};
			if (
				request.method !== "POST" ||
				request.url !== "/call" ||
				request.headers["x-jeo-token"] !== CONTROL_TOKEN
			) {
				reply(403, { ok: false, error: "Not allowed." });
				return;
			}
			let body = "";
			request.setEncoding("utf8");
			request.on("data", (chunk) => {
				body += chunk;
				if (body.length > 2 * 1024 * 1024) request.destroy();
			});
			request.on("end", async () => {
				try {
					reply(200, await callEditor(JSON.parse(body)));
				} catch (error) {
					reply(200, { ok: false, error: String(error) });
				}
			});
		});
		// local machine only
		server.listen(0, "127.0.0.1", () => {
			controlPort = server.address().port;
			resolve();
		});
	});
}

// ---------- AI chat: Claude Code, headless ----------

const STYLE_FILE = path.resolve(__dirname, "../../../style/your-style.md");
let chatProcess = null;
let chatStopped = false;

function sendChatEvent(event) {
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send("jeo:chatEvent", event);
	}
}

function findClaude() {
	const candidates = [
		process.env.JEO_CLAUDE_PATH,
		path.join(process.env.USERPROFILE || "", ".local", "bin", "claude.exe"),
		path.join(process.env.APPDATA || "", "npm", "claude.cmd"),
	].filter(Boolean);
	return candidates.find((candidate) => fs.existsSync(candidate)) || "claude";
}

async function prepareChatFiles() {
	const dir = path.join(app.getPath("userData"), "ai");
	await fsp.mkdir(dir, { recursive: true });
	const instructions = await fsp.readFile(path.join(__dirname, "ai-instructions.md"), "utf8");
	const style = await fsp.readFile(STYLE_FILE, "utf8").catch(() => "");
	const promptFile = path.join(dir, "system-prompt.md");
	await fsp.writeFile(
		promptFile,
		`${instructions}\n\n---\n\n# The user's measured style (style/your-style.md)\n\n${style}`,
	);
	const configFile = path.join(dir, "mcp.json");
	await fsp.writeFile(
		configFile,
		JSON.stringify({
			mcpServers: {
				"jeo-editor": {
					command: process.execPath,
					args: [path.join(__dirname, "mcp-server.cjs")],
					env: {
						ELECTRON_RUN_AS_NODE: "1",
						JEO_CONTROL_PORT: String(controlPort),
						JEO_CONTROL_TOKEN: CONTROL_TOKEN,
					},
				},
			},
		}),
	);
	return { dir, promptFile, configFile };
}

const TOOL_LABELS = {
	get_state: "Reading the timeline",
	view_source: "Looking at the raw clip",
	view_timeline: "Checking the edit",
	build_cut: "Cutting the clip",
	set_clip: "Re-framing a shot",
	add_freeze: "Adding the freeze",
	add_text: "Adding a text",
	update_element: "Adjusting",
	delete_elements: "Removing",
	clear_overlays: "Clearing texts and effects",
	add_effect: "Adding an effect",
	add_arrow: "Adding an arrow",
	add_ending: "Building the ending",
	end_on_29: "Ending on :29",
	snap_texts_to_cuts: "Snapping texts to cuts",
	follow_head: "Making a tag follow",
	list_audio: "Looking at your sounds",
	add_audio: "Adding sound",
	undo: "Undoing",
	export_video: "Exporting",
};

function describeToolUse({ name, input }) {
	const short = String(name || "").replace(/^mcp__jeo-editor__/, "");
	const label = TOOL_LABELS[short] || short;
	const detail =
		typeof input?.text === "string"
			? `: ${input.text}`
			: typeof input?.kind === "string"
				? `: ${input.kind.replace(/_/g, " ")}`
				: "";
	return { name: short, summary: `${label}${detail}` };
}

async function chatSend({ text, sessionId }) {
	if (chatProcess) return { ok: false, error: "Claude is still working on the last message." };
	const { dir, promptFile, configFile } = await prepareChatFiles();
	const args = [
		"-p",
		"--output-format", "stream-json",
		"--verbose",
		"--mcp-config", configFile,
		"--strict-mcp-config",
		"--append-system-prompt-file", promptFile,
		"--allowedTools", "mcp__jeo-editor",
		"--disallowedTools", "Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,NotebookEdit,Task,Agent",
	];
	if (typeof sessionId === "string" && /^[0-9a-fA-F-]{8,64}$/.test(sessionId)) {
		args.push("--resume", sessionId);
	}

	let child;
	try {
		child = spawn(findClaude(), args, { cwd: dir, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
	} catch (error) {
		return { ok: false, error: `Could not start Claude Code: ${error.message}` };
	}
	chatProcess = child;
	chatStopped = false;
	let latestSession = typeof sessionId === "string" ? sessionId : null;
	let finished = false;
	let errorText = "";
	const finish = (error) => {
		if (finished) return;
		finished = true;
		chatProcess = null;
		sendChatEvent({ type: "done", sessionId: latestSession, ...(error ? { error } : {}) });
	};

	const lines = require("node:readline").createInterface({ input: child.stdout });
	lines.on("line", (line) => {
		let event;
		try {
			event = JSON.parse(line);
		} catch {
			return;
		}
		if (event.session_id) latestSession = event.session_id;
		if (event.type === "assistant" && Array.isArray(event.message?.content)) {
			for (const part of event.message.content) {
				if (part.type === "text" && part.text) {
					sendChatEvent({ type: "text", text: part.text });
				} else if (part.type === "tool_use") {
					sendChatEvent({ type: "tool", ...describeToolUse(part) });
				}
			}
		} else if (event.type === "result" && event.is_error) {
			errorText = String(event.result || "Claude stopped with an error.");
		}
	});
	child.stderr.on("data", (chunk) => {
		errorText = (errorText + String(chunk)).slice(-600);
	});
	child.on("error", (error) =>
		finish(
			error.code === "ENOENT"
				? "Claude Code was not found on this computer."
				: `Could not start Claude Code: ${error.message}`,
		),
	);
	child.on("close", (code) =>
		finish(code === 0 || chatStopped ? undefined : errorText.trim() || `Claude stopped (code ${code}).`),
	);

	child.stdin.write(String(text));
	child.stdin.end();
	return { ok: true };
}

function chatStop() {
	if (!chatProcess) return;
	const pid = chatProcess.pid;
	chatStopped = true;
	if (process.platform === "win32") {
		execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => {});
	} else {
		chatProcess.kill();
	}
}

// ---------- window ----------

async function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1366,
		height: 800,
		minWidth: 1100,
		minHeight: 640,
		title: "JEO Editor",
		backgroundColor: "#0d0d0d",
		autoHideMenuBar: true,
		show: !CAPTURE_PATH || process.argv.includes("--visible"),
		icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			backgroundThrottling: false,
		},
	});
	mainWindow.setMenuBarVisibility(false);
	if (!CAPTURE_PATH) mainWindow.maximize();

	// Links to other sites open in the normal browser, never inside the editor.
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (!url.startsWith(APP_URL)) shell.openExternal(url);
		return { action: "deny" };
	});

	// Exports are saved straight into the output folder (never overwriting).
	mainWindow.webContents.session.on("will-download", (_event, item) => {
		fs.mkdirSync(OUTPUT_DIR, { recursive: true });
		const parsed = path.parse(item.getFilename() || "export.mp4");
		let target = path.join(OUTPUT_DIR, `${parsed.name}${parsed.ext}`);
		for (let version = 2; fs.existsSync(target); version++) {
			target = path.join(OUTPUT_DIR, `${parsed.name}_v${version}${parsed.ext}`);
		}
		item.setSavePath(target);
		item.once("done", (_doneEvent, state) => {
			if (!mainWindow || mainWindow.isDestroyed()) return;
			const message =
				state === "completed"
					? `Saved to output\\${path.basename(target)}`
					: "Export could not be saved";
			mainWindow.webContents
				.executeJavaScript(
					`window.dispatchEvent(new CustomEvent("jeo:export-saved", { detail: ${JSON.stringify(
						{ ok: state === "completed", message, path: target },
					)} }))`,
				)
				.catch(() => {});
		});
	});

	await mainWindow.loadURL(APP_URL);

	if (CAPTURE_PATH) {
		await new Promise((resolve) => setTimeout(resolve, CAPTURE_DELAY));
		let evalResult = null;
		if (EVAL_FILE) {
			try {
				evalResult = await mainWindow.webContents.executeJavaScript(
					fs.readFileSync(EVAL_FILE, "utf8"),
					true,
				);
			} catch (error) {
				evalResult = { error: String(error) };
			}
			await new Promise((resolve) => setTimeout(resolve, 2500));
		}
		const image = await mainWindow.webContents.capturePage();
		fs.writeFileSync(CAPTURE_PATH, image.toPNG());
		if (EVAL_FILE) {
			fs.writeFileSync(
				`${CAPTURE_PATH}.json`,
				JSON.stringify(evalResult ?? null, null, 2),
			);
		}
		app.quit();
	}
}

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", () => {
		if (!mainWindow) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});

	app.whenReady().then(async () => {
		registerIpc();
		try {
			await startControlServer();
			await startServer();
			await createWindow();
		} catch (error) {
			const { dialog } = require("electron");
			dialog.showErrorBox("JEO Editor could not start", String(error));
			app.quit();
		}
	});

	app.on("window-all-closed", () => app.quit());
	app.on("before-quit", () => {
		chatStop();
		stopServer();
	});
}
