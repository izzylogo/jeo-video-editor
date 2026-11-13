/**
 * JEO post effects: colour flash, blur-shake and colour split.
 *
 * The engine (opencut-wasm) only ships a blur shader, so these three run as a
 * light extra step on the finished frame (2D canvas), in preview and export.
 * They live on the timeline as normal "effect" elements, so they can be moved,
 * trimmed, deleted and undone like anything else.
 */
import type { EffectDefinition } from "@/effects/types";
import type { ParamValues } from "@/params";
import type { AnyBaseNode } from "@/services/renderer/nodes/base-node";
import { EffectLayerNode } from "@/services/renderer/nodes/effect-layer-node";
import { TICKS_PER_SECOND } from "@/wasm";

export const JEO_FLASH = "jeo-flash";
export const JEO_SHAKE = "jeo-shake";
export const JEO_SPLIT = "jeo-split";
export const JEO_ZOOM = "jeo-zoom";
export const JEO_PUSH = "jeo-push";
export const JEO_BLUR = "jeo-blur";
export const JEO_LOOK = "jeo-look";
export const JEO_VIGNETTE = "jeo-vignette";
export const JEO_GLITCH = "jeo-glitch";
export const JEO_TRANSITION = "jeo-transition";
const JEO_POST_TYPES = new Set([
	JEO_FLASH,
	JEO_SHAKE,
	JEO_SPLIT,
	JEO_ZOOM,
	JEO_PUSH,
	JEO_BLUR,
	JEO_LOOK,
	JEO_VIGNETTE,
	JEO_GLITCH,
	JEO_TRANSITION,
]);

export const TRANSITION_STYLES = [
	{ value: "black", label: "Dip to black" },
	{ value: "white", label: "Dip to white" },
	{ value: "blur", label: "Blur" },
	{ value: "zoom", label: "Zoom" },
	{ value: "shake", label: "Shake" },
	{ value: "glare", label: "Glare" },
] as const;

export const LOOK_STYLES = [
	{ value: "bw", label: "Black and white" },
	{ value: "old", label: "Old film" },
	{ value: "vivid", label: "Vivid" },
	{ value: "cold", label: "Cold" },
	{ value: "dark", label: "Darker" },
] as const;

export function isJeoPostEffect({ effectType }: { effectType: string }): boolean {
	return JEO_POST_TYPES.has(effectType);
}

const noPasses = { passes: [] };

export const jeoPostEffectDefinitions: EffectDefinition[] = [
	{
		type: JEO_FLASH,
		name: "Colour flash",
		keywords: ["flash", "c.f", "colour", "color"],
		params: [
			{ key: "color", label: "Colour", type: "color", default: "#ffffff" },
			{
				key: "strength",
				label: "Strength",
				type: "number",
				default: 80,
				min: 0,
				max: 100,
				step: 1,
			},
		],
		renderer: noPasses,
	},
	{
		type: JEO_SHAKE,
		name: "Blur shake",
		keywords: ["shake", "blur", "glitch"],
		params: [
			{
				key: "amount",
				label: "Shake",
				type: "number",
				default: 26,
				min: 0,
				max: 120,
				step: 1,
			},
			{
				key: "blur",
				label: "Blur",
				type: "number",
				default: 10,
				min: 0,
				max: 40,
				step: 1,
			},
		],
		renderer: noPasses,
	},
	{
		type: JEO_SPLIT,
		name: "Colour split",
		keywords: ["rgb", "split", "chromatic", "red", "blue"],
		params: [
			{
				key: "amount",
				label: "Amount",
				type: "number",
				default: 9,
				min: 0,
				max: 40,
				step: 1,
			},
			{
				key: "fadeIn",
				label: "Fade in (s)",
				type: "number",
				default: 0.4,
				min: 0,
				max: 3,
				step: 0.1,
			},
		],
		renderer: noPasses,
	},
	{
		type: JEO_ZOOM,
		name: "Zoom punch",
		keywords: ["zoom", "punch", "hit", "impact"],
		params: [
			{ key: "amount", label: "Zoom (%)", type: "number", default: 14, min: 0, max: 80, step: 1 },
		],
		renderer: noPasses,
	},
	{
		type: JEO_PUSH,
		name: "Slow zoom in",
		keywords: ["zoom", "push", "slow", "ken burns"],
		params: [
			{ key: "amount", label: "Zoom (%)", type: "number", default: 10, min: 0, max: 80, step: 1 },
		],
		renderer: noPasses,
	},
	{
		type: JEO_BLUR,
		name: "Blur",
		keywords: ["blur", "soft", "focus"],
		params: [
			{ key: "amount", label: "Blur", type: "number", default: 14, min: 0, max: 60, step: 1 },
		],
		renderer: noPasses,
	},
	{
		type: JEO_LOOK,
		name: "Look",
		keywords: ["filter", "look", "black", "white", "old", "vivid", "cold"],
		params: [
			{
				key: "style",
				label: "Look",
				type: "select",
				default: "bw",
				options: LOOK_STYLES.map((item) => ({ ...item })),
			},
			{ key: "strength", label: "Strength", type: "number", default: 100, min: 0, max: 100, step: 1 },
		],
		renderer: noPasses,
	},
	{
		type: JEO_VIGNETTE,
		name: "Dark edges",
		keywords: ["vignette", "edges", "focus", "dark"],
		params: [
			{ key: "strength", label: "Strength", type: "number", default: 60, min: 0, max: 100, step: 1 },
		],
		renderer: noPasses,
	},
	{
		type: JEO_GLITCH,
		name: "Glitch",
		keywords: ["glitch", "distort", "rgb", "error"],
		params: [
			{ key: "amount", label: "Amount", type: "number", default: 30, min: 0, max: 100, step: 1 },
		],
		renderer: noPasses,
	},
	{
		type: JEO_TRANSITION,
		name: "Transition",
		keywords: ["transition", "cut", "dip", "fade", "glare"],
		params: [
			{
				key: "style",
				label: "Style",
				type: "select",
				default: "black",
				options: TRANSITION_STYLES.map((item) => ({ ...item })),
			},
		],
		renderer: noPasses,
	},
];

export interface ActivePostFx {
	type: string;
	params: ParamValues;
	/** seconds since the effect started */
	localSeconds: number;
	/** 0 at the start of the effect, 1 at its end */
	progress: number;
}

export function hasPostFx({ node }: { node: AnyBaseNode }): boolean {
	if (
		node instanceof EffectLayerNode &&
		isJeoPostEffect({ effectType: node.params.effectType })
	) {
		return true;
	}
	return node.children.some((child) => hasPostFx({ node: child }));
}

export function collectActivePostFx({
	node,
	time,
	into = [],
}: {
	node: AnyBaseNode;
	time: number;
	into?: ActivePostFx[];
}): ActivePostFx[] {
	if (
		node instanceof EffectLayerNode &&
		isJeoPostEffect({ effectType: node.params.effectType })
	) {
		const { timeOffset, duration, effectType, effectParams } = node.params;
		if (time >= timeOffset - 1e-6 && time < timeOffset + duration - 1e-6) {
			into.push({
				type: effectType,
				params: effectParams,
				localSeconds: (time - timeOffset) / TICKS_PER_SECOND,
				progress: duration > 0 ? (time - timeOffset) / duration : 0,
			});
		}
	}
	for (const child of node.children) {
		collectActivePostFx({ node: child, time, into });
	}
	return into;
}

function numberParam({
	params,
	key,
	fallback,
}: {
	params: ParamValues;
	key: string;
	fallback: number;
}): number {
	const value = params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Repeatable "random" number in -1..1, so preview and export shake the same. */
function jitter({ seed }: { seed: number }): number {
	const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
	return (x - Math.floor(x)) * 2 - 1;
}

type Ctx2D = CanvasRenderingContext2D;

let scratchA: HTMLCanvasElement | null = null;
let scratchB: HTMLCanvasElement | null = null;

function getScratch({
	which,
	width,
	height,
}: {
	which: "a" | "b";
	width: number;
	height: number;
}): { canvas: HTMLCanvasElement; ctx: Ctx2D } {
	let canvas = which === "a" ? scratchA : scratchB;
	if (!canvas) {
		canvas = document.createElement("canvas");
		if (which === "a") scratchA = canvas;
		else scratchB = canvas;
	}
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Failed to create scratch canvas");
	return { canvas, ctx };
}

/** Redraws the current picture through a filter, zoomed about its centre. */
function redraw({
	ctx,
	width,
	height,
	filter,
	scale = 1,
	dx = 0,
	dy = 0,
}: {
	ctx: Ctx2D;
	width: number;
	height: number;
	filter?: string;
	scale?: number;
	dx?: number;
	dy?: number;
}): void {
	const a = getScratch({ which: "a", width, height });
	a.ctx.globalCompositeOperation = "copy";
	a.ctx.drawImage(ctx.canvas, 0, 0);
	ctx.save();
	ctx.fillStyle = "#000000";
	ctx.fillRect(0, 0, width, height);
	if (filter) ctx.filter = filter;
	ctx.translate(width / 2 + dx, height / 2 + dy);
	ctx.scale(scale, scale);
	ctx.drawImage(a.canvas, -width / 2, -height / 2);
	ctx.restore();
	ctx.filter = "none";
}

/** Draws `source` into `ctx`, then applies every active effect in order. */
export function applyPostFx({
	source,
	ctx,
	width,
	height,
	effects,
	frameIndex,
}: {
	source: CanvasImageSource;
	ctx: Ctx2D;
	width: number;
	height: number;
	effects: ActivePostFx[];
	frameIndex: number;
}): void {
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = "source-over";
	ctx.filter = "none";
	ctx.drawImage(source, 0, 0, width, height);

	// effects are sized for a 1080-wide frame
	const unit = width / 1080;

	for (const fx of effects) {
		if (fx.type === JEO_SHAKE) {
			const amount = numberParam({ params: fx.params, key: "amount", fallback: 26 });
			const blur = numberParam({ params: fx.params, key: "blur", fallback: 10 });
			const a = getScratch({ which: "a", width, height });
			a.ctx.globalCompositeOperation = "copy";
			a.ctx.drawImage(ctx.canvas, 0, 0);
			const dx = jitter({ seed: frameIndex * 2 + 1 }) * amount * unit;
			const dy = jitter({ seed: frameIndex * 2 + 2 }) * amount * unit;
			// zoom in slightly so the shaken picture never shows empty edges
			const zoom = 1 + (2 * amount * unit) / Math.min(width, height) + 0.02;
			ctx.save();
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);
			if (blur > 0) ctx.filter = `blur(${(blur * unit * 0.6).toFixed(2)}px)`;
			ctx.translate(width / 2 + dx, height / 2 + dy);
			ctx.scale(zoom, zoom);
			ctx.drawImage(a.canvas, -width / 2, -height / 2);
			ctx.restore();
			ctx.filter = "none";
		} else if (fx.type === JEO_SPLIT) {
			const amount = numberParam({ params: fx.params, key: "amount", fallback: 9 });
			const fadeIn = numberParam({ params: fx.params, key: "fadeIn", fallback: 0.4 });
			const ramp = fadeIn > 0 ? Math.min(1, fx.localSeconds / fadeIn) : 1;
			// reaches about 2/3 after the fade-in, then keeps growing to the end
			const shift = amount * unit * ramp * (0.67 + 0.33 * fx.progress);
			if (shift < 0.25) continue;
			const a = getScratch({ which: "a", width, height });
			a.ctx.globalCompositeOperation = "copy";
			a.ctx.drawImage(ctx.canvas, 0, 0);
			const b = getScratch({ which: "b", width, height });

			ctx.save();
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, width, height);
			ctx.globalCompositeOperation = "lighter";
			for (const [tint, offset] of [
				["#ff0000", -shift],
				["#00ffff", shift],
			] as const) {
				b.ctx.globalCompositeOperation = "copy";
				b.ctx.drawImage(a.canvas, 0, 0);
				b.ctx.globalCompositeOperation = "multiply";
				b.ctx.fillStyle = tint;
				b.ctx.fillRect(0, 0, width, height);
				// stretch a little so the shifted copy still covers the frame
				ctx.drawImage(
					b.canvas,
					offset - Math.abs(shift),
					0,
					width + 2 * Math.abs(shift),
					height,
				);
			}
			ctx.restore();
		} else if (fx.type === JEO_ZOOM || fx.type === JEO_PUSH) {
			const amount =
				numberParam({ params: fx.params, key: "amount", fallback: 12 }) / 100;
			// punch: jumps in fast and eases back; push: grows steadily
			const curve =
				fx.type === JEO_ZOOM
					? fx.progress < 0.18
						? fx.progress / 0.18
						: (1 - (fx.progress - 0.18) / 0.82) ** 2
					: fx.progress;
			redraw({ ctx, width, height, scale: 1 + amount * curve });
		} else if (fx.type === JEO_BLUR) {
			const amount = numberParam({ params: fx.params, key: "amount", fallback: 14 });
			if (amount > 0) {
				redraw({
					ctx,
					width,
					height,
					filter: `blur(${(amount * unit * 0.6).toFixed(2)}px)`,
					scale: 1 + (amount * unit * 2.4) / Math.min(width, height),
				});
			}
		} else if (fx.type === JEO_LOOK) {
			const strength =
				numberParam({ params: fx.params, key: "strength", fallback: 100 }) / 100;
			const style = typeof fx.params.style === "string" ? fx.params.style : "bw";
			const filter =
				style === "old"
					? `sepia(${(0.75 * strength).toFixed(2)}) contrast(${(1 + 0.12 * strength).toFixed(2)}) brightness(${(1 - 0.06 * strength).toFixed(2)})`
					: style === "vivid"
						? `saturate(${(1 + 0.6 * strength).toFixed(2)}) contrast(${(1 + 0.12 * strength).toFixed(2)})`
						: style === "cold"
							? `saturate(${(1 - 0.25 * strength).toFixed(2)}) hue-rotate(${(-12 * strength).toFixed(1)}deg) brightness(${(1 + 0.03 * strength).toFixed(2)})`
							: style === "dark"
								? `brightness(${(1 - 0.4 * strength).toFixed(2)})`
								: `grayscale(${strength.toFixed(2)})`;
			redraw({ ctx, width, height, filter });
		} else if (fx.type === JEO_VIGNETTE) {
			const strength =
				numberParam({ params: fx.params, key: "strength", fallback: 60 }) / 100;
			const far = Math.hypot(width, height) / 2;
			const shade = ctx.createRadialGradient(
				width / 2,
				height / 2,
				far * 0.45,
				width / 2,
				height / 2,
				far,
			);
			shade.addColorStop(0, "rgba(0,0,0,0)");
			shade.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, strength).toFixed(2)})`);
			ctx.save();
			ctx.fillStyle = shade;
			ctx.fillRect(0, 0, width, height);
			ctx.restore();
		} else if (fx.type === JEO_GLITCH) {
			const amount =
				numberParam({ params: fx.params, key: "amount", fallback: 30 }) / 100;
			const a = getScratch({ which: "a", width, height });
			a.ctx.globalCompositeOperation = "copy";
			a.ctx.drawImage(ctx.canvas, 0, 0);
			// a new pattern every two frames, so it flickers instead of buzzing
			const beat = Math.floor(frameIndex / 2);
			ctx.save();
			for (let band = 0; band < 7; band++) {
				const roll = jitter({ seed: beat * 13 + band * 7 });
				if (Math.abs(roll) < 0.45) continue;
				const y = Math.floor(
					((jitter({ seed: beat * 5 + band * 3 }) + 1) / 2) * height,
				);
				const h = Math.max(
					4,
					Math.floor(((jitter({ seed: beat + band * 11 }) + 1) / 2) * height * 0.09),
				);
				ctx.drawImage(a.canvas, 0, y, width, h, roll * amount * 90 * unit, y, width, h);
			}
			const b = getScratch({ which: "b", width, height });
			b.ctx.globalCompositeOperation = "copy";
			b.ctx.drawImage(a.canvas, 0, 0);
			b.ctx.globalCompositeOperation = "multiply";
			b.ctx.fillStyle = "#ff0040";
			b.ctx.fillRect(0, 0, width, height);
			ctx.globalCompositeOperation = "lighter";
			ctx.globalAlpha = 0.5 * amount;
			ctx.drawImage(b.canvas, jitter({ seed: beat * 3 }) * amount * 26 * unit, 0);
			ctx.restore();
		} else if (fx.type === JEO_TRANSITION) {
			const style = typeof fx.params.style === "string" ? fx.params.style : "black";
			// 0 at both ends, 1 on the cut in the middle
			const peak = 1 - Math.abs(2 * fx.progress - 1);
			const eased = peak * peak * (3 - 2 * peak);
			if (style === "black" || style === "white") {
				ctx.save();
				ctx.globalAlpha = Math.min(1, eased * 1.15);
				ctx.fillStyle = style === "black" ? "#000000" : "#ffffff";
				ctx.fillRect(0, 0, width, height);
				ctx.restore();
			} else if (style === "blur") {
				redraw({
					ctx,
					width,
					height,
					filter: `blur(${(eased * 26 * unit).toFixed(2)}px)`,
					scale: 1 + eased * 0.08,
				});
			} else if (style === "zoom") {
				redraw({
					ctx,
					width,
					height,
					filter: `blur(${(eased * 9 * unit).toFixed(2)}px)`,
					scale: 1 + eased * 0.55,
				});
			} else if (style === "shake") {
				redraw({
					ctx,
					width,
					height,
					filter: `blur(${(eased * 6 * unit).toFixed(2)}px)`,
					scale: 1.06,
					dx: jitter({ seed: frameIndex * 2 + 1 }) * eased * 46 * unit,
					dy: jitter({ seed: frameIndex * 2 + 2 }) * eased * 46 * unit,
				});
			} else if (style === "glare") {
				// a bright band sweeps across while the picture lifts to white
				ctx.save();
				ctx.globalCompositeOperation = "lighter";
				ctx.globalAlpha = Math.min(1, eased * 0.85);
				ctx.fillStyle = "#ffffff";
				ctx.fillRect(0, 0, width, height);
				const centre = (fx.progress * 1.6 - 0.3) * width;
				const band = ctx.createLinearGradient(
					centre - width * 0.35,
					0,
					centre + width * 0.35,
					height * 0.35,
				);
				band.addColorStop(0, "rgba(255,255,255,0)");
				band.addColorStop(0.5, "rgba(255,244,214,0.95)");
				band.addColorStop(1, "rgba(255,255,255,0)");
				ctx.globalAlpha = Math.min(1, 0.35 + eased * 0.65);
				ctx.fillStyle = band;
				ctx.fillRect(0, 0, width, height);
				ctx.restore();
			}
		} else if (fx.type === JEO_FLASH) {
			const strength =
				numberParam({ params: fx.params, key: "strength", fallback: 80 }) / 100;
			const color =
				typeof fx.params.color === "string" ? fx.params.color : "#ffffff";
			const alpha = strength * (1 - fx.progress) ** 1.5;
			if (alpha <= 0.003) continue;
			ctx.save();
			ctx.globalAlpha = Math.min(1, alpha);
			ctx.fillStyle = color;
			ctx.fillRect(0, 0, width, height);
			ctx.restore();
		}
	}
}
