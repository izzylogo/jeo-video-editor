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
const JEO_POST_TYPES = new Set([JEO_FLASH, JEO_SHAKE, JEO_SPLIT]);

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
