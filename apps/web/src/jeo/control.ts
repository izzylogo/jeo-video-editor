/**
 * JEO control channel: the tools Claude uses to see and edit the timeline.
 *
 * The desktop app exposes these over a local MCP server. Every edit goes
 * through the editor's command system, so each one can be undone, by Claude
 * (`undo`) or by the user (Ctrl+Z).
 *
 * Units for Claude: seconds for time, pixels in the 1080x1440 frame for
 * positions (x right, y down, origin top-left).
 */
import { OPTIONS_PARAM, useTextOptions } from "./text-options";
import { EditorCore } from "@/core";
import { TracksSnapshotCommand } from "@/commands/timeline";
import type { InsertElementParams } from "@/commands/timeline/element/insert-element";
import type { SceneTracks, TimelineElement } from "@/timeline";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { getDesktopBridge } from "@/services/desktop/bridge";
import type { MediaAsset } from "@/media/types";
import { generateUUID } from "@/utils/id";
import { type MediaTime, TICKS_PER_SECOND } from "@/wasm";
import * as actions from "./actions";
import { JEO_ARROW, JEO_SPOTLIGHT } from "./graphics";
import { JEO_FLASH, JEO_SHAKE, JEO_SPLIT } from "./post-fx";

type Args = Record<string, unknown>;
export interface ToolResult {
	ok: boolean;
	result?: unknown;
	error?: string;
	/** base64 JPEG (no data: prefix) for tools that return a picture */
	image?: string;
}

const S = TICKS_PER_SECOND;

function editor(): EditorCore {
	return EditorCore.getInstance();
}

function num(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function round(value: number, digits = 3): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function canvasSize(): { width: number; height: number } {
	return (
		editor().project.getActive()?.settings.canvasSize ?? {
			width: 1080,
			height: 1440,
		}
	);
}

/** frame pixels (top-left origin) → the editor's centre-relative position */
function toPosition({ x, y }: { x: number; y: number }) {
	const { width, height } = canvasSize();
	return { px: x - width / 2, py: y - height / 2 };
}

function fromPosition({ px, py }: { px: number; py: number }) {
	const { width, height } = canvasSize();
	return { x: Math.round(px + width / 2), y: Math.round(py + height / 2) };
}

function requireTracks(): SceneTracks {
	const sceneTracks = actions.tracks();
	if (!sceneTracks) throw new Error("No project is open in the editor.");
	return sceneTracks;
}

function findElement({ id }: { id: string }) {
	const sceneTracks = requireTracks();
	for (const track of actions.allTracks(sceneTracks)) {
		const element = track.elements.find((item) => item.id === id);
		if (element) return { track, element: element as TimelineElement };
	}
	throw new Error(`No element with id ${id}. Call get_state for current ids.`);
}

function findVideoAsset({ name }: { name?: string }): MediaAsset {
	const videos = editor()
		.media.getAssets()
		.filter((asset) => asset.type === "video");
	const asset = name
		? videos.find((item) => item.name === name || item.id === name)
		: videos[0];
	if (!asset) {
		throw new Error(
			name
				? `No video named ${name} in the media panel.`
				: "No video in the media panel. Ask the user to import one.",
		);
	}
	return asset;
}

// ---------- reading ----------

function describeElement(element: TimelineElement) {
	const start = element.startTime / S;
	const base = {
		id: element.id,
		type: element.type,
		name: element.name,
		start: round(start),
		end: round(start + element.duration / S),
	};
	const params = "params" in element ? element.params : {};
	const position = fromPosition({
		px: num(params["transform.positionX"], 0),
		py: num(params["transform.positionY"], 0),
	});

	if (element.type === "text") {
		return {
			...base,
			text: str(params.content),
			x: position.x,
			y: position.y,
			size: num(params.fontSize, 4.2),
			triangle: params["tag.triangle"] === true,
			animated: Object.keys(element.animations ?? {}),
		};
	}
	if (element.type === "video") {
		const rate = element.retime?.rate ?? 1;
		const sourceIn = element.trimStart / S;
		return {
			...base,
			sourceIn: round(sourceIn),
			sourceOut: round(sourceIn + (element.duration / S) * rate),
			speed: rate,
			scale: num(params["transform.scaleX"], 1),
			x: position.x,
			y: position.y,
			muted: params.muted === true,
		};
	}
	if (element.type === "image" || element.type === "graphic") {
		return {
			...base,
			x: position.x,
			y: position.y,
			scale: num(params["transform.scaleX"], 1),
		};
	}
	return base;
}

function getState(): ToolResult {
	const project = editor().project.getActive();
	if (!project) return { ok: false, error: "No project is open in the editor." };
	const sceneTracks = requireTracks();
	const end = actions.getEndInfo();
	return {
		ok: true,
		result: {
			project: {
				name: project.metadata.name,
				width: project.settings.canvasSize.width,
				height: project.settings.canvasSize.height,
				fps: project.settings.fps.numerator / project.settings.fps.denominator,
				duration: round(actions.totalDuration() / S),
				durationTimecode: end.timecode,
				endsOn29: end.isOn29,
			},
			media: editor()
				.media.getAssets()
				.map((asset) => ({
					name: asset.name,
					type: asset.type,
					duration: asset.duration ? round(asset.duration) : undefined,
					width: asset.width,
					height: asset.height,
				})),
			mainTrack: sceneTracks.main.elements.map(describeElement),
			overlays: sceneTracks.overlay.flatMap((track) =>
				track.elements.map(describeElement),
			),
			audio: sceneTracks.audio.flatMap((track) =>
				track.elements.map(describeElement),
			),
		},
	};
}

/** Lays frames out as one labelled picture so several can be seen at once. */
async function contactSheet({
	times,
	draw,
	aspect,
}: {
	times: number[];
	draw: (args: {
		time: number;
		ctx: CanvasRenderingContext2D;
		x: number;
		y: number;
		width: number;
		height: number;
	}) => Promise<void>;
	aspect: number;
}): Promise<string> {
	const count = times.length;
	const columns = count <= 4 ? count : Math.ceil(count / 2);
	const rows = Math.ceil(count / columns);
	const tileWidth = count <= 2 ? 420 : count <= 4 ? 330 : 264;
	const tileHeight = Math.round(tileWidth * aspect);
	const label = 22;
	const sheet = document.createElement("canvas");
	sheet.width = columns * tileWidth;
	sheet.height = rows * (tileHeight + label);
	const ctx = sheet.getContext("2d");
	if (!ctx) throw new Error("Could not create a picture.");
	ctx.fillStyle = "#000000";
	ctx.fillRect(0, 0, sheet.width, sheet.height);
	ctx.font = "bold 15px sans-serif";
	ctx.textBaseline = "middle";

	for (let index = 0; index < count; index++) {
		const x = (index % columns) * tileWidth;
		const y = Math.floor(index / columns) * (tileHeight + label);
		ctx.fillStyle = "#ffff00";
		ctx.fillText(`${times[index].toFixed(2)} s`, x + 6, y + label / 2);
		await draw({
			time: times[index],
			ctx,
			x,
			y: y + label,
			width: tileWidth,
			height: tileHeight,
		});
	}
	return sheet.toDataURL("image/jpeg", 0.8).split(",")[1] ?? "";
}

function parseTimes({ args, max }: { args: Args; max: number }): number[] {
	const raw = Array.isArray(args.times) ? args.times : [];
	const times = raw
		.filter((value): value is number => typeof value === "number")
		.slice(0, max);
	if (times.length === 0) throw new Error("Give `times` as a list of seconds.");
	return times;
}

async function viewSource(args: Args): Promise<ToolResult> {
	const asset = findVideoAsset({ name: str(args.media) || undefined });
	const times = parseTimes({ args, max: 12 });
	const url = asset.url ?? URL.createObjectURL(asset.file);
	const video = document.createElement("video");
	video.muted = true;
	video.preload = "auto";
	video.src = url;
	await new Promise<void>((resolve, reject) => {
		video.addEventListener("loadeddata", () => resolve(), { once: true });
		video.addEventListener("error", () => reject(new Error("Video failed to load.")), { once: true });
	});
	const aspect = video.videoHeight / video.videoWidth;
	try {
		const image = await contactSheet({
			times,
			aspect,
			draw: async ({ time, ctx, x, y, width, height }) => {
				await new Promise<void>((resolve) => {
					video.addEventListener("seeked", () => resolve(), { once: true });
					video.currentTime = Math.max(
						0,
						Math.min(time, (video.duration || time) - 0.02),
					);
				});
				ctx.drawImage(video, x, y, width, height);
			},
		});
		return {
			ok: true,
			image,
			result: {
				media: asset.name,
				duration: round(video.duration),
				sourceWidth: video.videoWidth,
				sourceHeight: video.videoHeight,
				note: "Raw source frames, labelled with SOURCE time in seconds.",
			},
		};
	} finally {
		video.removeAttribute("src");
		video.load();
		if (!asset.url) URL.revokeObjectURL(url);
	}
}

async function viewTimeline(args: Args): Promise<ToolResult> {
	const project = editor().project.getActive();
	if (!project) return { ok: false, error: "No project is open." };
	const times = parseTimes({ args, max: 8 });
	// let the editor rebuild its render tree after recent edits
	await new Promise((resolve) => setTimeout(resolve, 250));
	const renderTree = editor().renderer.getRenderTree();
	if (!renderTree) return { ok: false, error: "The timeline is empty." };
	const { width, height } = project.settings.canvasSize;
	const renderer = new CanvasRenderer({ width, height, fps: project.settings.fps });
	const frame = document.createElement("canvas");
	frame.width = width;
	frame.height = height;
	const last = editor().timeline.getLastFrameTime();
	const image = await contactSheet({
		times,
		aspect: height / width,
		draw: async ({ time, ctx, x, y, width: tileWidth, height: tileHeight }) => {
			await renderer.renderToCanvas({
				node: renderTree,
				time: Math.min(actions.seconds(time), last),
				targetCanvas: frame,
			});
			ctx.drawImage(frame, x, y, tileWidth, tileHeight);
		},
	});
	return {
		ok: true,
		image,
		result: {
			note: `Frames of the EDIT at TIMELINE time. Each tile is the full ${width}x${height} frame; multiply tile positions up to place things.`,
		},
	};
}

// ---------- cutting ----------

function fillScale({ asset }: { asset: MediaAsset }): number {
	const { width, height } = canvasSize();
	if (!asset.width || !asset.height) return 1;
	const widthRatio = width / asset.width;
	const heightRatio = height / asset.height;
	return (
		Math.round(
			(Math.max(widthRatio, heightRatio) / Math.min(widthRatio, heightRatio)) *
				1000,
		) / 1000
	);
}

/**
 * Replaces the main track with pieces of the raw clip, in order. This is how
 * dead time is cut and clips are sped up. Texts and effects are left alone.
 */
function buildCut(args: Args): ToolResult {
	const before = requireTracks();
	const asset = findVideoAsset({ name: str(args.media) || undefined });
	const segments = Array.isArray(args.segments) ? (args.segments as Args[]) : [];
	if (segments.length === 0) {
		return { ok: false, error: "Give `segments`: [{ in, out, speed?, y? }]." };
	}
	const sourceDuration = actions.seconds(asset.duration ?? 0);
	const zoom = fillScale({ asset });
	// the clip keeps its own sound unless muting is asked for
	const muteOriginal = args.muteOriginal === true;
	const { height } = canvasSize();

	let cursor = 0;
	const elements: TimelineElement[] = [];
	for (const segment of segments) {
		const sourceIn = Math.max(0, num(segment.in, 0));
		const sourceOut = Math.min(asset.duration ?? Infinity, num(segment.out, 0));
		const speed = Math.min(4, Math.max(0.25, num(segment.speed, 1)));
		if (sourceOut - sourceIn < 0.05) {
			return { ok: false, error: `Segment ${sourceIn}–${sourceOut} is too short.` };
		}
		const duration = actions.seconds((sourceOut - sourceIn) / speed);
		const trimStart = Math.round(sourceIn * S);
		const element = {
			...buildElementFromMedia({
				mediaId: asset.id,
				mediaType: "video",
				name: asset.name,
				duration: sourceDuration,
				startTime: cursor as MediaTime,
			}),
			id: generateUUID(),
		} as Extract<TimelineElement, { type: "video" }>;
		element.duration = duration;
		element.trimStart = trimStart as MediaTime;
		element.trimEnd = Math.max(
			0,
			Math.round(sourceDuration - trimStart - duration * speed),
		) as MediaTime;
		if (speed !== 1) element.retime = { rate: speed, maintainPitch: false };
		const scale = num(segment.scale, zoom);
		element.params = {
			...element.params,
			muted: muteOriginal,
			"transform.scaleX": scale,
			"transform.scaleY": scale,
			"transform.positionX": num(segment.x, canvasSize().width / 2) - canvasSize().width / 2,
			"transform.positionY": num(segment.y, height / 2) - height / 2,
		};
		elements.push(element);
		cursor += duration;
	}

	const after: SceneTracks = {
		...before,
		main: { ...before.main, elements: elements as typeof before.main.elements },
	};
	editor().command.execute({ command: new TracksSnapshotCommand({ before, after }) });
	return {
		ok: true,
		result: {
			duration: round(cursor / S),
			clips: elements.map(describeElement),
			note: "Cuts are at each clip's start. Texts must start on these times.",
		},
	};
}

function setClip(args: Args): ToolResult {
	const { track, element } = findElement({ id: str(args.id) });
	if (!("params" in element)) return { ok: false, error: "That element has no framing." };
	const params = { ...element.params };
	const current = fromPosition({
		px: num(params["transform.positionX"], 0),
		py: num(params["transform.positionY"], 0),
	});
	const { px, py } = toPosition({
		x: num(args.x, current.x),
		y: num(args.y, current.y),
	});
	params["transform.positionX"] = px;
	params["transform.positionY"] = py;
	if (typeof args.scale === "number") {
		params["transform.scaleX"] = args.scale;
		params["transform.scaleY"] = args.scale;
	}
	if (typeof args.muted === "boolean") params.muted = args.muted;
	editor().timeline.updateElements({
		updates: [{ trackId: track.id, elementId: element.id, patch: { params } }],
	});
	return { ok: true, result: describeElement(findElement({ id: element.id }).element) };
}

// ---------- texts and tags ----------

const TEXT_KINDS: Record<
	string,
	{ y: number; size?: number; triangle?: boolean; x?: number }
> = {
	scene: { y: 720 },
	narrative: { y: 720 },
	quoted: { y: 720 },
	twist: { y: 720 },
	dialogue: { y: 780, x: 380 },
	speaker_name: { y: 668, size: 3.9 },
	speaker_action: { y: 746 },
	identity_tag: { y: 420, triangle: true },
	feeling_tag: { y: 390, size: 4.6 },
	custom: { y: 720 },
};

const POP_POINTS: actions.KeyPoint[] = [
	[0, 0.3],
	[0.1, 1.15],
	[0.2, 1],
];

function addText(args: Args): ToolResult {
	requireTracks();
	const kind = str(args.kind, "scene");
	const preset = TEXT_KINDS[kind];
	if (!preset) {
		return { ok: false, error: `Unknown kind. Use one of: ${Object.keys(TEXT_KINDS).join(", ")}.` };
	}
	const text = str(args.text).toUpperCase();
	if (!text) return { ok: false, error: "Give the words in `text`." };
	const start = actions.seconds(num(args.start, 0));
	const end = actions.seconds(num(args.end, num(args.start, 0) + 1.5));
	if (end <= start) return { ok: false, error: "`end` must be after `start`." };

	const { width } = canvasSize();
	const { px, py } = toPosition({
		x: num(args.x, preset.x ?? width / 2),
		y: num(args.y, preset.y),
	});
	const item: InsertElementParams = actions.textItem({
		content: text,
		start,
		durationSeconds: (end - start) / S,
		params: {
			"transform.positionX": px,
			"transform.positionY": py,
			...(typeof args.size === "number"
				? { fontSize: args.size }
				: preset.size
					? { fontSize: preset.size }
					: {}),
			...(preset.triangle ? { "tag.triangle": true } : {}),
		},
		animations:
			args.popup === true
				? {
						"transform.scaleX": actions.keys(POP_POINTS),
						"transform.scaleY": actions.keys(POP_POINTS),
					}
				: undefined,
	});
	actions.insertAll({ items: [item] });
	const added = requireTracks()
		.overlay.flatMap((track) => track.elements as TimelineElement[])
		.filter(
			(element) =>
				element.type === "text" &&
				element.params.content === text &&
				element.startTime === start,
		)
		.pop();
	return { ok: true, result: added ? describeElement(added as TimelineElement) : { added: true } };
}

function offerTextOptions(args: Args): ToolResult {
	const { element } = findElement({ id: str(args.id) });
	if (element.type !== "text") return { ok: false, error: "That id is not a text." };
	const options = (Array.isArray(args.options) ? args.options : [])
		.filter((item): item is string => typeof item === "string" && item.trim() !== "")
		.map((item) => item.trim().toUpperCase());
	if (options.length === 0) return { ok: false, error: "Give at least one option." };
	useTextOptions.getState().setOptions({ elementId: element.id, options });
	// also on the text itself, so the options are saved with the project
	const { track } = findElement({ id: element.id });
	editor().timeline.updateElements({
		updates: [
			{
				trackId: track.id,
				elementId: element.id,
				patch: { params: { ...element.params, [OPTIONS_PARAM]: JSON.stringify(options) } },
			},
		],
		pushHistory: false,
	});
	return { ok: true, result: { offered: options.length, on: element.id } };
}

function updateElement(args: Args): ToolResult {
	const { track, element } = findElement({ id: str(args.id) });
	const patch: Partial<TimelineElement> = {};
	const startSeconds = num(args.start, element.startTime / S);
	const endSeconds = num(args.end, (element.startTime + element.duration) / S);
	if (typeof args.start === "number" || typeof args.end === "number") {
		const start = actions.seconds(startSeconds);
		const end = actions.seconds(endSeconds);
		if (end <= start) return { ok: false, error: "`end` must be after `start`." };
		patch.startTime = start;
		patch.duration = (end - start) as MediaTime;
	}
	if ("params" in element) {
		const params = { ...element.params };
		if (element.type === "text" && typeof args.text === "string") {
			params.content = args.text.toUpperCase();
		}
		if (typeof args.size === "number") params.fontSize = args.size;
		if (typeof args.x === "number" || typeof args.y === "number") {
			const current = fromPosition({
				px: num(params["transform.positionX"], 0),
				py: num(params["transform.positionY"], 0),
			});
			const { px, py } = toPosition({
				x: num(args.x, current.x),
				y: num(args.y, current.y),
			});
			params["transform.positionX"] = px;
			params["transform.positionY"] = py;
		}
		if (typeof args.scale === "number") {
			params["transform.scaleX"] = args.scale;
			params["transform.scaleY"] = args.scale;
		}
		if (typeof args.rotation === "number") params["transform.rotate"] = args.rotation;
		patch.params = params;
	}
	editor().timeline.updateElements({
		updates: [{ trackId: track.id, elementId: element.id, patch }],
	});
	if (args.popup === true && element.type === "text") {
		editor().timeline.upsertKeyframes({
			keyframes: (["transform.scaleX", "transform.scaleY"] as const).flatMap(
				(propertyPath) =>
					POP_POINTS.map(([at, value]) => ({
						trackId: track.id,
						elementId: element.id,
						propertyPath,
						time: actions.seconds(at),
						value,
					})),
			),
		});
	}
	return { ok: true, result: describeElement(findElement({ id: element.id }).element) };
}

function deleteElements(args: Args): ToolResult {
	const ids = Array.isArray(args.ids) ? args.ids.map(String) : [];
	if (ids.length === 0) return { ok: false, error: "Give `ids`: a list of element ids." };
	const refs = ids.map((id) => {
		const { track, element } = findElement({ id });
		return { trackId: track.id, elementId: element.id };
	});
	editor().timeline.deleteElements({ elements: refs });
	return { ok: true, result: { deleted: refs.length } };
}

function clearOverlays(): ToolResult {
	const before = requireTracks();
	const count =
		before.overlay.reduce((total, track) => total + track.elements.length, 0) +
		before.audio.reduce((total, track) => total + track.elements.length, 0);
	if (count === 0) return { ok: true, result: { deleted: 0 } };
	editor().command.execute({
		command: new TracksSnapshotCommand({
			before,
			after: { ...before, overlay: [], audio: [] },
		}),
	});
	return { ok: true, result: { deleted: count } };
}

// ---------- style actions ----------

function at(args: Args): void {
	editor().playback.seek({ time: actions.seconds(num(args.at, 0)) });
}

async function addFreeze(args: Args): Promise<ToolResult> {
	at(args);
	const outcome = await actions.addFreeze({ holdSeconds: num(args.seconds, 2) });
	if (!outcome.ok) return { ok: false, error: outcome.message };
	const start = actions.seconds(num(args.at, 0));
	const still = requireTracks().main.elements.find(
		(element) => element.type === "image" && element.startTime === start,
	);
	if (still && typeof args.y === "number") {
		setClip({ id: still.id, y: args.y });
	}
	return {
		ok: true,
		result: {
			freeze: still ? describeElement(findElement({ id: still.id }).element) : null,
			note: "Everything after the freeze moved later by its length. Call get_state for new times.",
		},
	};
}

function addEffect(args: Args): ToolResult {
	const kind = str(args.kind);
	const map: Record<string, { type: string; name: string; seconds: number; params?: Record<string, string> }> = {
		flash: { type: JEO_FLASH, name: "Colour flash", seconds: 0.2 },
		red_flash: { type: JEO_FLASH, name: "Red flash", seconds: 0.2, params: { color: "#ff1e1e" } },
		blur_shake: { type: JEO_SHAKE, name: "Blur shake", seconds: 0.3 },
		colour_split: { type: JEO_SPLIT, name: "Colour split", seconds: 1 },
	};
	// transitions sit across the cut nearest to `at`
	if (kind.startsWith("transition_")) {
		const style = kind.slice("transition_".length);
		if (!["black", "white", "blur", "zoom", "shake", "glare"].includes(style)) {
			return { ok: false, error: "Unknown transition. Use transition_black, _white, _blur, _zoom, _shake or _glare." };
		}
		const outcome = actions.addTransition({
			style: style as actions.TransitionStyle,
			at: actions.seconds(num(args.at, 0)),
			lengthSeconds: num(args.seconds, 0.4),
		});
		return outcome.ok
			? { ok: true, result: { added: outcome.message } }
			: { ok: false, error: outcome.message };
	}
	const extraKey = kind.replace(/_/g, "-");
	if (extraKey in actions.EXTRA_EFFECTS) {
		const extra = actions.EXTRA_EFFECTS[extraKey as actions.ExtraEffectKind];
		actions.insertAll({
			items: [
				actions.effectItem({
					effectType: extra.type,
					name: extra.name,
					start: actions.seconds(num(args.at, 0)),
					duration: actions.seconds(num(args.seconds, extra.seconds)),
					params: "params" in extra ? { ...extra.params } : {},
				}),
			],
		});
		return { ok: true, result: { added: extra.name, at: num(args.at, 0) } };
	}
	const preset = map[kind];
	if (!preset) return { ok: false, error: `Unknown kind. Use: ${Object.keys(map).join(", ")}, zoom_punch, slow_zoom, shake, glitch, blur, dark_edges, black_white, old_film, vivid, cold, darker, transition_black, transition_white, transition_blur, transition_zoom, transition_shake, transition_glare.` };
	requireTracks();
	actions.insertAll({
		items: [
			actions.effectItem({
				effectType: preset.type,
				name: preset.name,
				start: actions.seconds(num(args.at, 0)),
				duration: actions.seconds(num(args.seconds, preset.seconds)),
				params: preset.params,
			}),
		],
	});
	return { ok: true, result: { added: preset.name, at: num(args.at, 0) } };
}

function addArrow(args: Args): ToolResult {
	requireTracks();
	const start = actions.seconds(num(args.start, 0));
	const durationSeconds = Math.max(0.2, num(args.end, num(args.start, 0) + 2) - num(args.start, 0));
	const { width, height } = canvasSize();
	const items: InsertElementParams[] = [];
	const spotlight = args.spotlight as Args | undefined;
	if (spotlight && typeof spotlight === "object") {
		items.push(
			actions.graphicItem({
				definitionId: JEO_SPOTLIGHT,
				name: "Spotlight",
				start,
				durationSeconds,
				params: {
					"transform.scaleX": 1,
					"transform.scaleY": height / width,
					holeX: ((num(spotlight.x, width / 2) - width / 2) / width) * 100,
					holeY: ((num(spotlight.y, height / 2) - height / 2) / height) * 100,
					radius: num(spotlight.radius, 24),
				},
			}),
		);
	}
	const { px, py } = toPosition({ x: num(args.x, width / 2), y: num(args.y, height / 2) });
	items.push(
		actions.graphicItem({
			definitionId: JEO_ARROW,
			name: "Arrow",
			start,
			durationSeconds,
			params: {
				"transform.scaleX": num(args.scale, 0.2),
				"transform.scaleY": num(args.scale, 0.2),
				"transform.positionX": px,
				"transform.positionY": py,
				"transform.rotate": num(args.rotation, 0),
			},
		}),
	);
	actions.insertAll({ items });
	return { ok: true, result: { added: items.length } };
}

async function addEnding(args: Args): Promise<ToolResult> {
	at(args);
	const kind = str(args.kind, "funny") === "sweet" ? "sweet" : "funny";
	const outcome = await actions.addEnding({ kind });
	return outcome.ok
		? { ok: true, result: { message: outcome.message, end: actions.getEndInfo() } }
		: { ok: false, error: outcome.message };
}

async function addAudio(args: Args): Promise<ToolResult> {
	const files = await actions.listAssetFiles();
	const file = files.find(
		(item) => item.name === str(args.name) && item.kind !== "emoji",
	);
	if (!file) {
		return {
			ok: false,
			error: `No such file. Available: ${
				files
					.filter((item) => item.kind !== "emoji")
					.map((item) => `${item.kind}/${item.name}`)
					.join(", ") || "none (the assets folders are empty)"
			}`,
		};
	}
	if (file.kind !== "music") at(args);
	const outcome = await actions.addLibraryAudio({ file, rate: num(args.speed, 1) });
	return outcome.ok
		? { ok: true, result: { message: outcome.message } }
		: { ok: false, error: outcome.message };
}

// ---------- auto-follow ----------

/**
 * Makes a tag follow what is under it (usually a head): tracks the picture
 * just below the tag through its clip and writes position keyframes.
 */
export async function followHead(args: Args): Promise<ToolResult> {
	const desktop = getDesktopBridge();
	const project = editor().project.getActive();
	if (!desktop || !project) {
		return { ok: false, error: "Auto-follow needs the JEO Editor desktop app." };
	}
	const { track, element } = findElement({ id: str(args.id) });
	if (!("params" in element) || element.type === "audio" || element.type === "effect") {
		return { ok: false, error: "Pick a text, tag or arrow to follow." };
	}
	const sceneTracks = requireTracks();
	const tagStart = element.startTime;
	const clip = sceneTracks.main.elements.find(
		(item) => tagStart >= item.startTime && tagStart < item.startTime + item.duration,
	);
	if (!clip || clip.type !== "video") {
		return {
			ok: false,
			error: "The tag must start on a moving video clip (not on a freeze).",
		};
	}
	const asset = editor()
		.media.getAssets()
		.find((item) => item.id === clip.mediaId);
	if (!asset?.width || !asset.height) return { ok: false, error: "Clip file is missing." };

	const { width, height } = canvasSize();
	const containScale = Math.min(width / asset.width, height / asset.height);
	const clipScale = num(clip.params["transform.scaleX"], 1);
	const pixelScale = containScale * clipScale;
	const clipX = num(clip.params["transform.positionX"], 0);
	const clipY = num(clip.params["transform.positionY"], 0);
	const tagX = num(element.params["transform.positionX"], 0);
	const tagY = num(element.params["transform.positionY"], 0);
	// the thing to follow sits a little below the tag's middle
	const offsetBelow = num(args.offsetBelow, 110);
	const toSource = ({ px, py }: { px: number; py: number }) => ({
		x: asset.width! / 2 + (px - clipX) / pixelScale,
		y: asset.height! / 2 + (py - clipY) / pixelScale,
	});
	const anchor = toSource({ px: tagX, py: tagY + offsetBelow });

	const rate = clip.retime?.rate ?? 1;
	const followEnd = Math.min(
		tagStart + element.duration,
		clip.startTime + clip.duration,
	);
	const sourceStart = (clip.trimStart + (tagStart - clip.startTime) * rate) / S;
	const sourceEnd = (clip.trimStart + (followEnd - clip.startTime) * rate) / S;
	if (sourceEnd - sourceStart < 0.1) {
		return { ok: false, error: "The tag is too short to follow anything." };
	}

	const tracked = await desktop.trackPoint({
		projectId: project.metadata.id,
		mediaId: asset.id,
		start: sourceStart,
		end: sourceEnd,
		x: anchor.x,
		y: anchor.y,
		box: Math.max(40, 150 / pixelScale),
	});
	if (!tracked.ok || tracked.points.length < 2) {
		return { ok: false, error: tracked.error ?? "Tracking found nothing to follow." };
	}

	// a keyframe about every 3 frames is smooth and still easy to edit by hand
	const step = Math.max(1, Math.round(tracked.points.length / Math.max(2, ((sourceEnd - sourceStart) / rate) * 10)));
	const chosen = tracked.points.filter(
		(_point, index) => index % step === 0 || index === tracked.points.length - 1,
	);
	const keyframes = chosen.flatMap((point) => {
		const local = actions.seconds((point.t - sourceStart) / rate);
		return [
			{
				trackId: track.id,
				elementId: element.id,
				propertyPath: "transform.positionX",
				time: local,
				value: Math.round(tagX + point.dx * pixelScale),
			},
			{
				trackId: track.id,
				elementId: element.id,
				propertyPath: "transform.positionY",
				time: local,
				value: Math.round(tagY + point.dy * pixelScale),
			},
		];
	});
	editor().timeline.upsertKeyframes({ keyframes });
	const last = chosen[chosen.length - 1];
	return {
		ok: true,
		result: {
			keyframes: chosen.length,
			movedBy: {
				x: Math.round(last.dx * pixelScale),
				y: Math.round(last.dy * pixelScale),
			},
			note: "Position keyframes written. They can be dragged by hand.",
		},
	};
}

// ---------- misc ----------

function undo(args: Args): ToolResult {
	const steps = Math.min(50, Math.max(1, Math.round(num(args.steps, 1))));
	let done = 0;
	for (let index = 0; index < steps; index++) {
		if (!editor().command.canUndo()) break;
		editor().command.undo();
		done += 1;
	}
	return { ok: true, result: { undone: done } };
}

async function exportVideo(): Promise<ToolResult> {
	const project = editor().project.getActive();
	if (!project) return { ok: false, error: "No project is open." };
	const outcome = await editor().project.export({
		options: { format: "mp4", quality: "high", includeAudio: true },
	});
	editor().project.clearExportState();
	if (!outcome.success || !outcome.buffer) {
		return { ok: false, error: outcome.error ?? "Export failed." };
	}
	const link = document.createElement("a");
	link.href = URL.createObjectURL(new Blob([outcome.buffer], { type: "video/mp4" }));
	link.download = `${project.metadata.name}.mp4`;
	link.click();
	return {
		ok: true,
		result: { saved: `JEO Video Editor\\output\\${project.metadata.name}.mp4 (or _v2, _v3… if it existed)` },
	};
}

// ---------- tool table ----------

type Handler = (args: Args) => ToolResult | Promise<ToolResult>;

interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	handler: Handler;
}

const number = { type: "number" };
const string = { type: "string" };
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
	type: "object",
	properties,
	required,
});

const TOOLS: ToolDefinition[] = [
	{
		name: "get_state",
		description:
			"Read the whole edit: project size/length, media, main-track clips (with source in/out, speed, framing), every text/tag/effect with its id, time and position. Call it before editing and after anything that shifts time.",
		inputSchema: schema({}),
		handler: getState,
	},
	{
		name: "view_source",
		description:
			"Look at the RAW clip: returns one picture with up to 12 frames at the given SOURCE times (seconds). Use it to learn what happens when, before cutting.",
		inputSchema: schema({ times: { type: "array", items: number }, media: string }, ["times"]),
		handler: viewSource,
	},
	{
		name: "view_timeline",
		description:
			"Look at the EDIT: returns one picture with up to 8 rendered frames at the given TIMELINE times (seconds), with texts and effects. Use it to check tag positions and framing.",
		inputSchema: schema({ times: { type: "array", items: number } }, ["times"]),
		handler: viewTimeline,
	},
	{
		name: "build_cut",
		description:
			"Replace the main video track with pieces of the raw clip, in order. segments: [{in, out, speed?, y?}] in SOURCE seconds; speed 1.01–1.05 after cutting; y is the picture's vertical position in the 1440-high frame (720 = centred; larger moves the picture down). The clip is auto-zoomed to fill. The clip keeps its own sound; pass muteOriginal=true only when the user wants it silent (for example once music is added). Texts and effects are not touched.",
		inputSchema: schema(
			{
				segments: {
					type: "array",
					items: schema({ in: number, out: number, speed: number, y: number, x: number, scale: number }, ["in", "out"]),
				},
				media: string,
				muteOriginal: { type: "boolean" },
			},
			["segments"],
		),
		handler: buildCut,
	},
	{
		name: "set_clip",
		description:
			"Re-frame one main-track clip or freeze: x/y move the picture (frame pixels, 540/720 = centred), scale zooms. Use it so the person stays in view and the head sits under a tag.",
		inputSchema: schema({ id: string, x: number, y: number, scale: number, muted: { type: "boolean" } }, ["id"]),
		handler: setClip,
	},
	{
		name: "add_freeze",
		description:
			"Insert a freeze frame at TIMELINE time `at` (default 2.0 s long). Everything after it moves later. Optional y re-frames the frozen picture. The intro freeze is at 1.333 s.",
		inputSchema: schema({ at: number, seconds: number, y: number }, ["at"]),
		handler: addFreeze,
	},
	{
		name: "add_text",
		description:
			"Add a text in JEO style (LEMON MILK Bold, white, outline; words are upper-cased). kind: scene (*ACTION*), narrative, quoted (\"BEAT\"), twist, dialogue, speaker_name (small NAME:), speaker_action, identity_tag (label with ▼, on the head), feeling_tag (*FEELING*, above the head), custom. start/end in TIMELINE seconds; a text must start exactly on its scene's cut. x/y = centre of the text in frame pixels (captions default to the centre 540,720). popup=true makes it pop in. Write the asterisks or quote marks yourself.",
		inputSchema: schema(
			{ kind: string, text: string, start: number, end: number, x: number, y: number, size: number, popup: { type: "boolean" } },
			["kind", "text", "start", "end"],
		),
		handler: addText,
	},
	{
		name: "update_element",
		description:
			"Change an existing element by id: text, start, end, x, y, size (texts), scale, rotation, popup.",
		inputSchema: schema(
			{ id: string, text: string, start: number, end: number, x: number, y: number, size: number, scale: number, rotation: number, popup: { type: "boolean" } },
			["id"],
		),
		handler: updateElement,
	},
	{
		name: "offer_text_options",
		description:
			"Offer the user other wordings for ONE existing text, without changing the edit. They appear as one-click choices on that text (right-click menu and its settings). Use it when the user asks for options/alternatives for a part. Give 3 to 5 options that fit the storyline and the JEO style (short, upper-case, same kind of line as the original).",
		inputSchema: schema(
			{ id: string, options: { type: "array", items: { type: "string" } } },
			["id", "options"],
		),
		handler: offerTextOptions,
	},
	{
		name: "delete_elements",
		description: "Delete elements by id.",
		inputSchema: schema({ ids: { type: "array", items: string } }, ["ids"]),
		handler: deleteElements,
	},
	{
		name: "clear_overlays",
		description: "Remove every text, tag, effect, emoji and sound (keeps the video cut). One undo restores them.",
		inputSchema: schema({}),
		handler: clearOverlays,
	},
	{
		name: "add_effect",
		description:
			"Add an effect at TIMELINE time `at`: flash (C.F, on a reaction), red_flash (angry moment), blur_shake, colour_split; motion: zoom_punch, slow_zoom, shake, glitch, blur; looks: black_white, old_film, vivid, cold, darker, dark_edges; transitions across the cut nearest to `at`: transition_black, transition_white, transition_glare, transition_blur, transition_zoom, transition_shake. Optional seconds. Use the extra ones sparingly: the JEO style is plain cuts, flashes and the ending.",
		inputSchema: schema({ kind: string, at: number, seconds: number }, ["kind", "at"]),
		handler: addEffect,
	},
	{
		name: "add_arrow",
		description:
			"Add the curved ↗ arrow (points up-right by default; rotation in degrees turns it). x/y = its centre in frame pixels. spotlight {x,y,radius?} adds a dark vignette with a light spot on an object.",
		inputSchema: schema(
			{ start: number, end: number, x: number, y: number, rotation: number, scale: number, spotlight: schema({ x: number, y: number, radius: number }) },
			["start", "end", "x", "y"],
		),
		handler: addArrow,
	},
	{
		name: "add_ending",
		description:
			"Build the ending from the last cut at TIMELINE time `at` to the end: blurry shake → emoji fades in and grows → colour split. kind: funny (😂) or sweet (❤️). Add the closing line as a text yourself. Then call end_on_29.",
		inputSchema: schema({ kind: string, at: number }, ["kind", "at"]),
		handler: addEnding,
	},
	{
		name: "end_on_29",
		description: "Make the video end on a :29 frame. direction: trim (shorter) or extend (longer, needs spare footage).",
		inputSchema: schema({ direction: string }, ["direction"]),
		handler: (args) => {
			const outcome = actions.endOn29({
				direction: str(args.direction) === "extend" ? "extend" : "trim",
			});
			return outcome.ok
				? { ok: true, result: { message: outcome.message, end: actions.getEndInfo() } }
				: { ok: false, error: outcome.message };
		},
	},
	{
		name: "snap_texts_to_cuts",
		description: "Move every text whose start or end is within 0.35 s of a cut exactly onto that cut.",
		inputSchema: schema({}),
		handler: () => {
			const outcome = actions.snapTextsToCuts();
			return outcome.ok
				? { ok: true, result: { message: outcome.message } }
				: { ok: false, error: outcome.message };
		},
	},
	{
		name: "follow_head",
		description:
			"Make a tag (by id) follow the person under it: tracks the picture just below the tag through its clip and writes position keyframes. Place the tag on the head at its first frame first. Only works on moving video, not on a freeze.",
		inputSchema: schema({ id: string, offsetBelow: number }, ["id"]),
		handler: followHead,
	},
	{
		name: "list_audio",
		description: "List the user's music and sound-effect files (assets folder).",
		inputSchema: schema({}),
		handler: async () => ({
			ok: true,
			result: (await actions.listAssetFiles())
				.filter((file) => file.kind !== "emoji")
				.map((file) => ({ kind: file.kind, name: file.name })),
		}),
	},
	{
		name: "add_audio",
		description:
			"Add a file from list_audio by name. Music starts at 0 and is cut to the video (speed e.g. 0.8 = slowed). A sound effect lands at TIMELINE time `at`.",
		inputSchema: schema({ name: string, at: number, speed: number }, ["name"]),
		handler: addAudio,
	},
	{
		name: "undo",
		description: "Undo the last edit(s). steps defaults to 1.",
		inputSchema: schema({ steps: number }),
		handler: undo,
	},
	{
		name: "export_video",
		description: "Export the edit as an MP4 into the output folder. Only when the user asks for it.",
		inputSchema: schema({}),
		handler: exportVideo,
	},
];

export function listTools() {
	return TOOLS.map(({ name, description, inputSchema }) => ({
		name,
		description,
		inputSchema,
	}));
}

export async function callTool({
	name,
	args,
}: {
	name: string;
	args?: Args;
}): Promise<ToolResult> {
	const tool = TOOLS.find((item) => item.name === name);
	if (!tool) return { ok: false, error: `Unknown tool ${name}.` };
	try {
		return await tool.handler(args ?? {});
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}
