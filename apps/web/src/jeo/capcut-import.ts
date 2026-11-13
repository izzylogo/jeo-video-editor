/**
 * Bring a CapCut project into JEO Editor as a new project.
 *
 * The desktop app reads CapCut's files (read-only) and hands over a plan in
 * JEO's units; this rebuilds it on the timeline: the cuts with their speed,
 * framing, mirror and volume; overlays; texts with their look; sounds; and
 * keyframe animation. CapCut's own effects, transitions, stickers and text
 * animations have no twin here and are listed back to the user instead.
 */
import { EditorCore } from "@/core";
import { TracksSnapshotCommand } from "@/commands/timeline";
import type { InsertElementParams } from "@/commands/timeline/element/insert-element";
import type { MediaAsset } from "@/media/types";
import { type CapCutPlan, getDesktopBridge } from "@/services/desktop/bridge";
import type { SceneTracks, TimelineElement } from "@/timeline";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { generateUUID } from "@/utils/id";
import { type MediaTime, TICKS_PER_SECOND } from "@/wasm";
import { importFile, insertAll, keys, seconds, textItem } from "./actions";

const S = TICKS_PER_SECOND;
const PENDING_KEY = "jeo-capcut-import";

const MIME: Record<string, string> = {
	mp4: "video/mp4",
	m4v: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
	mkv: "video/x-matroska",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	m4a: "audio/mp4",
	aac: "audio/aac",
	ogg: "audio/ogg",
	flac: "audio/flac",
};

/** Remember which CapCut project to load once the new JEO project is open. */
export function queueCapCutImport({ name }: { name: string }): void {
	window.sessionStorage.setItem(PENDING_KEY, name);
}

export function takeQueuedCapCutImport(): string | null {
	const name = window.sessionStorage.getItem(PENDING_KEY);
	if (name) window.sessionStorage.removeItem(PENDING_KEY);
	return name;
}

type Animations = Record<string, ReturnType<typeof keys>>;

function animationsFrom({
	keyframes,
	mirror = false,
}: {
	keyframes: Record<string, Array<[number, number]>>;
	mirror?: boolean;
}): Animations | undefined {
	const out: Animations = {};
	const paths: Record<string, string[]> = {
		scale: ["transform.scaleX", "transform.scaleY"],
		x: ["transform.positionX"],
		y: ["transform.positionY"],
		rotation: ["transform.rotate"],
		opacity: ["opacity"],
	};
	for (const [name, points] of Object.entries(keyframes ?? {})) {
		for (const path of paths[name] ?? []) {
			const flip = mirror && path === "transform.scaleX" ? -1 : 1;
			out[path] = keys(points.map(([at, value]) => [at, value * flip]));
		}
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

function decibels(linear: number): number {
	return linear <= 0.001 ? 0 : Math.max(-60, Math.min(20, 20 * Math.log10(linear)));
}

export interface CapCutImportResult {
	ok: boolean;
	error?: string;
	clips: number;
	texts: number;
	sounds: number;
	leftOut: string[];
	missing: string[];
}

export async function importCapCutProject({
	name,
	onProgress,
}: {
	name: string;
	onProgress?: (message: string) => void;
}): Promise<CapCutImportResult> {
	const empty = { clips: 0, texts: 0, sounds: 0, leftOut: [], missing: [] };
	const desktop = getDesktopBridge();
	const editor = EditorCore.getInstance();
	if (!desktop) return { ok: false, error: "This works in the JEO Editor desktop app.", ...empty };
	const outcome = await desktop.capcutPlan({ name });
	if (!outcome.ok || !outcome.plan) {
		return { ok: false, error: outcome.error ?? "That CapCut project could not be read.", ...empty };
	}
	const plan: CapCutPlan = outcome.plan;

	// the project takes the CapCut project's frame size
	await editor.project.updateSettings({
		settings: {
			canvasSize: { width: plan.width, height: plan.height },
			canvasSizeMode: "custom",
			lastCustomCanvasSize: { width: plan.width, height: plan.height },
		} as never,
		pushHistory: false,
	});

	// copy each file in once
	const assets = new Map<string, MediaAsset>();
	let number = 0;
	for (const file of plan.files) {
		number += 1;
		const fileName = file.path.split(/[\\/]/).pop() ?? "file";
		onProgress?.(`Copying ${number} of ${plan.files.length}: ${fileName}`);
		try {
			const { data } = await desktop.capcutReadFile({ filePath: file.path });
			const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
			const asset = await importFile({
				file: new File([data], fileName, { type: MIME[extension] ?? "" }),
			});
			if (asset) assets.set(file.path, asset);
		} catch (error) {
			console.error("[jeo] could not copy", file.path, error);
		}
	}

	const missing = [...plan.missing];
	onProgress?.("Rebuilding the timeline");

	const visual = (clip: CapCutPlan["clips"][number]): TimelineElement | null => {
		const asset = assets.get(clip.path);
		if (!asset) {
			missing.push(clip.name);
			return null;
		}
		const isVideo = clip.kind === "video" && asset.type === "video";
		const sourceDuration = seconds(
			isVideo ? (asset.duration ?? clip.duration * clip.speed) : clip.duration,
		);
		const element = {
			...buildElementFromMedia({
				mediaId: asset.id,
				mediaType: isVideo ? "video" : "image",
				name: asset.name,
				duration: sourceDuration,
				startTime: seconds(clip.start),
			}),
			id: generateUUID(),
		} as TimelineElement & { params: Record<string, unknown> };
		const duration = seconds(clip.duration);
		element.duration = duration;
		if (isVideo && element.type === "video") {
			const trimStart = Math.round(clip.sourceIn * S);
			element.trimStart = trimStart as MediaTime;
			element.trimEnd = Math.max(
				0,
				Math.round(sourceDuration - trimStart - duration * clip.speed),
			) as MediaTime;
			if (Math.abs(clip.speed - 1) > 0.001) {
				element.retime = { rate: clip.speed, maintainPitch: false };
			}
		}
		element.params = {
			...element.params,
			"transform.scaleX": clip.scale * (clip.mirror ? -1 : 1),
			"transform.scaleY": clip.scaleY || clip.scale,
			"transform.positionX": Math.round(clip.x),
			"transform.positionY": Math.round(clip.y),
			"transform.rotate": clip.rotation,
			opacity: clip.opacity,
			...(isVideo
				? { muted: clip.volume <= 0.001, volume: decibels(clip.volume) }
				: {}),
		};
		const animations = animationsFrom({ keyframes: clip.keyframes, mirror: clip.mirror });
		if (animations) (element as { animations?: unknown }).animations = animations;
		return element as TimelineElement;
	};

	// main track: straight onto it, exactly where CapCut had each clip
	const before = editor.scenes.getActiveScene().tracks;
	const mainElements = plan.clips
		.filter((clip) => !clip.overlay)
		.sort((a, b) => a.start - b.start)
		.map(visual)
		.filter((element): element is TimelineElement => element !== null);
	const after: SceneTracks = {
		...before,
		main: { ...before.main, elements: mainElements as typeof before.main.elements },
	};
	editor.command.execute({ command: new TracksSnapshotCommand({ before, after }) });

	// overlays, texts and sounds go on their own tracks
	const items: InsertElementParams[] = [];
	let overlays = 0;
	for (const clip of plan.clips.filter((item) => item.overlay)) {
		const element = visual(clip);
		if (!element) continue;
		overlays += 1;
		items.push({
			element: element as InsertElementParams["element"],
			placement: { mode: "auto", trackType: "video" },
		});
	}
	for (const text of plan.texts) {
		items.push(
			textItem({
				content: text.text,
				start: seconds(text.start),
				durationSeconds: text.duration,
				params: {
					fontSize: Math.round(text.fontSize * 1000) / 1000,
					color: text.color,
					"stroke.enabled": text.stroke,
					"stroke.color": text.strokeColor,
					fontWeight: text.bold ? "bold" : "normal",
					fontStyle: text.italic ? "italic" : "normal",
					"tag.triangle": text.triangle,
					"transform.scaleX": text.scale,
					"transform.scaleY": text.scale,
					"transform.positionX": Math.round(text.x),
					"transform.positionY": Math.round(text.y),
					"transform.rotate": text.rotation,
					opacity: text.opacity,
				},
				animations: animationsFrom({ keyframes: text.keyframes }),
			}),
		);
	}
	let sounds = 0;
	for (const sound of plan.audio) {
		const asset = assets.get(sound.path);
		if (!asset || !asset.duration) {
			missing.push(sound.name);
			continue;
		}
		const sourceDuration = seconds(asset.duration);
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: "audio",
			name: asset.name,
			duration: sourceDuration,
			startTime: seconds(sound.start),
		});
		const duration = seconds(sound.duration);
		const trimStart = Math.round(sound.sourceIn * S);
		element.duration = duration;
		element.trimStart = trimStart as MediaTime;
		element.trimEnd = Math.max(
			0,
			Math.round(sourceDuration - trimStart - duration * sound.speed),
		) as MediaTime;
		if (Math.abs(sound.speed - 1) > 0.001 && element.type === "audio") {
			element.retime = { rate: sound.speed, maintainPitch: false };
		}
		(element as { params: Record<string, unknown> }).params = {
			...(element as { params: Record<string, unknown> }).params,
			muted: sound.volume <= 0.001,
			volume: decibels(sound.volume),
		};
		sounds += 1;
		items.push({ element, placement: { mode: "auto", trackType: "audio" } });
	}
	insertAll({ items });
	editor.playback.seek({ time: 0 as MediaTime });
	await editor.project.saveCurrentProject();

	return {
		ok: true,
		clips: mainElements.length + overlays,
		texts: plan.texts.length,
		sounds,
		leftOut: plan.leftOut,
		missing: [...new Set(missing)],
	};
}
