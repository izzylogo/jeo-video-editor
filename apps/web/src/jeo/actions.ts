/**
 * JEO style actions: everything the Captions / Tags / Freeze / Effects /
 * Endings / Audio panels do. Each action goes through the editor's command
 * system, so it can be undone, and Claude will call these same functions in
 * Phase 3.
 *
 * Numbers come from `style/your-style.md` and `tools/build_hiding_money.py`.
 */
import { EditorCore } from "@/core";
import { BatchCommand } from "@/commands";
import { InsertElementCommand, TracksSnapshotCommand } from "@/commands/timeline";
import type { InsertElementParams } from "@/commands/timeline/element/insert-element";
import type {
	CreateTimelineElement,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
} from "@/timeline";
import {
	buildEffectElement,
	buildElementFromMedia,
	buildGraphicElement,
	buildTextElement,
} from "@/timeline/element-utils";
import { DEFAULTS } from "@/timeline/defaults";
import { processMediaAssets } from "@/media/processing";
import type { MediaAsset } from "@/media/types";
import { getDesktopBridge, type JeoAssetFile } from "@/services/desktop/bridge";
import { generateUUID } from "@/utils/id";
import { type MediaTime, TICKS_PER_SECOND } from "@/wasm";
import { JEO_FLASH, JEO_SHAKE, JEO_SPLIT } from "./post-fx";
import { JEO_ARROW, JEO_SPOTLIGHT } from "./graphics";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

// ---------- time helpers ----------

function editor(): EditorCore {
	return EditorCore.getInstance();
}

function frameTicks(): number {
	const fps = editor().project.getActive()?.settings.fps ?? {
		numerator: 30,
		denominator: 1,
	};
	return Math.round((TICKS_PER_SECOND * fps.denominator) / fps.numerator);
}

function toTime(ticks: number): MediaTime {
	return Math.round(ticks) as MediaTime;
}

/** seconds → ticks, landing exactly on a frame */
function seconds(value: number): MediaTime {
	const frame = frameTicks();
	return toTime(Math.round((value * TICKS_PER_SECOND) / frame) * frame);
}

function snapToFrame(ticks: number): MediaTime {
	const frame = frameTicks();
	return toTime(Math.round(ticks / frame) * frame);
}

function playhead(): MediaTime {
	return snapToFrame(editor().playback.getCurrentTime());
}

function totalDuration(): MediaTime {
	return editor().timeline.getTotalDuration();
}

function tracks(): SceneTracks | null {
	return editor().scenes.getActiveSceneOrNull()?.tracks ?? null;
}

function allTracks(sceneTracks: SceneTracks): TimelineTrack[] {
	return [...sceneTracks.overlay, sceneTracks.main, ...sceneTracks.audio];
}

type KeyPoint = [atSeconds: number, value: number];

/** Linear keyframes for one number property (time is from the element start). */
function keys(points: KeyPoint[]) {
	return {
		keys: points.map(([at, value]) => ({
			id: generateUUID(),
			time: seconds(at),
			value,
			segmentToNext: "linear" as const,
			tangentMode: "flat" as const,
		})),
	};
}

function insertAll({ items }: { items: InsertElementParams[] }): void {
	if (items.length === 0) return;
	const commands = items.map((item) => new InsertElementCommand(item));
	editor().command.execute({
		command: commands.length === 1 ? commands[0] : new BatchCommand(commands),
	});
}

// ---------- captions ----------

export type CaptionPreset =
	| "scene"
	| "narrative"
	| "quoted"
	| "dialogue"
	| "speaker"
	| "twist-but-then"
	| "twist-until";

export const CAPTION_PRESETS: Array<{
	id: CaptionPreset;
	label: string;
	sample: string;
	hint: string;
}> = [
	{ id: "scene", label: "Scene text", sample: "*OPENS IT*", hint: "On-screen action, centre. 1–4 words." },
	{ id: "narrative", label: "Narrative", sample: "EVERYONE\nRUSHES TO HIDE", hint: "Tells the story, centre, 2 lines. Up to 7 words." },
	{ id: "quoted", label: "Quoted beat", sample: "\"BUSTED\"", hint: "Short label for a story beat, centre." },
	{ id: "dialogue", label: "Dialogue", sample: "STOP THAT", hint: "Spoken words, no quotes. Drag it next to the speaker." },
	{ id: "speaker", label: "Speaker + action", sample: "TEACHER:\n*COUGHS*", hint: "Small name over a big action, centre." },
	{ id: "twist-but-then", label: "Twist line", sample: "BUT THEN...", hint: "The turn before the payoff. About 1.3 s." },
	{ id: "twist-until", label: "Twist line", sample: "UNTIL...", hint: "The turn before the payoff. About 1.3 s." },
];

const SMALL_TEXT_SIZE = 3.0;
const TAG_TEXT_SIZE = 3.5;

function textItem({
	content,
	start,
	durationSeconds,
	params = {},
	name,
	animations,
}: {
	content: string;
	start: MediaTime;
	durationSeconds: number;
	params?: Record<string, string | number | boolean>;
	name?: string;
	animations?: Record<string, ReturnType<typeof keys>>;
}): InsertElementParams {
	const element = buildTextElement({
		raw: {
			...DEFAULTS.text.element,
			name: name ?? content.replace(/\n/g, " ").slice(0, 24),
			duration: seconds(durationSeconds),
			params: { ...DEFAULTS.text.element.params, content, ...params },
		},
		startTime: start,
	});
	if (animations) {
		(element as { animations?: unknown }).animations = animations;
	}
	return { element, placement: { mode: "auto", trackType: "text" } };
}

export function addCaption({ preset }: { preset: CaptionPreset }): ActionResult {
	if (!tracks()) return fail("Open a project first.");
	const start = playhead();
	const items: InsertElementParams[] = [];

	switch (preset) {
		case "scene":
			items.push(textItem({ content: "*ACTION*", start, durationSeconds: 1.5 }));
			break;
		case "narrative":
			items.push(textItem({ content: "FIRST LINE\nSECOND LINE", start, durationSeconds: 2 }));
			break;
		case "quoted":
			items.push(textItem({ content: "\"BEAT\"", start, durationSeconds: 1.2 }));
			break;
		case "dialogue":
			items.push(
				textItem({
					content: "WORDS",
					start,
					durationSeconds: 1.2,
					params: { "transform.positionX": -160, "transform.positionY": 60 },
				}),
			);
			break;
		case "speaker":
			items.push(
				textItem({
					content: "*ACTION*",
					start,
					durationSeconds: 1.5,
					params: { "transform.positionY": 26 },
				}),
				textItem({
					content: "NAME:",
					start,
					durationSeconds: 1.5,
					params: { fontSize: SMALL_TEXT_SIZE, "transform.positionY": -52 },
				}),
			);
			break;
		case "twist-but-then":
			items.push(textItem({ content: "BUT THEN...", start, durationSeconds: 1.3 }));
			break;
		case "twist-until":
			items.push(textItem({ content: "UNTIL...", start, durationSeconds: 1.3 }));
			break;
	}

	insertAll({ items });
	return ok("Caption added. Type your words on the right.");
}

// ---------- tags ----------

export type TagPreset =
	| "identity"
	| "feeling"
	| "arrow"
	| "arrow-phrase"
	| "arrow-spotlight";

export const TAG_PRESETS: Array<{
	id: TagPreset;
	label: string;
	sample: string;
	hint: string;
}> = [
	{ id: "identity", label: "▼ Identity tag", sample: "HUSBAND ▼", hint: "1–2 word label on the head. Use when the label adds emotional depth." },
	{ id: "feeling", label: "Feeling tag", sample: "*SCARED*", hint: "A feeling, above the head." },
	{ id: "arrow", label: "↗ Arrow", sample: "↗", hint: "Points at an object. Rotate and drag it." },
	{ id: "arrow-phrase", label: "↗ Arrow + phrase", sample: "HE IS TRAPPED ↗", hint: "A longer phrase (2+ words) instead of a ▼ label." },
	{ id: "arrow-spotlight", label: "↗ Arrow + spotlight", sample: "◐ ↗", hint: "Dark spotlight on an object, with the arrow. For a freeze." },
];

function graphicItem({
	definitionId,
	name,
	start,
	durationSeconds,
	params,
}: {
	definitionId: string;
	name: string;
	start: MediaTime;
	durationSeconds: number;
	params: Record<string, string | number | boolean>;
}): InsertElementParams {
	const element = buildGraphicElement({ definitionId, name, startTime: start, params });
	element.duration = seconds(durationSeconds);
	return { element, placement: { mode: "auto", trackType: "graphic" } };
}

export function addTag({ preset }: { preset: TagPreset }): ActionResult {
	if (!tracks()) return fail("Open a project first.");
	const start = playhead();
	const items: InsertElementParams[] = [];
	const arrow = (x: number, y: number) =>
		graphicItem({
			definitionId: JEO_ARROW,
			name: "Arrow",
			start,
			durationSeconds: 2,
			params: {
				"transform.scaleX": 0.2,
				"transform.scaleY": 0.2,
				"transform.positionX": x,
				"transform.positionY": y,
			},
		});

	switch (preset) {
		case "identity":
			items.push(
				textItem({
					content: "LABEL",
					start,
					durationSeconds: 2,
					params: { "tag.triangle": true, "transform.positionY": -300 },
				}),
			);
			break;
		case "feeling":
			items.push(
				textItem({
					content: "*FEELING*",
					start,
					durationSeconds: 1.5,
					params: { fontSize: TAG_TEXT_SIZE, "transform.positionY": -330 },
				}),
			);
			break;
		case "arrow":
			items.push(arrow(0, 0));
			break;
		case "arrow-phrase":
			items.push(
				arrow(130, -40),
				textItem({
					content: "HE IS TRAPPED",
					start,
					durationSeconds: 2,
					params: { "transform.positionX": -120, "transform.positionY": 110 },
				}),
			);
			break;
		case "arrow-spotlight":
			items.push(
				graphicItem({
					definitionId: JEO_SPOTLIGHT,
					name: "Spotlight",
					start,
					durationSeconds: 2,
					params: { "transform.scaleX": 1, "transform.scaleY": 1.3334 },
				}),
				arrow(-130, 130),
			);
			break;
	}

	insertAll({ items });
	return ok("Tag added. Drag it onto the head or the object.");
}

// ---------- effects ----------

function selectedTextRefs(): Array<{ trackId: string; elementId: string }> {
	const sceneTracks = tracks();
	if (!sceneTracks) return [];
	return editor()
		.selection.getSelectedElements()
		.filter(({ trackId, elementId }) => {
			const track = allTracks(sceneTracks).find((item) => item.id === trackId);
			return track?.elements.some(
				(element) => element.id === elementId && element.type === "text",
			);
		});
}

/** (POP UP): scale 30% → 115% → 100% over 0.2 s, on the selected texts. */
export function addPopUp(): ActionResult {
	const refs = selectedTextRefs();
	if (refs.length === 0) return fail("Select a text on the timeline first.");
	const points: KeyPoint[] = [
		[0, 0.3],
		[0.1, 1.15],
		[0.2, 1],
	];
	editor().timeline.upsertKeyframes({
		keyframes: refs.flatMap(({ trackId, elementId }) =>
			(["transform.scaleX", "transform.scaleY"] as const).flatMap((propertyPath) =>
				points.map(([at, value]) => ({
					trackId,
					elementId,
					propertyPath,
					time: seconds(at),
					value,
				})),
			),
		),
	});
	return ok("Pop-up added.");
}

function effectItem({
	effectType,
	name,
	start,
	duration,
	params = {},
}: {
	effectType: string;
	name: string;
	start: MediaTime;
	duration: MediaTime;
	params?: Record<string, string | number | boolean>;
}): InsertElementParams {
	const element = buildEffectElement({ effectType, startTime: start, duration });
	element.name = name;
	element.params = { ...element.params, ...params };
	return { element, placement: { mode: "auto", trackType: "effect" } };
}

/** C.F: a colour flash starting at the playhead (6 frames). */
export function addColourFlash({ color }: { color: "white" | "red" }): ActionResult {
	if (!tracks()) return fail("Open a project first.");
	insertAll({
		items: [
			effectItem({
				effectType: JEO_FLASH,
				name: color === "red" ? "Red flash" : "Colour flash",
				start: playhead(),
				duration: seconds(0.2),
				params: { color: color === "red" ? "#ff1e1e" : "#ffffff" },
			}),
		],
	});
	return ok("Colour flash added at the playhead.");
}

export function addBlurShake(): ActionResult {
	if (!tracks()) return fail("Open a project first.");
	insertAll({
		items: [
			effectItem({
				effectType: JEO_SHAKE,
				name: "Blur shake",
				start: playhead(),
				duration: seconds(0.3),
			}),
		],
	});
	return ok("Blur shake added at the playhead.");
}

export function addColourSplit(): ActionResult {
	if (!tracks()) return fail("Open a project first.");
	const start = playhead();
	const remaining = totalDuration() - start;
	const duration = remaining > frameTicks() ? toTime(remaining) : seconds(1);
	insertAll({
		items: [
			effectItem({ effectType: JEO_SPLIT, name: "Colour split", start, duration }),
		],
	});
	return ok("Colour split added from the playhead to the end.");
}

// ---------- assets (music, sound effects, emoji) ----------

export async function listAssetFiles(): Promise<JeoAssetFile[]> {
	const desktop = getDesktopBridge();
	if (!desktop) return [];
	try {
		return await desktop.listAssets();
	} catch (error) {
		console.error("[jeo] Failed to list assets:", error);
		return [];
	}
}

const MIME_BY_EXTENSION: Record<string, string> = {
	mp3: "audio/mpeg",
	wav: "audio/wav",
	m4a: "audio/mp4",
	aac: "audio/aac",
	ogg: "audio/ogg",
	flac: "audio/flac",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
};

/** Bring a file from the assets folder into this project's media (once). */
async function importAssetFile({
	file,
}: {
	file: Pick<JeoAssetFile, "name" | "relPath">;
}): Promise<MediaAsset | null> {
	const existing = editor()
		.media.getAssets()
		.find((asset) => asset.name === file.name);
	if (existing) return existing;

	const desktop = getDesktopBridge();
	const project = editor().project.getActive();
	if (!desktop || !project) return null;

	const { data } = await desktop.readAsset({ relPath: file.relPath });
	const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
	return await importFile({
		file: new File([data], file.name, { type: MIME_BY_EXTENSION[extension] ?? "" }),
	});
}

async function importFile({ file }: { file: File }): Promise<MediaAsset | null> {
	const project = editor().project.getActive();
	if (!project) return null;
	const [processed] = await processMediaAssets({ files: [file] });
	if (!processed) return null;
	return await editor().media.addMediaAsset({
		projectId: project.metadata.id,
		asset: processed,
	});
}

/**
 * Music starts at 0:00 and is cut to the video's length. A sound effect lands
 * on the playhead. `rate` slows or speeds the sound (0.8 = slowed).
 */
export async function addLibraryAudio({
	file,
	rate = 1,
}: {
	file: JeoAssetFile;
	rate?: number;
}): Promise<ActionResult> {
	if (!tracks()) return fail("Open a project first.");
	const asset = await importAssetFile({ file });
	if (!asset || asset.type !== "audio" || !asset.duration) {
		return fail(`Could not load ${file.name}.`);
	}
	const isMusic = file.kind === "music";
	const start = isMusic ? (0 as MediaTime) : playhead();
	const sourceDuration = seconds(asset.duration);
	let duration = snapToFrame(sourceDuration / rate);
	const total = totalDuration();
	if (isMusic && total > start && duration > total - start) {
		duration = toTime(total - start);
	}

	const element = buildElementFromMedia({
		mediaId: asset.id,
		mediaType: "audio",
		name: asset.name,
		duration: sourceDuration,
		startTime: start,
	});
	element.duration = duration;
	element.trimEnd = toTime(Math.max(0, sourceDuration - duration * rate));
	if (rate !== 1 && element.type === "audio") {
		element.retime = { rate, maintainPitch: false };
	}

	insertAll({ items: [{ element, placement: { mode: "auto", trackType: "audio" } }] });
	return ok(
		isMusic
			? `Music added from the start${rate !== 1 ? ` at ${rate}× speed` : ""}.`
			: "Sound effect added at the playhead.",
	);
}

// ---------- freeze ----------

function isVideo(
	element: TimelineElement,
): element is Extract<TimelineElement, { type: "video" }> {
	return element.type === "video";
}

async function grabVideoFrame({
	asset,
	atSeconds,
}: {
	asset: MediaAsset;
	atSeconds: number;
}): Promise<File | null> {
	const url = asset.url ?? URL.createObjectURL(asset.file);
	const video = document.createElement("video");
	video.muted = true;
	video.preload = "auto";
	video.src = url;
	try {
		await new Promise<void>((resolve, reject) => {
			video.addEventListener("loadeddata", () => resolve(), { once: true });
			video.addEventListener("error", () => reject(new Error("video load failed")), { once: true });
		});
		await new Promise<void>((resolve, reject) => {
			video.addEventListener("seeked", () => resolve(), { once: true });
			video.addEventListener("error", () => reject(new Error("video seek failed")), { once: true });
			video.currentTime = Math.max(0, Math.min(atSeconds, (video.duration || atSeconds) - 0.01));
		});
		const canvas = document.createElement("canvas");
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.drawImage(video, 0, 0);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/jpeg", 0.96),
		);
		if (!blob) return null;
		const stamp = atSeconds.toFixed(2).replace(".", "s");
		return new File([blob], `freeze_${stamp}_${asset.name.replace(/\.[^.]+$/, "")}.jpg`, {
			type: "image/jpeg",
		});
	} finally {
		video.removeAttribute("src");
		video.load();
		if (!asset.url) URL.revokeObjectURL(url);
	}
}

function shiftTrack<TTrack extends TimelineTrack>({
	track,
	from,
	by,
}: {
	track: TTrack;
	from: number;
	by: number;
}): TTrack {
	return {
		...track,
		elements: track.elements.map((element) =>
			element.startTime >= from
				? { ...element, startTime: toTime(element.startTime + by) }
				: element,
		),
	} as TTrack;
}

/**
 * Freeze frame: the picture under the playhead is held for `holdSeconds`
 * (default 2.0 s) and everything after it moves later. Optionally drops a
 * sound effect on the freeze.
 */
export async function addFreeze({
	holdSeconds = 2,
	sound,
}: {
	holdSeconds?: number;
	sound?: JeoAssetFile | null;
} = {}): Promise<ActionResult> {
	const before = tracks();
	if (!before) return fail("Open a project first.");
	const at = playhead();
	const clip = before.main.elements.find(
		(element) =>
			isVideo(element) &&
			at >= element.startTime &&
			at < element.startTime + element.duration,
	);
	if (!clip || !isVideo(clip)) {
		return fail("Put the playhead on a video clip on the main track.");
	}
	const asset = editor()
		.media.getAssets()
		.find((item) => item.id === clip.mediaId);
	if (!asset) return fail("The clip's video file is missing.");

	const rate = clip.retime?.rate ?? 1;
	const sourceSeconds =
		(clip.trimStart + (at - clip.startTime) * rate) / TICKS_PER_SECOND;
	const frameFile = await grabVideoFrame({ asset, atSeconds: sourceSeconds });
	if (!frameFile) return fail("Could not capture the frame.");
	const frameAsset = await importFile({ file: frameFile });
	if (!frameAsset) return fail("Could not save the freeze frame.");

	// split the clip at the playhead (unless the playhead is already on a cut)
	const didSplit = at > clip.startTime;
	if (didSplit) {
		editor().timeline.splitElements({
			elements: [{ trackId: before.main.id, elementId: clip.id }],
			splitTime: at,
		});
	}
	const split = tracks();
	if (!split) return fail("Timeline changed while freezing.");
	// one undo step for the whole freeze: drop the split from history and
	// record original → finished instead
	if (didSplit) editor().command.undo();

	const hold = seconds(holdSeconds);
	const still = {
		...buildElementFromMedia({
			mediaId: frameAsset.id,
			mediaType: "image",
			name: "Freeze",
			duration: hold,
			startTime: at,
		}),
		id: generateUUID(),
	} as TimelineElement;
	// keep the clip's framing (zoom and position) on the frozen picture
	if ("params" in still && "params" in clip) {
		for (const key of [
			"transform.scaleX",
			"transform.scaleY",
			"transform.positionX",
			"transform.positionY",
			"transform.rotate",
		]) {
			const value = clip.params[key];
			if (value !== undefined) still.params[key] = value;
		}
	}

	const shiftedMain = shiftTrack({ track: split.main, from: at, by: hold });
	const after: SceneTracks = {
		overlay: split.overlay.map((track) => shiftTrack({ track, from: at, by: hold })),
		main: {
			...shiftedMain,
			elements: [...shiftedMain.elements, still].sort(
				(a, b) => a.startTime - b.startTime,
			) as typeof shiftedMain.elements,
		},
		audio: split.audio.map((track) => shiftTrack({ track, from: at, by: hold })),
	};
	editor().command.execute({ command: new TracksSnapshotCommand({ before, after }) });

	if (sound) {
		editor().playback.seek({ time: at });
		await addLibraryAudio({ file: sound });
	}
	editor().playback.seek({ time: at });
	return ok(`Freeze added: ${holdSeconds.toFixed(1)} s. Now add a ▼ tag and a scene text on it.`);
}

// ---------- endings ----------

export type EndingKind = "funny" | "sweet";

const ENDING_EMOJI: Record<EndingKind, string> = {
	funny: "laugh_yours.png",
	sweet: "heart.png",
};

/**
 * One-click ending, measured from HIDING MONEY. Put the playhead on the last
 * cut. From there: 0.3 s blurry shake → emoji fades in ~45% see-through and
 * keeps growing (1/3 → 2/3 → 5/6 of the width) → colour split from 0.6 s.
 */
export async function addEnding({ kind }: { kind: EndingKind }): Promise<ActionResult> {
	if (!tracks()) return fail("Open a project first.");
	const cut = playhead();
	const end = totalDuration();
	const length = (end - cut) / TICKS_PER_SECOND;
	if (length < 0.8) {
		return fail("Put the playhead on the last cut (at least 0.8 s before the end).");
	}

	const emojiName = ENDING_EMOJI[kind];
	const emojiAsset = await importAssetFile({
		file: { name: emojiName, relPath: `emoji/${emojiName}` },
	});
	if (!emojiAsset) {
		return fail(`Could not load assets\\emoji\\${emojiName}.`);
	}

	const emojiStart = toTime(cut + seconds(0.3));
	const emojiLength = (end - emojiStart) / TICKS_PER_SECOND;
	const lastFrame = Math.max(0.7, emojiLength - 1 / 30);
	const emoji = buildElementFromMedia({
		mediaId: emojiAsset.id,
		mediaType: "image",
		name: kind === "funny" ? "😂 ending" : "❤️ ending",
		duration: toTime(end - emojiStart),
		startTime: emojiStart,
	});
	if ("params" in emoji) {
		emoji.params = {
			...emoji.params,
			opacity: 0.45,
			"transform.scaleX": 0.333,
			"transform.scaleY": 0.333,
			"transform.positionY": -245,
		};
	}
	const growth: KeyPoint[] = [
		[0, 0.333],
		[0.65, 0.667],
		[lastFrame, 0.833],
	];
	(emoji as { animations?: unknown }).animations = {
		opacity: keys([
			[0, 0],
			[0.12, 0.45],
		]),
		"transform.scaleX": keys(growth),
		"transform.scaleY": keys(growth),
		"transform.positionX": keys([
			[0, 0],
			[0.65, -10],
			[lastFrame, 0],
		]),
		"transform.positionY": keys([
			[0, -245],
			[0.65, -200],
			[lastFrame, -160],
		]),
	};

	const splitStart = toTime(cut + seconds(0.6));
	insertAll({
		items: [
			effectItem({
				effectType: JEO_SHAKE,
				name: "Ending shake",
				start: cut,
				duration: seconds(0.3),
			}),
			{ element: emoji as CreateTimelineElement, placement: { mode: "auto", trackType: "video" } },
			effectItem({
				effectType: JEO_SPLIT,
				name: "Ending colour split",
				start: splitStart,
				duration: toTime(end - splitStart),
			}),
		],
	});
	return ok(
		kind === "funny"
			? "😂 ending added. Check it ends on a :29 frame."
			: "❤️ ending added. Check it ends on a :29 frame.",
	);
}

// ---------- helpers: snap texts to cuts, end on :29 ----------

/**
 * A text never starts before its scene: any text or tag whose start or end is
 * within 0.35 s of a cut is moved exactly onto that cut.
 */
export function snapTextsToCuts(): ActionResult {
	const sceneTracks = tracks();
	if (!sceneTracks) return fail("Open a project first.");
	const cuts = [
		...new Set(
			sceneTracks.main.elements.flatMap((element) => [
				element.startTime,
				element.startTime + element.duration,
			]),
		),
	];
	if (cuts.length === 0) return fail("There are no clips on the main track.");
	const window = seconds(0.35);
	const nearest = (time: number): number | null => {
		let best: number | null = null;
		for (const cut of cuts) {
			const gap = Math.abs(cut - time);
			if (gap <= window && (best === null || gap < Math.abs(best - time))) best = cut;
		}
		return best;
	};

	const updates: Array<{
		trackId: string;
		elementId: string;
		patch: Partial<TimelineElement>;
	}> = [];
	for (const track of sceneTracks.overlay) {
		if (track.type !== "text" && track.type !== "graphic") continue;
		for (const element of track.elements) {
			const oldStart = element.startTime;
			const oldEnd = element.startTime + element.duration;
			const newStart = nearest(oldStart) ?? oldStart;
			let newEnd = nearest(oldEnd) ?? oldEnd;
			if (newEnd - newStart < frameTicks()) newEnd = oldEnd;
			if (newStart === oldStart && newEnd === oldEnd) continue;
			updates.push({
				trackId: track.id,
				elementId: element.id,
				patch: { startTime: toTime(newStart), duration: toTime(newEnd - newStart) },
			});
		}
	}
	if (updates.length === 0) return ok("All texts already sit on their cuts.");
	editor().timeline.updateElements({ updates });
	return ok(`${updates.length} text${updates.length === 1 ? "" : "s"} snapped to cuts.`);
}

export interface EndInfo {
	frames: number;
	timecode: string;
	isOn29: boolean;
	trimTo: number | null;
	extendTo: number | null;
}

function timecodeOf({ frames }: { frames: number }): string {
	const fps = Math.round(TICKS_PER_SECOND / frameTicks());
	const whole = Math.floor(frames / fps);
	return `${whole}:${String(frames % fps).padStart(2, "0")}`;
}

export function formatFrames({ frames }: { frames: number }): string {
	return timecodeOf({ frames });
}

/** Where the video ends now, and the nearest :29 lengths below and above. */
export function getEndInfo(): EndInfo {
	const fps = Math.round(TICKS_PER_SECOND / frameTicks());
	const frames = Math.round(totalDuration() / frameTicks());
	const rest = frames % fps;
	const isOn29 = frames > 0 && rest === fps - 1;
	const below = frames - ((rest + 1) % fps);
	const above = frames + ((fps - 1 - rest + fps) % fps);
	return {
		frames,
		timecode: timecodeOf({ frames }),
		isOn29,
		trimTo: !isOn29 && below > 0 ? below : null,
		extendTo: !isOn29 && frames > 0 ? above : null,
	};
}

/**
 * Make the video end on a :29 frame by trimming the end down or stretching the
 * last clip up. Texts, emoji and effects that reach the end follow it.
 */
export function endOn29({ direction }: { direction: "trim" | "extend" }): ActionResult {
	const sceneTracks = tracks();
	if (!sceneTracks) return fail("Open a project first.");
	const info = getEndInfo();
	if (info.isOn29) return ok("Already ends on a :29 frame.");
	const targetFrames = direction === "trim" ? info.trimTo : info.extendTo;
	if (!targetFrames) return fail("Nothing to adjust.");

	const frame = frameTicks();
	const oldEnd = totalDuration();
	const newEnd = targetFrames * frame;
	const last = [...sceneTracks.main.elements].sort(
		(a, b) => b.startTime + b.duration - (a.startTime + a.duration),
	)[0];
	if (!last) return fail("There are no clips on the main track.");

	const updates: Array<{
		trackId: string;
		elementId: string;
		patch: Partial<TimelineElement>;
	}> = [];

	if (direction === "extend") {
		const extra = newEnd - oldEnd;
		const rate = isVideo(last) ? (last.retime?.rate ?? 1) : 1;
		if (isVideo(last) && last.trimEnd < extra * rate) {
			return fail("The last clip has no spare footage to extend. Use Trim instead.");
		}
	}

	for (const track of allTracks(sceneTracks)) {
		for (const element of track.elements) {
			const elementEnd = element.startTime + element.duration;
			const reachesEnd = Math.abs(elementEnd - oldEnd) <= frame / 2;
			const pastNewEnd = elementEnd > newEnd;
			if (direction === "trim" ? !pastNewEnd : !reachesEnd) continue;
			if (element.startTime >= newEnd) continue;

			const duration = newEnd - element.startTime;
			const delta = duration - element.duration;
			const rate =
				"retime" in element && element.retime ? element.retime.rate : 1;
			const usesSource = element.type === "video" || element.type === "audio";
			if (usesSource && delta > 0 && element.trimEnd < delta * rate) continue;
			updates.push({
				trackId: track.id,
				elementId: element.id,
				patch: {
					duration: toTime(duration),
					...(usesSource
						? { trimEnd: toTime(Math.max(0, element.trimEnd - delta * rate)) }
						: {}),
				},
			});
		}
	}

	if (updates.length === 0) return fail("Nothing to adjust.");
	editor().timeline.updateElements({ updates });
	return ok(`Now ends on ${timecodeOf({ frames: targetFrames })}.`);
}
