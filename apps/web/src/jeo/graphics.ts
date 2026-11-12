/**
 * JEO graphics: the curved ↗ arrow (points at an object) and the dark
 * spotlight used with it on a freeze frame.
 */
import type { GraphicDefinition } from "@/graphics/types";

export const JEO_ARROW = "jeo-arrow";
export const JEO_SPOTLIGHT = "jeo-spotlight";

export const jeoArrowGraphicDefinition: GraphicDefinition = {
	id: JEO_ARROW,
	name: "Arrow",
	keywords: ["arrow", "pointer", "point"],
	params: [
		{ key: "fill", label: "Colour", type: "color", default: "#ff2d2d" },
		{ key: "outline", label: "Outline", type: "color", default: "#ffffff" },
		{
			key: "thickness",
			label: "Thickness",
			type: "number",
			default: 44,
			min: 10,
			max: 90,
			step: 1,
		},
		{
			key: "curve",
			label: "Curve",
			type: "number",
			default: 45,
			min: -100,
			max: 100,
			step: 1,
		},
	],
	render({ ctx, params, width, height }) {
		const fill = String(params.fill ?? "#ff2d2d");
		const outline = String(params.outline ?? "#ffffff");
		const thickness = (Number(params.thickness ?? 44) / 512) * width;
		const curve = Number(params.curve ?? 45) / 100;

		// tail bottom-left, tip top-right (↗). Rotate the element to aim it.
		const tail = { x: width * 0.14, y: height * 0.84 };
		const tip = { x: width * 0.84, y: height * 0.16 };
		const mid = { x: (tail.x + tip.x) / 2, y: (tail.y + tip.y) / 2 };
		const control = {
			x: mid.x + width * 0.36 * curve,
			y: mid.y + height * 0.36 * curve,
		};
		// direction the curve arrives at the tip
		const angle = Math.atan2(tip.y - control.y, tip.x - control.x);
		const headLength = thickness * 2.4;
		const headHalfWidth = thickness * 1.55;
		const base = {
			x: tip.x - Math.cos(angle) * headLength,
			y: tip.y - Math.sin(angle) * headLength,
		};

		const drawShaft = () => {
			ctx.beginPath();
			ctx.moveTo(tail.x, tail.y);
			ctx.quadraticCurveTo(control.x, control.y, base.x, base.y);
		};
		const drawHead = () => {
			ctx.beginPath();
			ctx.moveTo(tip.x, tip.y);
			ctx.lineTo(
				base.x + Math.cos(angle + Math.PI / 2) * headHalfWidth,
				base.y + Math.sin(angle + Math.PI / 2) * headHalfWidth,
			);
			ctx.lineTo(
				base.x + Math.cos(angle - Math.PI / 2) * headHalfWidth,
				base.y + Math.sin(angle - Math.PI / 2) * headHalfWidth,
			);
			ctx.closePath();
		};

		ctx.clearRect(0, 0, width, height);
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		// outline first, then the coloured arrow on top
		const edge = thickness * 0.28;
		ctx.strokeStyle = outline;
		ctx.fillStyle = outline;
		ctx.lineWidth = thickness + edge * 2;
		drawShaft();
		ctx.stroke();
		ctx.lineWidth = edge * 2;
		drawHead();
		ctx.fill();
		ctx.stroke();

		ctx.strokeStyle = fill;
		ctx.fillStyle = fill;
		ctx.lineWidth = thickness;
		drawShaft();
		ctx.stroke();
		drawHead();
		ctx.fill();
	},
};

export const jeoSpotlightGraphicDefinition: GraphicDefinition = {
	id: JEO_SPOTLIGHT,
	name: "Spotlight",
	keywords: ["spotlight", "vignette", "dark", "highlight"],
	params: [
		{
			key: "darkness",
			label: "Darkness",
			type: "number",
			default: 65,
			min: 0,
			max: 100,
			step: 1,
		},
		{
			key: "holeX",
			label: "Light X",
			type: "number",
			default: 0,
			min: -50,
			max: 50,
			step: 1,
		},
		{
			key: "holeY",
			label: "Light Y",
			type: "number",
			default: 0,
			min: -50,
			max: 50,
			step: 1,
		},
		{
			key: "radius",
			label: "Light size",
			type: "number",
			default: 24,
			min: 4,
			max: 80,
			step: 1,
		},
		{
			key: "aspect",
			label: "Frame shape",
			type: "number",
			default: 1.3334,
			min: 0.3,
			max: 3,
			step: 0.01,
		},
	],
	render({ ctx, params, width, height }) {
		const darkness = Math.min(1, Math.max(0, Number(params.darkness ?? 65) / 100));
		const holeX = width / 2 + (Number(params.holeX ?? 0) / 100) * width;
		const holeY = height / 2 + (Number(params.holeY ?? 0) / 100) * height;
		const radius = (Number(params.radius ?? 24) / 100) * width;
		// the element is stretched to the frame (taller than wide), so squash
		// the hole the other way to keep it round on screen
		const aspect = Number(params.aspect ?? 1.3334) || 1;

		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = `rgba(0, 0, 0, ${darkness})`;
		ctx.fillRect(0, 0, width, height);

		ctx.save();
		ctx.globalCompositeOperation = "destination-out";
		ctx.translate(holeX, holeY);
		ctx.scale(1, 1 / aspect);
		const gradient = ctx.createRadialGradient(0, 0, radius * 0.55, 0, 0, radius);
		gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
		gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.arc(0, 0, radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	},
};

export const jeoGraphicDefinitions = [
	jeoArrowGraphicDefinition,
	jeoSpotlightGraphicDefinition,
];
