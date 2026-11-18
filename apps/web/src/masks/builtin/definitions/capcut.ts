/**
 * JEO: CapCut's own mask, drawn the way CapCut draws it.
 *
 * Read from CapCut's mask packages (Cache/effect/<id>/.../lumi_*_mask):
 *  - each shape paints a grey "how visible" picture with a shader: 1 inside,
 *    0 outside, and a smoothstep fade around the edge;
 *  - several masks on one clip are ADDED together, capped at fully visible
 *    (the shader's addBlend), then the clip is multiplied by the result;
 *  - feather is stretched: the scripts multiply it by 6 (rectangle) and 15
 *    (circle). Matching the user's finished GIRLFRIEND EXPOSED video showed
 *    two-thirds of that (4 and 10) is what reaches the screen, so those are
 *    used here.
 * Numbers are kept in CapCut's units: centre in half-sizes of the clip with up
 * positive, size as a part of the clip, feather and round corners 0..1.
 */
import type {
	CapCutMaskParams,
	CapCutMaskShape,
	MaskDefinition,
	MaskHandlePosition,
	MaskOverlay,
} from "@/masks/types";
import type { ParamDefinition } from "@/params";

export const CAPCUT_RECT_FEATHER_SCALE = 4;
export const CAPCUT_CIRCLE_FEATHER_SCALE = 10;
export const CAPCUT_MASK_SLOTS = [1, 2, 3, 4] as const;
export type CapCutSlot = (typeof CAPCUT_MASK_SLOTS)[number];

export interface CapCutShapeSettings {
	shape: CapCutMaskShape;
	x: number;
	y: number;
	w: number;
	h: number;
	r: number;
	f: number;
	c: number;
	invert: boolean;
}

export function readSlot(params: CapCutMaskParams, slot: CapCutSlot): CapCutShapeSettings {
	const p = params as unknown as Record<string, unknown>;
	return {
		shape: (p[`s${slot}`] as CapCutMaskShape) ?? "none",
		x: Number(p[`x${slot}`] ?? 0),
		y: Number(p[`y${slot}`] ?? 0),
		w: Number(p[`w${slot}`] ?? 0.5),
		h: Number(p[`h${slot}`] ?? 0.5),
		r: Number(p[`r${slot}`] ?? 0),
		f: Number(p[`f${slot}`] ?? 0),
		c: Number(p[`c${slot}`] ?? 0),
		invert: p[`i${slot}`] === true,
	};
}

export function slotPatch(slot: CapCutSlot, settings: Partial<CapCutShapeSettings>): Partial<CapCutMaskParams> {
	const out: Record<string, unknown> = {};
	if (settings.shape !== undefined) out[`s${slot}`] = settings.shape;
	if (settings.x !== undefined) out[`x${slot}`] = settings.x;
	if (settings.y !== undefined) out[`y${slot}`] = settings.y;
	if (settings.w !== undefined) out[`w${slot}`] = settings.w;
	if (settings.h !== undefined) out[`h${slot}`] = settings.h;
	if (settings.r !== undefined) out[`r${slot}`] = settings.r;
	if (settings.f !== undefined) out[`f${slot}`] = settings.f;
	if (settings.c !== undefined) out[`c${slot}`] = settings.c;
	if (settings.invert !== undefined) out[`i${slot}`] = settings.invert;
	return out as Partial<CapCutMaskParams>;
}

export function usedSlots(params: CapCutMaskParams): CapCutSlot[] {
	return CAPCUT_MASK_SLOTS.filter((slot) => readSlot(params, slot).shape !== "none");
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/** How visible one shape makes a point (X, Y in -1..1, up positive). */
function shapeValue(s: CapCutShapeSettings, X: number, Y: number, aspect: number): number {
	// CapCut: u_rotate = (360 + rotation) degrees, applied after the aspect stretch
	const angle = ((360 + s.r) * Math.PI) / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const px = (X - s.x) * aspect;
	const py = Y - s.y;
	const sx = cos * px - sin * py;
	const sy = sin * px + cos * py;
	let alpha: number;
	if (s.shape === "circle") {
		const diff = s.f * CAPCUT_CIRCLE_FEATHER_SCALE;
		const m = s.w / Math.max(s.h, 1e-6);
		let factor = s.w > s.h ? m : 1 / m;
		factor = Math.min(11, Math.max(1, factor));
		factor = ((factor - 1) / 10) ** 2 * 0.05;
		const a = Math.max(s.w * aspect, 1e-6);
		const b = Math.max(s.h, 1e-6);
		const d = (sx * sx) / (a * a) + (sy * sy) / (b * b);
		alpha = smoothstep(1 - diff - factor, 1 + diff + factor, d);
	} else {
		const diff = s.f * CAPCUT_RECT_FEATHER_SCALE;
		const ax = Math.abs(sx);
		const ay = Math.abs(sy);
		const sizeX = Math.max(s.w, 1e-6);
		const sizeY = Math.max(s.h, 1e-6);
		const rightTopX = sizeX * aspect;
		const rightTopY = sizeY;
		const radius = (rightTopX >= rightTopY ? rightTopY : rightTopX) * s.c;
		const ccX = rightTopX - radius;
		const ccY = rightTopY - radius;
		let d: number;
		if (ay * ccX >= rightTopY * ax) {
			d = ay / sizeY;
		} else if (ay * rightTopX <= ccY * ax) {
			d = ax / (aspect * sizeX);
		} else {
			const qa = ccX * ccX + ccY * ccY - radius * radius;
			const qb = -2 * (ax * ccX + ay * ccY);
			const qc = ax * ax + ay * ay;
			if (Math.abs(qa) < 1e-8) d = Math.abs(qb) < 1e-8 ? 100 : -qc / qb;
			else d = (-qb - Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc))) / (2 * qa);
		}
		const wrapped = (((angle % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)) / (Math.PI / 4) - 1;
		const decay = Math.sqrt(Math.sqrt(Math.sqrt(Math.max(0, 1 - wrapped * wrapped))));
		alpha = smoothstep(1 - decay * 0.005 - diff, 1 + decay * 0.005 + diff, d);
	}
	alpha = Math.min(1, Math.max(0, alpha));
	return s.invert ? alpha : 1 - alpha;
}

const cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

/** The whole mask (all shapes added together) as a small white picture. */
function maskPicture(params: CapCutMaskParams, width: number, height: number) {
	const shapes = usedSlots(params).map((slot) => readSlot(params, slot));
	const gw = Math.max(8, Math.min(320, Math.round(width)));
	const gh = Math.max(8, Math.round((gw * height) / Math.max(width, 1)));
	const key = `${gw}x${gh}:${width / Math.max(height, 1)}:${JSON.stringify(shapes)}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const aspect = width / Math.max(height, 1);
	const canvas: HTMLCanvasElement | OffscreenCanvas =
		typeof OffscreenCanvas !== "undefined"
			? new OffscreenCanvas(gw, gh)
			: Object.assign(document.createElement("canvas"), { width: gw, height: gh });
	const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
	if (!ctx) return canvas;
	const image = ctx.createImageData(gw, gh);
	for (let row = 0; row < gh; row++) {
		const Y = (0.5 - (row + 0.5) / gh) * 2;
		for (let col = 0; col < gw; col++) {
			const X = ((col + 0.5) / gw - 0.5) * 2;
			let value = 0;
			for (const shape of shapes) {
				value += shapeValue(shape, X, Y, aspect);
				if (value >= 1) break;
			}
			const at = (row * gw + col) * 4;
			image.data[at] = 255;
			image.data[at + 1] = 255;
			image.data[at + 2] = 255;
			image.data[at + 3] = Math.round(Math.min(1, value) * 255);
		}
	}
	ctx.putImageData(image, 0, 0);
	if (cache.size > 12) cache.delete(cache.keys().next().value as string);
	cache.set(key, canvas);
	return canvas;
}

function slotParams(slot: CapCutSlot): ParamDefinition<string>[] {
	return [
		{
			key: `s${slot}`,
			label: `Mask ${slot}`,
			type: "select",
			default: slot === 1 ? "circle" : "none",
			options: [
				{ value: "none", label: "None" },
				{ value: "rectangle", label: "Rectangle" },
				{ value: "circle", label: "Circle" },
			],
		},
		{ key: `x${slot}`, label: "X", type: "number", default: 0, min: -4, max: 4, step: 0.001 },
		{ key: `y${slot}`, label: "Y", type: "number", default: 0, min: -4, max: 4, step: 0.001 },
		{ key: `w${slot}`, label: "Width", type: "number", default: 0.5, min: 0.005, max: 4, step: 0.001 },
		{ key: `h${slot}`, label: "Height", type: "number", default: 0.5, min: 0.005, max: 4, step: 0.001 },
		{ key: `r${slot}`, label: "Rotation", type: "number", default: 0, min: -360, max: 360, step: 0.1 },
		{ key: `f${slot}`, label: "Feather", type: "number", default: 0, min: 0, max: 1, step: 0.01 },
		{ key: `c${slot}`, label: "Round corners", type: "number", default: 0, min: 0, max: 1, step: 0.01 },
		{ key: `i${slot}`, label: "Invert", type: "boolean", default: false },
	];
}

/** Outline of one shape in canvas pixels (for the handles on the preview). */
function outlinePath(s: CapCutShapeSettings, width: number, height: number): string {
	const w = s.w * width;
	const h = s.h * height;
	if (s.shape === "circle") {
		const rx = w / 2;
		const ry = h / 2;
		return `M ${w / 2},${h / 2 - ry} A ${rx},${ry} 0 1,1 ${w / 2},${h / 2 + ry} A ${rx},${ry} 0 1,1 ${w / 2},${h / 2 - ry} Z`;
	}
	const r = Math.min(w, h) * 0.5 * s.c;
	return `M ${r},0 H ${w - r} A ${r},${r} 0 0 1 ${w},${r} V ${h - r} A ${r},${r} 0 0 1 ${w - r},${h} H ${r} A ${r},${r} 0 0 1 0,${h - r} V ${r} A ${r},${r} 0 0 1 ${r},0 Z`;
}

function rotate(x: number, y: number, cx: number, cy: number, deg: number) {
	const a = (deg * Math.PI) / 180;
	return {
		x: cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a),
		y: cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a),
	};
}

export const capcutMaskDefinition: MaskDefinition<"capcut"> = {
	type: "capcut",
	name: "CapCut mask",
	features: { hasPosition: true, hasRotation: true, sizeMode: "width-height" },
	params: [
		{ key: "active", label: "Editing", type: "number", default: 1, min: 1, max: 4, step: 1 },
		...CAPCUT_MASK_SLOTS.flatMap((slot) => slotParams(slot)),
	] as ParamDefinition<keyof CapCutMaskParams & string>[],
	isActive: (params) => usedSlots(params).length > 0,
	buildDefault({ elementSize }) {
		const width = elementSize?.width ?? 1080;
		const height = elementSize?.height ?? 1920;
		const w = 0.5;
		const params: Record<string, unknown> = {
			feather: 0,
			inverted: false,
			strokeColor: "#ffffff",
			strokeWidth: 0,
			strokeAlign: "center",
			active: 1,
		};
		for (const slot of CAPCUT_MASK_SLOTS) {
			Object.assign(params, {
				[`s${slot}`]: slot === 1 ? "circle" : "none",
				[`x${slot}`]: 0,
				[`y${slot}`]: 0,
				[`w${slot}`]: w,
				// round on screen
				[`h${slot}`]: (w * width) / height,
				[`r${slot}`]: 0,
				[`f${slot}`]: 0,
				[`c${slot}`]: 0,
				[`i${slot}`]: false,
			});
		}
		return { type: "capcut", params: params as unknown as CapCutMaskParams };
	},
	renderer: {
		body: {
			kind: "drawWithFeather",
			drawWithFeather({ resolvedParams, ctx, width, height }) {
				const picture = maskPicture(resolvedParams, width, height);
				ctx.imageSmoothingEnabled = true;
				ctx.drawImage(picture as CanvasImageSource, 0, 0, width, height);
			},
		},
	},
	interaction: {
		getInteraction({ params, bounds, displayScale, scaleX, scaleY }) {
			const overlays: MaskOverlay[] = [];
			const handles: MaskHandlePosition[] = [];
			const active = Math.min(4, Math.max(1, Math.round(params.active || 1))) as CapCutSlot;
			for (const slot of usedSlots(params)) {
				const s = readSlot(params, slot);
				const cx = bounds.cx + (s.x / 2) * bounds.width;
				const cy = bounds.cy - (s.y / 2) * bounds.height;
				const w = s.w * bounds.width;
				const h = s.h * bounds.height;
				overlays.push({
					id: `capcut-shape-${slot}`,
					type: "shape",
					center: { x: cx, y: cy },
					width: w,
					height: h,
					rotation: s.r,
					// the outline is drawn in screen pixels
					pathData: outlinePath(s, bounds.width * scaleX, bounds.height * scaleY),
					handleId: { kind: "anchor", pointId: `s${slot}:move` },
					cursor: "move",
				});
				if (slot !== active) continue;
				overlays.push({
					id: `capcut-box-${slot}`,
					type: "rect",
					center: { x: cx, y: cy },
					width: w,
					height: h,
					rotation: s.r,
					dashed: true,
				});
				const edge = (side: string, lx: number, ly: number, axis: "horizontal" | "vertical", cursor: string) => {
					const p = rotate(cx + lx, cy + ly, cx, cy, s.r);
					handles.push({
						id: { kind: "anchor", pointId: `s${slot}:${side}` },
						x: p.x,
						y: p.y,
						cursor,
						kind: "edge",
						edgeAxis: axis,
						rotation: s.r,
					});
				};
				edge("right", w / 2, 0, "vertical", "ew-resize");
				edge("left", -w / 2, 0, "vertical", "ew-resize");
				edge("bottom", 0, h / 2, "horizontal", "ns-resize");
				edge("top", 0, -h / 2, "horizontal", "ns-resize");
				const offset = 22 / Math.max(displayScale, 1e-3);
				const rot = rotate(cx, cy + h / 2 + offset, cx, cy, s.r);
				handles.push({ id: { kind: "anchor", pointId: `s${slot}:rotate` }, x: rot.x, y: rot.y, cursor: "grab", kind: "icon", icon: "rotate" });
				const fea = rotate(cx, cy - h / 2 - offset, cx, cy, s.r);
				handles.push({ id: { kind: "anchor", pointId: `s${slot}:feather` }, x: fea.x, y: fea.y, cursor: "ns-resize", kind: "icon", icon: "feather" });
				handles.push({ id: { kind: "anchor", pointId: `s${slot}:move` }, x: cx, y: cy, cursor: "move", kind: "point" });
			}
			return { handles, overlays };
		},
	},
	computeParamUpdate({ handleId, startParams, deltaX, deltaY, startCanvasX, startCanvasY, bounds }) {
		if (handleId.kind !== "anchor") return {};
		const [slotText, action] = handleId.pointId.replace(/^s/, "").split(":");
		const slot = Math.min(4, Math.max(1, Number(slotText))) as CapCutSlot;
		const s = readSlot(startParams, slot);
		const base = { active: slot } as Partial<CapCutMaskParams>;
		if (action === "move") {
			return {
				...base,
				...slotPatch(slot, {
					x: s.x + (2 * deltaX) / bounds.width,
					y: s.y - (2 * deltaY) / bounds.height,
				}),
			};
		}
		// drag along the shape's own axes
		const a = (-s.r * Math.PI) / 180;
		const lx = deltaX * Math.cos(a) - deltaY * Math.sin(a);
		const ly = deltaX * Math.sin(a) + deltaY * Math.cos(a);
		if (action === "right" || action === "left") {
			const sign = action === "right" ? 1 : -1;
			return { ...base, ...slotPatch(slot, { w: Math.max(0.01, s.w + (2 * sign * lx) / bounds.width) }) };
		}
		if (action === "bottom" || action === "top") {
			const sign = action === "bottom" ? 1 : -1;
			return { ...base, ...slotPatch(slot, { h: Math.max(0.01, s.h + (2 * sign * ly) / bounds.height) }) };
		}
		if (action === "feather") {
			return { ...base, ...slotPatch(slot, { f: Math.min(1, Math.max(0, s.f - deltaY / 300)) }) };
		}
		if (action === "rotate") {
			const cx = bounds.cx + (s.x / 2) * bounds.width;
			const cy = bounds.cy - (s.y / 2) * bounds.height;
			const start = Math.atan2(startCanvasY - cy, startCanvasX - cx);
			const now = Math.atan2(startCanvasY + deltaY - cy, startCanvasX + deltaX - cx);
			let r = s.r + ((now - start) * 180) / Math.PI;
			if (r > 360) r -= 360;
			if (r < -360) r += 360;
			return { ...base, ...slotPatch(slot, { r }) };
		}
		return base;
	},
};
