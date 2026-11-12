import type { FrameRate } from "opencut-wasm";
import type { AnyBaseNode } from "./nodes/base-node";
import { createCanvasSurface } from "./canvas-utils";
import { buildFrameDescriptor } from "./compositor/frame-descriptor";
import { wasmCompositor } from "./compositor/wasm-compositor";
import { resolveRenderTree } from "./resolve";
import { applyPostFx, collectActivePostFx } from "@/jeo/post-fx";
import { TICKS_PER_SECOND } from "@/wasm";
import {
	measureSpanAsync,
	measureSpanSync,
	onRenderPerfFrameComplete,
} from "@/diagnostics/render-perf";

export type CanvasRendererParams = {
	width: number;
	height: number;
	fps: FrameRate;
};

export class CanvasRenderer {
	canvas: OffscreenCanvas;
	context: OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
	fps: FrameRate;

	constructor({ width, height, fps }: CanvasRendererParams) {
		this.width = width;
		this.height = height;
		this.fps = fps;

		const surface = createCanvasSurface({ width, height });
		this.canvas = surface.canvas;
		this.context = surface.context;
	}

	getOutputCanvas(): HTMLCanvasElement {
		wasmCompositor.ensureInitialized({
			width: this.width,
			height: this.height,
		});
		return wasmCompositor.getCanvas();
	}

	setSize({ width, height }: { width: number; height: number }) {
		this.width = width;
		this.height = height;

		const surface = createCanvasSurface({ width, height });
		this.canvas = surface.canvas;
		this.context = surface.context;
	}

	async render({ node, time }: { node: AnyBaseNode; time: number }) {
		await measureSpanAsync({
			name: "resolve",
			fn: () => resolveRenderTree({ node, renderer: this, time }),
		});
		const { frame, textures } = await measureSpanAsync({
			name: "buildFrame",
			fn: () => buildFrameDescriptor({ node, renderer: this }),
		});
		wasmCompositor.ensureInitialized({
			width: this.width,
			height: this.height,
		});
		measureSpanSync({
			name: "syncTextures",
			fn: () => wasmCompositor.syncTextures(textures),
		});
		measureSpanSync({
			name: "renderFrame",
			fn: () => wasmCompositor.render(frame),
		});
		this.runPostFx({ node, time });
	}

	// ---- JEO post effects (flash, blur-shake, colour split) ----
	private postCanvas: HTMLCanvasElement | null = null;
	/** true when the last rendered frame had a post effect on it */
	isPostActive = false;
	/** export sets this so every frame lands on the post canvas */
	alwaysCopyToPost = false;

	getPostCanvas(): HTMLCanvasElement {
		if (!this.postCanvas) {
			this.postCanvas = document.createElement("canvas");
		}
		if (
			this.postCanvas.width !== this.width ||
			this.postCanvas.height !== this.height
		) {
			this.postCanvas.width = this.width;
			this.postCanvas.height = this.height;
		}
		return this.postCanvas;
	}

	private runPostFx({ node, time }: { node: AnyBaseNode; time: number }): void {
		const effects = collectActivePostFx({ node, time });
		this.isPostActive = effects.length > 0;
		if (!this.isPostActive && !this.alwaysCopyToPost) return;

		const target = this.getPostCanvas();
		const ctx = target.getContext("2d");
		if (!ctx) return;
		const ticksPerFrame =
			(TICKS_PER_SECOND * this.fps.denominator) / this.fps.numerator;
		applyPostFx({
			source: wasmCompositor.getCanvas(),
			ctx,
			width: this.width,
			height: this.height,
			effects,
			frameIndex: Math.floor(time / ticksPerFrame),
		});
	}

	/** The canvas holding the finished frame (with post effects when active). */
	getFinalCanvas(): HTMLCanvasElement {
		return this.isPostActive || this.alwaysCopyToPost
			? this.getPostCanvas()
			: wasmCompositor.getCanvas();
	}

	async renderToCanvas({
		node,
		time,
		targetCanvas,
	}: {
		node: AnyBaseNode;
		time: number;
		targetCanvas: HTMLCanvasElement;
	}) {
		await this.render({ node, time });

		const ctx = targetCanvas.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to get target canvas context");
		}

		measureSpanSync({
			name: "drawImage",
			fn: () =>
				ctx.drawImage(
					this.getFinalCanvas(),
					0,
					0,
					targetCanvas.width,
					targetCanvas.height,
				),
		});
		onRenderPerfFrameComplete();
	}
}
