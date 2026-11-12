// JEO Editor MCP server.
// A tiny stdio bridge: Claude Code talks MCP to this script, and this script
// forwards each tool call to the running JEO Editor over its local control
// channel (127.0.0.1, token protected). No dependencies.

const http = require("node:http");
const readline = require("node:readline");

const PORT = Number(process.env.JEO_CONTROL_PORT || 0);
const TOKEN = process.env.JEO_CONTROL_TOKEN || "";

function control(payload) {
	return new Promise((resolve, reject) => {
		const body = JSON.stringify(payload);
		const request = http.request(
			{
				host: "127.0.0.1",
				port: PORT,
				path: "/call",
				method: "POST",
				headers: {
					"content-type": "application/json",
					"content-length": Buffer.byteLength(body),
					"x-jeo-token": TOKEN,
				},
			},
			(response) => {
				let data = "";
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					data += chunk;
				});
				response.on("end", () => {
					try {
						resolve(JSON.parse(data));
					} catch {
						reject(new Error(`Bad reply from JEO Editor: ${data.slice(0, 200)}`));
					}
				});
			},
		);
		request.on("error", () =>
			reject(new Error("JEO Editor is not running (control channel unreachable).")),
		);
		request.setTimeout(10 * 60 * 1000, () => request.destroy(new Error("JEO Editor timed out.")));
		request.end(body);
	});
}

function send(message) {
	process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
	const { id, method, params } = message;
	if (id === undefined || id === null) return; // notification: nothing to answer

	try {
		if (method === "initialize") {
			send({
				jsonrpc: "2.0",
				id,
				result: {
					protocolVersion: params?.protocolVersion || "2024-11-05",
					capabilities: { tools: {} },
					serverInfo: { name: "jeo-editor", version: "0.1.0" },
				},
			});
		} else if (method === "ping") {
			send({ jsonrpc: "2.0", id, result: {} });
		} else if (method === "tools/list") {
			const reply = await control({ list: true });
			send({ jsonrpc: "2.0", id, result: { tools: reply.tools || [] } });
		} else if (method === "tools/call") {
			const reply = await control({
				tool: params?.name,
				args: params?.arguments || {},
			});
			const content = [];
			if (reply.image) {
				content.push({ type: "image", data: reply.image, mimeType: "image/jpeg" });
			}
			content.push({
				type: "text",
				text: reply.ok
					? JSON.stringify(reply.result ?? { ok: true })
					: `Error: ${reply.error || "unknown error"}`,
			});
			send({ jsonrpc: "2.0", id, result: { content, isError: !reply.ok } });
		} else {
			send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method ${method}` } });
		}
	} catch (error) {
		send({
			jsonrpc: "2.0",
			id,
			result: {
				content: [{ type: "text", text: `Error: ${error.message}` }],
				isError: true,
			},
		});
	}
}

readline
	.createInterface({ input: process.stdin, terminal: false })
	.on("line", (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		try {
			void handle(JSON.parse(trimmed));
		} catch {
			// ignore lines that are not JSON
		}
	});
