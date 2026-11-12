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
const ICON_PATH =path.join(__dirname, "icon.ico");

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

	ipcMain.handle("jeo:showProjectFolder", async (_event, { id }) => {
		const dir = (await findProjectDir({ id })) || PROJECTS_DIR;
		await shell.openPath(dir);
	});
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
			await startServer();
			await createWindow();
		} catch (error) {
			const { dialog } = require("electron");
			dialog.showErrorBox("JEO Editor could not start", String(error));
			app.quit();
		}
	});

	app.on("window-all-closed", () => app.quit());
	app.on("before-quit", stopServer);
}
