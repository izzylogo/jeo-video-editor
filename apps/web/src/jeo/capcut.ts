/**
 * "Open in CapCut": describes the current timeline in plain data and hands it
 * to the desktop app, which writes it as a NEW CapCut draft (see
 * apps/jeo-desktop/tools/capcut_export.py). Existing CapCut projects are never
 * changed.
 *
 * What goes across: cuts, speed, framing, freeze frames, texts (words, time,
 * position, size, ▼), the ending emoji (as a still overlay) and sounds.
 * What does not: keyframe animation (pop-up, growing emoji, follow), colour
 * flash / blur shake / colour split, arrows and spotlights. Those are listed
 * back to the user so they can add them in CapCut.
 */
import { EditorCore } from "@/core";
import type { TimelineElement } from "@/timeline";
import { getDesktopBridge } from "@/services/desktop/bridge";
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

export interface CapCutExportResult {
	ok: boolean;
	error?: string;
	draftName?: string;
	leftOut: string[];
	capcutWasRunning?: boolean;
}

export async function openInCapCut(): Promise<CapCutExportResult> {
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
		const animated = Object.keys(element.animations ?? {}).length > 0;
		if (animated) leftOut.add("the growing/fading animation of the emoji (it is placed as a still)");
		clips.push({
			kind: element.type,
			mediaId: asset.id,
			name: asset.name,
			overlay,
			start: element.startTime / S,
			duration: element.duration / S,
			sourceIn: element.trimStart / S,
			speed: element.type === "video" ? (element.retime?.rate ?? 1) : 1,
			scale: settled({ element, path: "transform.scaleX", fallback: 1 }),
			x: settled({ element, path: "transform.positionX", fallback: 0 }),
			y: settled({ element, path: "transform.positionY", fallback: 0 }),
			opacity: settled({ element, path: "opacity", fallback: 1 }),
			muted: element.params.muted === true,
			mediaWidth: asset.width,
			mediaHeight: asset.height,
			mediaDuration: asset.duration ?? 0,
		});
	};
	for (const element of tracks.main.elements) {
		addVisual({ element: element as TimelineElement, overlay: false });
	}

	const texts: Array<Record<string, unknown>> = [];
	for (const track of tracks.overlay) {
		for (const element of track.elements as TimelineElement[]) {
			if (element.type === "text") {
				const paths = Object.keys(element.animations ?? {});
				if (paths.some((path) => path.startsWith("transform.scale"))) {
					leftOut.add("pop-up animations on texts");
				}
				if (paths.some((path) => path.startsWith("transform.position"))) {
					leftOut.add("tags that follow a person (they are placed where they start)");
				}
				const firstKey = (path: string, fallback: number) => {
					const channel = element.animations?.[path] as
						| { keys?: Array<{ value: unknown }> }
						| undefined;
					const value = channel?.keys?.[0]?.value;
					return typeof value === "number" ? value : fallback;
				};
				texts.push({
					text: String(element.params.content ?? ""),
					start: element.startTime / S,
					duration: element.duration / S,
					x: firstKey("transform.positionX", num(element.params["transform.positionX"], 0)),
					y: firstKey("transform.positionY", num(element.params["transform.positionY"], 0)),
					size: num(element.params.fontSize, 4.2),
					scale: num(element.params["transform.scaleX"], 1),
					triangle: element.params["tag.triangle"] === true,
				});
			} else if (element.type === "video" || element.type === "image") {
				addVisual({ element, overlay: true });
			} else if (element.type === "effect") {
				leftOut.add(`effect: ${element.name}`);
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

	await editor.project.saveCurrentProject();
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
