import { BaseNode } from "./base-node";
import type { TextElement } from "@/timeline";
import type { EffectPass } from "@/effects/types";
import type { BlendMode, Transform } from "@/rendering";
import { drawMeasuredTextLayout } from "@/text/primitives";
import type { MeasuredTextElement } from "@/text/measure-element";
import { DEFAULTS } from "@/timeline/defaults";

export type TextNodeParams = TextElement & {
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	canvasCenter: { x: number; y: number };
	canvasHeight: number;
	textBaseline?: CanvasTextBaseline;
};

export interface ResolvedTextNodeState {
	transform: Transform;
	opacity: number;
	textColor: string;
	backgroundColor: string;
	effectPasses: EffectPass[][];
	measuredText: MeasuredTextElement;
}

export class TextNode extends BaseNode<TextNodeParams, ResolvedTextNodeState> {}

export function renderTextToContext({
	node,
	ctx,
}: {
	node: TextNode;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): void {
	const resolved = node.resolved;
	if (!resolved) {
		return;
	}

	const x = resolved.transform.position.x + node.params.canvasCenter.x;
	const y = resolved.transform.position.y + node.params.canvasCenter.y;
	const baseline = node.params.textBaseline ?? "middle";

	ctx.save();
	ctx.translate(x, y);
	// JEO: a line that is too long is shrunk so it never runs off the screen.
	const layoutForFit = resolved.measuredText;
	const canvasWidth = node.params.canvasCenter.x * 2;
	const widestLine = layoutForFit.lineMetrics.reduce(
		(widest, metrics) => Math.max(widest, metrics.width),
		0,
	);
	const allowedWidth = canvasWidth * (1040 / 1080);
	const shownWidth = widestLine * Math.abs(resolved.transform.scaleX);
	const fit = shownWidth > allowedWidth ? allowedWidth / shownWidth : 1;

	ctx.scale(resolved.transform.scaleX * fit, resolved.transform.scaleY * fit);
	if (resolved.transform.rotate) {
		ctx.rotate((resolved.transform.rotate * Math.PI) / 180);
	}

	// JEO: text outline. Width is a percentage of the font size.
	const elementParams = node.params.params;
	const strokeEnabled =
		typeof elementParams["stroke.enabled"] === "boolean"
			? elementParams["stroke.enabled"]
			: DEFAULTS.text.stroke.enabled;
	const strokeColor =
		typeof elementParams["stroke.color"] === "string"
			? elementParams["stroke.color"]
			: DEFAULTS.text.stroke.color;
	const strokeWidthPercent =
		typeof elementParams["stroke.width"] === "number"
			? elementParams["stroke.width"]
			: DEFAULTS.text.stroke.width;

	drawMeasuredTextLayout({
		ctx,
		stroke: strokeEnabled
			? {
					color: strokeColor,
					widthPx:
						(resolved.measuredText.scaledFontSize * strokeWidthPercent) / 100,
				}
			: null,
		layout: resolved.measuredText,
		textColor: resolved.textColor,
		background: resolved.measuredText.resolvedBackground,
		backgroundColor: resolved.backgroundColor,
		textBaseline: baseline,
	});

	// JEO: identity tag. A small see-through ▼ under the label, pointing at
	// the person's head. It belongs to the text, so it moves with it.
	if (elementParams["tag.triangle"] === true) {
		const layout = resolved.measuredText;
		const unit = node.params.canvasHeight / 1440;
		const halfWidth = 35 * unit;
		const height = 46 * unit;
		const blockBottom =
			(layout.lines.length - 0.5) * layout.lineHeightPx -
			layout.block.visualCenterOffset;
		const top = blockBottom + 2 * unit;
		const radius = 5 * unit;
		ctx.beginPath();
		ctx.moveTo(-halfWidth, top);
		ctx.lineTo(halfWidth, top);
		ctx.lineTo(0, top + height);
		ctx.closePath();
		ctx.lineJoin = "round";
		ctx.lineWidth = radius * 2;
		ctx.globalAlpha = 0.85;
		ctx.fillStyle = "#ffffff";
		ctx.strokeStyle = "#ffffff";
		ctx.fill();
		ctx.globalAlpha = 1;
	}

	ctx.restore();
}
