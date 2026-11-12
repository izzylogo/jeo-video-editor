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
	ctx.scale(resolved.transform.scaleX, resolved.transform.scaleY);
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

	ctx.restore();
}
