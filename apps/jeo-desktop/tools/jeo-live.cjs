#!/usr/bin/env node
/**
 * Drive the JEO Editor window that is open right now, from outside the app.
 * Used by Claude in a chat: an edit asked for there happens in the open
 * window straight away, with no reload.
 *
 *   node jeo-live.cjs --status
 *   node jeo-live.cjs --list                      (tool names and what they do)
 *   node jeo-live.cjs <tool> ['{"json":"args"}']   (or @file.json for the args)
 *
 * The running editor writes its address to <project>\live\control.json when it
 * starts and removes it when it closes. The token in that file is a local
 * secret: never print it or copy it anywhere.
 */
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const LIVE_FILE =
	process.env.JEO_LIVE_FILE || path.resolve(__dirname, "../../../../live/control.json");

function fail(message) {
	process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
	process.exit(1);
}

let live;
try {
	live = JSON.parse(fs.readFileSync(LIVE_FILE, "utf8"));
} catch {
	fail("JEO Editor is not open (or it is an older version). Open it, or click Update now in it.");
}

function call(payload) {
	return new Promise((resolve) => {
		const body = JSON.stringify(payload);
		const request = http.request(
			{
				host: "127.0.0.1",
				port: live.port,
				path: "/call",
				method: "POST",
				headers: {
					"content-type": "application/json",
					"content-length": Buffer.byteLength(body),
					"x-jeo-token": live.token,
				},
				timeout: 180000,
			},
			(response) => {
				let text = "";
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					text += chunk;
				});
				response.on("end", () => {
					try {
						resolve(JSON.parse(text));
					} catch {
						resolve({ ok: false, error: "The editor gave an unreadable answer." });
					}
				});
			},
		);
		request.on("timeout", () => request.destroy(new Error("timed out")));
		request.on("error", () =>
			resolve({ ok: false, error: "JEO Editor did not answer. Is its window still open?" }),
		);
		request.end(body);
	});
}

/** pictures in a result are saved as files, so the output stays small */
function saveImages(value, folder) {
	let count = 0;
	const walk = (node) => {
		if (Array.isArray(node)) return node.map(walk);
		if (node && typeof node === "object") {
			const out = {};
			for (const [key, inner] of Object.entries(node)) out[key] = walk(inner);
			return out;
		}
		if (typeof node === "string" && node.startsWith("data:image/")) {
			const match = /^data:image\/(\w+);base64,(.+)$/s.exec(node);
			if (!match) return node;
			fs.mkdirSync(folder, { recursive: true });
			count += 1;
			const file = path.join(folder, `live_${Date.now()}_${count}.${match[1] === "jpeg" ? "jpg" : match[1]}`);
			fs.writeFileSync(file, Buffer.from(match[2], "base64"));
			return file;
		}
		return node;
	};
	return walk(value);
}

(async () => {
	const [first, second] = process.argv.slice(2);
	if (!first || first === "--status") {
		const reply = await call({ tool: "list_projects", args: {} });
		const open = reply.ok ? reply.result.projects.find((p) => p.id === reply.result.open) : null;
		process.stdout.write(
			`${JSON.stringify({ ok: reply.ok, editorOpen: reply.ok, started: live.started, openProject: open ? open.name : null, projects: reply.ok ? reply.result.projects.map((p) => p.name) : [], error: reply.error })}\n`,
		);
		return;
	}
	if (first === "--list") {
		const reply = await call({ list: true });
		for (const tool of reply.tools || []) {
			process.stdout.write(`${tool.name}: ${String(tool.description || "").slice(0, 150)}\n`);
		}
		return;
	}
	let args = {};
	if (second) {
		try {
			args = JSON.parse(second.startsWith("@") ? fs.readFileSync(second.slice(1), "utf8") : second);
		} catch {
			fail("The arguments are not valid JSON.");
		}
	}
	const reply = await call({ tool: first, args });
	const folder = process.env.JEO_LIVE_IMAGES || path.join(require("node:os").tmpdir(), "jeo-live");
	process.stdout.write(`${JSON.stringify(saveImages(reply, folder))}\n`);
	process.exit(reply && reply.ok === false ? 1 : 0);
})();
