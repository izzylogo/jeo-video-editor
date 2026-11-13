/**
 * "Open in CapCut": describes the current timeline in plain data and hands it
 * to the desktop app, which writes it as a NEW CapCut draft (see
 * apps/jeo-desktop/tools/capcut_export.py). Existing CapCut projects are never
 * changed.
 *
 * What goes across: cuts, speed, framing, mirror, clip volume, freeze frames,
 * texts (words, time, position, size, colour, outline, box, ▼), keyframe
 * animation (pop-up, growing/fading emoji, tags that follow a person), the
 * colour split and blur shake (as CapCut's own "RGB Distort" and "Shake"),
 * the Glare transition (as CapCut's "Glare II") and sounds.
 * What does not: colour flash, the other JEO effects and transitions, crop
 * boxes, arrows and spotlights. Those are listed back to the user.
 */
import { EditorCore } from "@/core";
import type { TimelineElement } from "@/timeline";
import { getDesktopBridge } from "@/services/desktop/bridge";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { TICKS_PER_SECOND } from "@/wasm";

const S = TICKS_PER_SECOND;

function num(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** last keyframe value of a number property, or its plain value */
function settled({
	element,
	path,
	fallback,
}: {
	element: TimelineElement;
	path: string;
	fallback: number;
}): number {
	const channel = element.animations?.[path] as
		| { keys?: Array<{ value: unknown }> }
		| undefined;
	const last = channel?.keys?.[channel.keys.length - 1]?.value;
	if (typeof last === "number") return last;
	return num("params" in element ? element.params[path] : undefined, fallback);
}

/** every keyframed number CapCut also understands, as [seconds, value] pairs */
const KEYFRAME_PATHS: Record<string, string> = {
	"transform.scaleX": "scale",
	"transform.positionX": "x",
	"transform.positionY": "y",
	"transform.rotate": "rotation",
	opacity: "opacity",
};

function keyframesOf(element: TimelineElement): Record<string, Array<[number, number]>> {
	const out: Record<string, Array<[number, number]>> = {};
	for (const [path, name] of Object.entries(KEYFRAME_PATHS)) {
		const channel = element.animations?.[path] as
			| { keys?: Array<{ time: number; value: unknown }> }
			| undefined;
		const points = (channel?.keys ?? [])
			.filter((key) => typeof key.value === "number")
			.map((key) => [key.time / S, key.value as number] as [number, number])
			.sort((a, b) => a[0] - b[0]);
		if (points.length >= 2) out[name] = points;
	}
	return out;
}

/** where an animated number starts (CapCut then follows the keyframes) */
function starting({
	element,
	path,
	fallback,
}: {
	element: TimelineElement;
	path: string;
	fallback: number;
}): number {
	const channel = element.animations?.[path] as
		| { keys?: Array<{ time: number; value: unknown }> }
		| undefined;
	const first = [...(channel?.keys ?? [])].sort((a, b) => a.time - b.time)[0]?.value;
	if (typeof first === "number") return first;
	return num("params" in element ? element.params[path] : undefined, fallback);
}

export interface CapCutExportResult {
	ok: boolean;
	error?: string;
	draftName?: string;
	leftOut: string[];
	capcutWasRunning?: boolean;
}

export async function openInCapCut({
	onStage,
}: {
	/** called as each step begins, with words for the user */
	onStage?: (stage: string) => void;
} = {}): Promise<CapCutExportResult> {
	onStage?.("Reading the timeline");
	const desktop = getDesktopBridge();
	const editor = EditorCore.getInstance();
	const project = editor.project.getActive();
	const tracks = editor.scenes.getActiveSceneOrNull()?.tracks;
	if (!desktop) {
		return { ok: false, error: "This works in the JEO Editor desktop app.", leftOut: [] };
	}
	if (!project || !tracks || tracks.main.elements.length === 0) {
		return { ok: false, error: "Put a clip on the timeline first.", leftOut: [] };
	}
	const assets = editor.media.getAssets();
	const leftOut = new Set<string>();

	const clips: Array<Record<string, unknown>> = [];
	const addVisual = ({
		element,
		overlay,
	}: {
		element: TimelineElement;
		overlay: boolean;
	}) => {
		if (element.type !== "video" && element.type !== "image") return;
		const asset = assets.find((item) => item.id === element.mediaId);
		if (!asset) return;
		const decibels = num(element.params.volume, 0);
		clips.push({
			kind: element.type,
			mediaId: asset.id,
			name: asset.name,
			overlay,
			start: element.startTime / S,
			duration: element.duration / S,
			sourceIn: element.trimStart / S,
			speed: element.type === "video" ? (element.retime?.rate ?? 1) : 1,
			scale: starting({ element, path: "transform.scaleX", fallback: 1 }),
			scaleY: num(element.params["transform.scaleY"], 0) || undefined,
			x: starting({ element, path: "transform.positionX", fallback: 0 }),
			y: starting({ element, path: "transform.positionY", fallback: 0 }),
			rotation: starting({ element, path: "transform.rotate", fallback: 0 }),
			opacity: starting({ element, path: "opacity", fallback: 1 }),
			keyframes: keyframesOf(element),
			muted: element.params.muted === true,
			volume: 10 ** (decibels / 20),
			mediaWidth: asset.width,
			mediaHeight: asset.height,
			mediaDuration: asset.duration ?? 0,
		});
	};
	for (const element of tracks.main.elements) {
		addVisual({ element: element as TimelineElement, overlay: false });
	}

	const texts: Array<Record<string, unknown>> = [];
	const effects: Array<Record<string, unknown>> = [];
	for (const track of tracks.overlay) {
		for (const element of track.elements as TimelineElement[]) {
			if (element.type === "text") {
				texts.push({
					text: String(element.params.content ?? ""),
					start: element.startTime / S,
					duration: element.duration / S,
					x: starting({ element, path: "transform.positionX", fallback: 0 }),
					y: starting({ element, path: "transform.positionY", fallback: 0 }),
					size: num(element.params.fontSize, 4.2),
					scale: starting({ element, path: "transform.scaleX", fallback: 1 }),
					rotation: starting({ element, path: "transform.rotate", fallback: 0 }),
					opacity: starting({ element, path: "opacity", fallback: 1 }),
					keyframes: keyframesOf(element),
					triangle: element.params["tag.triangle"] === true,
					color: typeof element.params.color === "string" ? element.params.color : "#ffffff",
					stroke: element.params["stroke.enabled"] !== false,
					strokeColor:
						typeof element.params["stroke.color"] === "string"
							? element.params["stroke.color"]
							: "#000000",
					background:
						element.params["background.enabled"] === true &&
						typeof element.params["background.color"] === "string"
							? element.params["background.color"]
							: undefined,
					bold: element.params.fontWeight === "bold",
					italic: element.params.fontStyle === "italic",
					underline: element.params.textDecoration === "underline",
					align: element.params.textAlign ?? "center",
				});
			} else if (element.type === "video" || element.type === "image") {
				addVisual({ element, overlay: true });
			} else if (element.type === "effect") {
				// CapCut has its own versions of three of these; the rest stay here
				const kind =
					element.effectType === "jeo-split"
						? "split"
						: element.effectType === "jeo-shake"
							? "shake"
							: element.effectType === "jeo-transition" &&
									element.params?.style === "glare"
								? "transition"
								: null;
				if (kind) {
					effects.push({
						kind,
						style: element.params?.style,
						name: element.name,
						start: element.startTime / S,
						duration: element.duration / S,
					});
				} else {
					leftOut.add(`effect: ${element.name}`);
				}
			} else if (element.type === "graphic") {
				leftOut.add(`${element.name.toLowerCase()} graphic`);
			} else {
				leftOut.add(element.name);
			}
		}
	}

	const audio: Array<Record<string, unknown>> = [];
	for (const track of tracks.audio) {
		for (const element of track.elements) {
			if (element.sourceType !== "upload") {
				leftOut.add(`sound: ${element.name}`);
				continue;
			}
			const asset = assets.find((item) => item.id === element.mediaId);
			if (!asset) continue;
			const decibels = num(element.params.volume, 0);
			audio.push({
				mediaId: asset.id,
				name: asset.name,
				start: element.startTime / S,
				duration: element.duration / S,
				sourceIn: element.trimStart / S,
				speed: element.retime?.rate ?? 1,
				volume: element.params.muted === true ? 0 : 10 ** (decibels / 20),
				mediaDuration: asset.duration ?? 0,
			});
		}
	}

	onStage?.("Saving the project");
	await editor.project.saveCurrentProject();
	onStage?.("Making the cover picture");

	// a cover picture, so the project is easy to spot in CapCut's list
	let coverBase64: string | undefined;
	try {
		const renderTree = editor.renderer.getRenderTree();
		if (renderTree) {
			const { width, height } = project.settings.canvasSize;
			const renderer = new CanvasRenderer({ width, height, fps: project.settings.fps });
			const frame = document.createElement("canvas");
			frame.width = width;
			frame.height = height;
			const coverTime = Math.min(
				Math.round(2.4 * S),
				editor.timeline.getLastFrameTime(),
			);
			await renderer.renderToCanvas({
				node: renderTree,
				time: coverTime,
				targetCanvas: frame,
			});
			const small = document.createElement("canvas");
			small.width = 540;
			small.height = Math.round((540 * height) / width);
			small.getContext("2d")?.drawImage(frame, 0, 0, small.width, small.height);
			coverBase64 = small.toDataURL("image/jpeg", 0.85).split(",")[1];
		}
	} catch (error) {
		console.warn("[jeo] could not make a CapCut cover:", error);
	}

	onStage?.("Writing the CapCut project");
	const outcome = await desktop.exportToCapCut({
		projectId: project.metadata.id,
		data: {
			name: project.metadata.name,
			width: project.settings.canvasSize.width,
			height: project.settings.canvasSize.height,
			fps: project.settings.fps.numerator / project.settings.fps.denominator,
			duration: editor.timeline.getTotalDuration() / S,
			clips,
			texts,
			audio,
			effects,
			coverBase64,
		},
	});
	return {
		ok: outcome.ok,
		error: outcome.error,
		draftName: outcome.draftName,
		capcutWasRunning: outcome.capcutWasRunning,
		leftOut: [...leftOut, ...(outcome.warnings ?? [])],
	};
}
