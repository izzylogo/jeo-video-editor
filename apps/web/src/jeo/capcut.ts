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
 * Masks on clips go across as CapCut masks (rectangle and circle), so a
 * spotlight (dark rectangle-masked freeze frame + bright circle-masked copy on
 * top) arrives exactly as the user builds it in CapCut. Old graphic spotlights
 * become a circle mask on the clip underneath.
 * A colour flash becomes a "(ADD C.F)" scene text at that moment, as a
 * reminder to add CapCut's own flash there.
 * What does not: the other JEO effects and transitions, crop boxes and
 * arrows. Those are listed back to the user.
 */
import { EditorCore } from "@/core";
import type { TextElement } from "@/timeline";
import { getTextMeasurementContext, measureTextElement } from "@/text/measure-element";
import type { TimelineElement } from "@/timeline";
import { getDesktopBridge } from "@/services/desktop/bridge";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { TICKS_PER_SECOND } from "@/wasm";
import { featherToShare } from "./actions";
import { readSlot, visibleSlots } from "@/masks/builtin/definitions/capcut";

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

/**
 * A clip's mask in CapCut's terms. JEO and CapCut both give the size as a part
 * of the clip; CapCut counts the centre in half-sizes with up positive, JEO in
 * whole sizes with down positive. Rectangle -> CapCut Rectangle, ellipse ->
 * CapCut Circle (its width and height are set separately, so ovals work too).
 */
function maskOf({
	element,
	asset,
}: {
	element: TimelineElement;
	asset: { width?: number; height?: number };
}): Record<string, unknown> | undefined {
	const mask = "masks" in element ? element.masks?.[0] : undefined;
	if (!mask || (mask.type !== "rectangle" && mask.type !== "ellipse")) return undefined;
	const params = mask.params;
	const sourceWidth = params.width * (asset.width ?? 1080);
	const sourceHeight = params.height * (asset.height ?? 1920);
	return {
		shape: mask.type === "ellipse" ? "circle" : "rectangle",
		// the spotlight's rectangle is CapCut's rounded one, like the user's own
		roundCorner: element.name === "Spotlight box" ? 1 : 0,
		centerX: 2 * params.centerX,
		centerY: -2 * params.centerY,
		width: params.width * params.scale,
		height: params.height * params.scale,
		rotation: params.rotation,
		feather: featherToShare({ pixels: params.feather, maskWidth: sourceWidth, maskHeight: sourceHeight }),
		invert: params.inverted,
	};
}

/** Every mask on a clip in CapCut's terms (a CapCut mask can hold several). */
function masksOf({
	element,
	asset,
}: {
	element: TimelineElement;
	asset: { width?: number; height?: number };
}): Array<Record<string, unknown>> {
	const mask = "masks" in element ? element.masks?.[0] : undefined;
	if (mask?.type === "capcut") {
		// already in CapCut's own numbers: straight across
		// a hidden mask (eye off) is left out, so CapCut shows what JEO shows
		return visibleSlots(mask.params).map((slot) => {
			const s = readSlot(mask.params, slot);
			return {
				shape: s.shape,
				centerX: s.x,
				centerY: s.y,
				width: s.w,
				height: s.h,
				rotation: s.r,
				feather: s.f,
				roundCorner: s.shape === "rectangle" ? s.c : 0,
				invert: s.invert,
			};
		});
	}
	const single = maskOf({ element, asset });
	return single ? [single] : [];
}

// ---------- shapes (▼ under tags, the curved arrow) as real CapCut shapes ----------
//
// CapCut stores them in materials.shapes (name "polycon_item") on a sticker
// track: custom_points are x, y pairs around the shape's centre with UP
// positive, in canvas pixels divided by (canvas width / 720) — measured on the
// user's GIRLFRIEND EXPOSED project (a 70 x 43 triangle shows as 138 x 86 on
// a 1440-wide canvas).

type ShapeItem = {
	start: number;
	duration: number;
	/** centre, frame pixels from the frame centre, y down (JEO style) */
	x: number;
	y: number;
	rotation: number;
	/** points around the centre in CapCut shape units, y up */
	points: number[];
	fill: string;
	fillAlpha: number;
	border: string;
	borderWidth: number;
	keyframes: Record<string, Array<[number, number]>>;
};

function shapeUnit(frameWidth: number): number {
	return frameWidth / 720;
}

/** JEO's ▼ (see text-node.ts): 70 x 46 at a 1440-high frame, white at 85 %. */
function triangleFor({
	element,
	frameWidth,
	frameHeight,
}: {
	element: TimelineElement;
	frameWidth: number;
	frameHeight: number;
}): ShapeItem | null {
	if (element.type !== "text") return null;
	let layout: ReturnType<typeof measureTextElement>;
	try {
		layout = measureTextElement({
			element: element as TextElement,
			canvasHeight: frameHeight,
			localTime: 0,
			ctx: getTextMeasurementContext(),
		});
	} catch {
		return null;
	}
	const unit = frameHeight / 1440;
	// the size it rests at (a pop-up starts small; the shape follows it with
	// its own scale keyframes below)
	const scale = Math.abs(settled({ element, path: "transform.scaleX", fallback: 1 }));
	const rotation = starting({ element, path: "transform.rotate", fallback: 0 });
	const blockBottom =
		(layout.lines.length - 0.5) * layout.lineHeightPx - layout.block.visualCenterOffset;
	const localCentre = (blockBottom + 2 * unit + 23 * unit) * scale; // below the text centre
	const angle = (rotation * Math.PI) / 180;
	const dx = -Math.sin(angle) * localCentre;
	const dy = Math.cos(angle) * localCentre;
	const x0 = starting({ element, path: "transform.positionX", fallback: 0 });
	const y0 = starting({ element, path: "transform.positionY", fallback: 0 });
	const k = shapeUnit(frameWidth);
	const half = (35 * unit * scale) / k;
	const h = (46 * unit * scale) / k;
	// the user's own triangle: apex at +y, turned 180 degrees = ▼
	const points = [-half, -h / 2, 0, h / 2, half, -h / 2];
	const keyframes = keyframesOf(element);
	const moved: Record<string, Array<[number, number]>> = {};
	if (keyframes.x) moved.x = keyframes.x.map(([at, v]) => [at, v + dx]);
	if (keyframes.y) moved.y = keyframes.y.map(([at, v]) => [at, v + dy]);
	if (keyframes.opacity) moved.opacity = keyframes.opacity;
	if (keyframes.scale) {
		// grow with the text, and stay under it while it grows
		moved.scale = keyframes.scale.map(([at, v]) => [at, v / Math.max(scale, 1e-6)]);
		if (!keyframes.y) {
			moved.y = keyframes.scale.map(([at, v]) => [at, y0 + (dy * v) / Math.max(scale, 1e-6)]);
		}
	}
	return {
		start: element.startTime / S,
		duration: element.duration / S,
		x: x0 + dx,
		y: y0 + dy,
		rotation: 180 + rotation,
		points,
		fill: "#FFFFFF",
		fillAlpha: 0.85,
		border: "#FFFFFF",
		borderWidth: 0,
		keyframes: moved,
	};
}

/** JEO's curved arrow (graphics.ts) as one outline: shaft both sides + head. */
function arrowFor({
	element,
	frameWidth,
	frameHeight,
}: {
	element: TimelineElement;
	frameWidth: number;
	frameHeight: number;
}): ShapeItem | null {
	if (element.type !== "graphic") return null;
	const params = element.params as Record<string, unknown>;
	const side = Math.min(frameWidth, frameHeight);
	const sx = starting({ element, path: "transform.scaleX", fallback: 1 });
	const sy = starting({ element, path: "transform.scaleY", fallback: Math.abs(sx) });
	const w = side * Math.abs(sx);
	const h = side * Math.abs(sy);
	const thickness = (Number(params.thickness ?? 44) / 512) * w;
	const curve = Number(params.curve ?? 45) / 100;
	const tail = { x: w * 0.14, y: h * 0.84 };
	const tip = { x: w * 0.84, y: h * 0.16 };
	const mid = { x: (tail.x + tip.x) / 2, y: (tail.y + tip.y) / 2 };
	const control = { x: mid.x + w * 0.36 * curve, y: mid.y + h * 0.36 * curve };
	const angle = Math.atan2(tip.y - control.y, tip.x - control.x);
	const headLength = thickness * 2.4;
	const headHalf = thickness * 1.55;
	const base = { x: tip.x - Math.cos(angle) * headLength, y: tip.y - Math.sin(angle) * headLength };
	const at = (t: number) => ({
		x: (1 - t) ** 2 * tail.x + 2 * (1 - t) * t * control.x + t * t * base.x,
		y: (1 - t) ** 2 * tail.y + 2 * (1 - t) * t * control.y + t * t * base.y,
	});
	const normal = (t: number) => {
		const dx = 2 * (1 - t) * (control.x - tail.x) + 2 * t * (base.x - control.x);
		const dy = 2 * (1 - t) * (control.y - tail.y) + 2 * t * (base.y - control.y);
		const len = Math.hypot(dx, dy) || 1;
		return { x: -dy / len, y: dx / len };
	};
	const r = thickness / 2;
	const left: Array<{ x: number; y: number }> = [];
	const right: Array<{ x: number; y: number }> = [];
	const steps = 16;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const p = at(t);
		const n = normal(t);
		left.push({ x: p.x + n.x * r, y: p.y + n.y * r });
		right.push({ x: p.x - n.x * r, y: p.y - n.y * r });
	}
	const perp = { x: Math.cos(angle + Math.PI / 2), y: Math.sin(angle + Math.PI / 2) };
	const outline = [
		...left,
		{ x: base.x + perp.x * headHalf, y: base.y + perp.y * headHalf },
		tip,
		{ x: base.x - perp.x * headHalf, y: base.y - perp.y * headHalf },
		...right.reverse(),
	];
	// round tail cap
	const n0 = normal(0);
	const capAngle = Math.atan2(-n0.y, -n0.x);
	for (let i = 1; i < 6; i++) {
		const a = capAngle + (Math.PI * i) / 6;
		outline.push({ x: tail.x + Math.cos(a) * r, y: tail.y + Math.sin(a) * r });
	}
	const k = shapeUnit(frameWidth);
	const flip = sx < 0 ? -1 : 1;
	const points = outline.flatMap((p) => [((p.x - w / 2) * flip) / k, -(p.y - h / 2) / k]);
	return {
		start: element.startTime / S,
		duration: element.duration / S,
		x: starting({ element, path: "transform.positionX", fallback: 0 }),
		y: starting({ element, path: "transform.positionY", fallback: 0 }),
		rotation: starting({ element, path: "transform.rotate", fallback: 0 }),
		points,
		fill: String(params.fill ?? "#ff2d2d"),
		fillAlpha: 1,
		border: String(params.outline ?? "#ffffff"),
		borderWidth: (thickness * 0.28 * 2) / k,
		keyframes: keyframesOf(element),
	};
}

export interface CapCutExportResult {
	ok: boolean;
	error?: string;
	draftName?: string;
	/** where the replaced draft was kept */
	replacedBackup?: string;
	leftOut: string[];
	capcutWasRunning?: boolean;
}

export async function openInCapCut({
	onStage,
	mode = "new",
}: {
	/** called as each step begins, with words for the user */
	onStage?: (stage: string) => void;
	/** "replace" = take the place of the JEO draft with the same name */
	mode?: "replace" | "new";
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
			masks: [...masksOf({ element, asset }), ...(extraMasks.get(element.id) ?? [])],
			...(opacityOverride.has(element.id) ? { opacity: opacityOverride.get(element.id) } : {}),
		});
	};

	// A JEO spotlight is three layers (dimmed freeze frame, rectangle copy,
	// circle copy) because JEO draws one mask per clip. CapCut can hold several
	// masks on one clip, so it gets the user's own setup: ONE freeze clip with
	// both masks, at full strength. The copies are folded into it.
	const extraMasks = new Map<string, Array<Record<string, unknown>>>();
	const opacityOverride = new Map<string, number>();
	const folded = new Set<string>();
	for (const track of tracks.overlay) {
		for (const element of track.elements as TimelineElement[]) {
			if (element.type !== "video" && element.type !== "image") continue;
			if (element.name !== "Spotlight" && element.name !== "Spotlight box") continue;
			const base = tracks.main.elements.find(
				(item) =>
					"mediaId" in item &&
					item.mediaId === element.mediaId &&
					item.startTime === element.startTime &&
					item.duration === element.duration,
			);
			const asset = assets.find((item) => item.id === element.mediaId);
			const mask = asset ? maskOf({ element, asset }) : undefined;
			if (!base || !mask) continue;
			const list = extraMasks.get(base.id) ?? [];
			// rectangle first, then circle (the order the user adds them)
			if (element.name === "Spotlight box") list.unshift(mask);
			else list.push(mask);
			extraMasks.set(base.id, list);
			opacityOverride.set(base.id, 1);
			folded.add(element.id);
		}
	}
	for (const element of tracks.main.elements) {
		addVisual({ element: element as TimelineElement, overlay: false });
	}

	const texts: Array<Record<string, unknown>> = [];
	const effects: Array<Record<string, unknown>> = [];
	const spotlights: Array<Record<string, unknown>> = [];
	const shapes: ShapeItem[] = [];
	const pushShape = (shape: ShapeItem | null): boolean => {
		if (!shape) return false;
		shapes.push(shape);
		return true;
	};
	const frameWidth = project.settings.canvasSize.width;
	const frameHeight = project.settings.canvasSize.height;
	/** a plain scene text in the house style (white, dark outline, centred) */
	const sceneText = ({ text, start, duration }: { text: string; start: number; duration: number }) => ({
		text,
		start,
		duration,
		x: 0,
		y: 0,
		size: 5.478,
		scale: 1,
		rotation: 0,
		opacity: 1,
		keyframes: {},
		triangle: false,
		color: "#ffffff",
		stroke: true,
		strokeColor: "#000000",
		bold: true,
		italic: false,
		underline: false,
		align: "center",
	});
	// bottom row first: in CapCut a later layer is drawn on top (in JEO the
	// first row is on top), so the stacking comes out the same
	for (const track of [...tracks.overlay].reverse()) {
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
					// the ▼ goes as a real CapCut shape when it can be measured
					triangle:
						element.params["tag.triangle"] === true &&
						!pushShape(triangleFor({ element, frameWidth, frameHeight })),
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
				if (!folded.has(element.id)) addVisual({ element, overlay: true });
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
				if (element.effectType === "jeo-flash") {
					// CapCut's flash is not on this computer: leave a note in the video
					texts.push(
						sceneText({
							text: "(ADD C.F)",
							start: element.startTime / S,
							duration: Math.max(element.duration / S, 0.5),
						}),
					);
				} else if (kind) {
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
			} else if (element.type === "graphic" && element.definitionId === "jeo-spotlight") {
				// where the light sits on screen, in frame pixels from the centre
				// (graphics are fitted into the frame like clips: a square side
				// of the frame's short edge, then stretched by its scale)
				const side = Math.min(frameWidth, frameHeight);
				const width = side * Math.abs(starting({ element, path: "transform.scaleX", fallback: 1 }));
				const height = side * Math.abs(starting({ element, path: "transform.scaleY", fallback: 1 }));
				spotlights.push({
					start: element.startTime / S,
					duration: element.duration / S,
					x:
						starting({ element, path: "transform.positionX", fallback: 0 }) +
						(num(element.params.holeX, 0) / 100) * width,
					y:
						starting({ element, path: "transform.positionY", fallback: 0 }) +
						(num(element.params.holeY, 0) / 100) * height,
					radius: (num(element.params.radius, 24) / 100) * width,
				});
			} else if (element.type === "graphic" && element.definitionId === "jeo-arrow") {
				if (!pushShape(arrowFor({ element, frameWidth, frameHeight }))) {
					leftOut.add("arrow graphic");
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
		mode,
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
			spotlights,
			shapes,
			coverBase64,
		},
	});
	return {
		ok: outcome.ok,
		error: outcome.error,
		draftName: outcome.draftName,
		replacedBackup: outcome.replacedBackup,
		capcutWasRunning: outcome.capcutWasRunning,
		leftOut: [...leftOut, ...(outcome.warnings ?? [])],
	};
}
