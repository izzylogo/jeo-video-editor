"use client";

/**
 * The "Basic" settings for a selected text or video, laid out the way CapCut
 * lays them out: a slider with a number box for size and scale, small button
 * rows for pattern / case / alignment, a grid of preset styles, then
 * Transform and Blend.
 */
import { useEffect, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ElementParamsTab } from "@/components/editor/panels/properties/components/element-params-tab";
import type { ImageElement, TextElement, VideoElement } from "@/timeline";
import {
	getTextMeasurementContext,
	measureTextElement,
} from "@/text/measure-element";
import { cn } from "@/utils/ui";
import { FONT_SIZE_DISPLAY, TEXT_SCALE_DISPLAY } from "../text-units";

type Params = Record<string, string | number | boolean>;
type Visual = TextElement | VideoElement | ImageElement;

function num(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function useParamWriter({
	element,
	trackId,
}: {
	element: Visual;
	trackId: string;
}) {
	const editor = useEditor();
	return {
		preview: (params: Params) =>
			editor.timeline.previewElements({
				updates: [{ trackId, elementId: element.id, updates: { params } }],
			}),
		commit: () => editor.timeline.commitPreview(),
		set: (params: Params) =>
			editor.timeline.updateElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						patch: { params: { ...element.params, ...params } },
					},
				],
			}),
	};
}

function Heading({ children }: { children: React.ReactNode }) {
	return <p className="pt-1 text-sm font-medium">{children}</p>;
}

function Row({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-8 items-center gap-3">
			<span className="text-muted-foreground w-[5.6rem] shrink-0 text-xs whitespace-nowrap">
				{label}
			</span>
			<div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
		</div>
	);
}

/** CapCut's slider + number box. Values are in what the user sees. */
function SliderNumber({
	value,
	min,
	max,
	step,
	suffix,
	label,
	onPreview,
	onCommit,
}: {
	value: number;
	min: number;
	max: number;
	step: number;
	suffix?: string;
	label: string;
	onPreview: (value: number) => void;
	onCommit: () => void;
}) {
	const [live, setLive] = useState<number | null>(null);
	const [draft, setDraft] = useState<string | null>(null);
	const shown = live ?? value;
	const digits = step < 1 ? 1 : 0;

	// the committed value arrived: stop showing the dragged one
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on new value
	useEffect(() => setLive(null), [value]);

	const typed = () => {
		if (draft === null) return;
		const parsed = Number.parseFloat(draft);
		setDraft(null);
		if (Number.isNaN(parsed)) return;
		onPreview(Math.max(min, parsed));
		onCommit();
	};

	return (
		<>
			<Slider
				aria-label={label}
				className="min-w-0 flex-1"
				min={min}
				max={max}
				step={step}
				value={[Math.min(max, Math.max(min, shown))]}
				onValueChange={([next]) => {
					setLive(next);
					onPreview(next);
				}}
				onValueCommit={() => onCommit()}
			/>
			<input
				aria-label={`${label} number`}
				className="border-input bg-accent h-7 w-[3.9rem] shrink-0 rounded-md border px-1.5 text-right text-xs tabular-nums outline-none"
				value={draft ?? `${shown.toFixed(digits).replace(/\.0$/, "")}${suffix ?? ""}`}
				onFocus={(event) => {
					setDraft(shown.toFixed(digits).replace(/\.0$/, ""));
					event.currentTarget.select();
				}}
				onChange={(event) => setDraft(event.currentTarget.value)}
				onBlur={typed}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
				}}
			/>
		</>
	);
}

function Pill({
	isOn,
	onClick,
	title,
	children,
	className,
}: {
	isOn?: boolean;
	onClick: () => void;
	title: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			aria-pressed={isOn}
			onClick={onClick}
			className={cn(
				"flex h-7 min-w-8 cursor-pointer items-center justify-center rounded-md px-2 text-xs transition-colors duration-150",
				isOn
					? "bg-primary text-primary-foreground"
					: "bg-accent hover:bg-accent/70",
				className,
			)}
		>
			{children}
		</button>
	);
}

// ---------- preset styles ----------

interface StylePreset {
	id: string;
	name: string;
	fill: string;
	stroke?: string;
	background?: string;
}

const STYLE_PRESETS: StylePreset[] = [
	{ id: "none", name: "Plain white, no outline", fill: "#ffffff" },
	{ id: "jeo", name: "JEO: white with a dark outline", fill: "#ffffff", stroke: "#000000" },
	{ id: "black-white", name: "Black with a white outline", fill: "#000000", stroke: "#ffffff" },
	{ id: "yellow", name: "Yellow with a dark outline", fill: "#ffe600", stroke: "#000000" },
	{ id: "red", name: "Red with a dark outline", fill: "#ff2d2d", stroke: "#000000" },
	{ id: "orange", name: "Orange with a dark outline", fill: "#ff8a00", stroke: "#000000" },
	{ id: "blue", name: "Blue with a dark outline", fill: "#2f9bff", stroke: "#000000" },
	{ id: "green", name: "Green with a dark outline", fill: "#22e03a", stroke: "#000000" },
	{ id: "on-grey", name: "Black on a grey box", fill: "#000000", background: "#a8a8a8" },
	{ id: "on-yellow", name: "Black on a yellow box", fill: "#000000", background: "#ffd400" },
	{ id: "on-violet", name: "White on a violet box", fill: "#ffffff", background: "#7a1cff" },
	{ id: "on-white", name: "Black on a white box", fill: "#000000", background: "#ffffff" },
	{ id: "on-black", name: "White on a black box", fill: "#ffffff", background: "#000000" },
	{ id: "green-on-black", name: "Green on a black box", fill: "#22e03a", background: "#000000" },
];

function presetParams(preset: StylePreset): Params {
	return {
		color: preset.fill,
		"stroke.enabled": Boolean(preset.stroke),
		...(preset.stroke ? { "stroke.color": preset.stroke } : {}),
		"background.enabled": Boolean(preset.background),
		...(preset.background
			? { "background.color": preset.background, "background.cornerRadius": 18 }
			: {}),
	};
}

function isPresetOn({ preset, params }: { preset: StylePreset; params: Params }) {
	const same = (a: unknown, b: string) => String(a).toLowerCase() === b;
	return (
		same(params.color, preset.fill) &&
		(params["stroke.enabled"] === true) === Boolean(preset.stroke) &&
		(!preset.stroke || same(params["stroke.color"], preset.stroke)) &&
		(params["background.enabled"] === true) === Boolean(preset.background) &&
		(!preset.background || same(params["background.color"], preset.background))
	);
}

function PresetStyles({
	element,
	onPick,
}: {
	element: TextElement;
	onPick: (params: Params) => void;
}) {
	return (
		<div className="grid grid-cols-7 gap-1.5">
			{STYLE_PRESETS.map((preset) => (
				<button
					key={preset.id}
					type="button"
					title={preset.name}
					aria-label={preset.name}
					data-jeo-style={preset.id}
					onClick={() => onPick(presetParams(preset))}
					className={cn(
						"flex aspect-square cursor-pointer items-center justify-center rounded-md text-[0.8rem] font-bold transition-shadow duration-150",
						isPresetOn({ preset, params: element.params as Params })
							? "ring-primary ring-2"
							: "hover:ring-foreground/30 hover:ring-1",
					)}
					style={{
						background: preset.background ?? "var(--accent)",
						color: preset.fill,
						WebkitTextStroke: preset.stroke
							? `2.5px ${preset.stroke}`
							: undefined,
						paintOrder: "stroke fill",
					}}
				>
					Aa
				</button>
			))}
		</div>
	);
}

// ---------- transform (shared by text and video) ----------

const ALIGNS = [
	{ id: "left", title: "Align to the left edge", glyph: "⇤" },
	{ id: "centre-x", title: "Centre left-to-right", glyph: "↔" },
	{ id: "right", title: "Align to the right edge", glyph: "⇥" },
	{ id: "top", title: "Align to the top edge", glyph: "⤒" },
	{ id: "centre-y", title: "Centre top-to-bottom", glyph: "↕" },
	{ id: "bottom", title: "Align to the bottom edge", glyph: "⤓" },
] as const;

function TransformBlock({
	element,
	trackId,
	scaleDisplay,
}: {
	element: Visual;
	trackId: string;
	/** what scale 1 is shown as: 100 for video, 120 for text */
	scaleDisplay: number;
}) {
	const editor = useEditor();
	const write = useParamWriter({ element, trackId });
	// a mirrored clip has a negative width scale: show the size, keep the flip
	const signedScaleX = num(element.params["transform.scaleX"], 1);
	const flip = signedScaleX < 0 ? -1 : 1;
	const scaleX = Math.abs(signedScaleX);
	const scaleY = num(element.params["transform.scaleY"], 1);
	const [isUniform, setIsUniform] = useState(Math.abs(scaleX - scaleY) < 0.0005);
	const hasScaleKeys = Object.keys(element.animations ?? {}).some((path) =>
		path.startsWith("transform.scale"),
	);

	const scaleParams = (shown: number): Params => {
		const next = shown / scaleDisplay;
		return isUniform
			? { "transform.scaleX": next * flip, "transform.scaleY": next }
			: { "transform.scaleX": next * flip };
	};

	const align = (id: (typeof ALIGNS)[number]["id"]) => {
		const canvas = editor.project.getActive()?.settings.canvasSize;
		if (!canvas) return;
		let width = canvas.width;
		let height = canvas.height;
		if (element.type === "text") {
			const rect = measureTextElement({
				element,
				canvasHeight: canvas.height,
				localTime: 0,
				ctx: getTextMeasurementContext(),
			}).visualRect;
			width = rect.width;
			height = rect.height;
		} else {
			const asset = editor.media
				.getAssets()
				.find((item) => item.id === element.mediaId);
			if (asset?.width && asset?.height) {
				const fit = Math.min(
					canvas.width / asset.width,
					canvas.height / asset.height,
				);
				width = asset.width * fit;
				height = asset.height * fit;
			}
		}
		const halfW = (width * scaleX) / 2;
		const halfH = (height * scaleY) / 2;
		const spot: Params = {
			left: { "transform.positionX": -canvas.width / 2 + halfW },
			"centre-x": { "transform.positionX": 0 },
			right: { "transform.positionX": canvas.width / 2 - halfW },
			top: { "transform.positionY": -canvas.height / 2 + halfH },
			"centre-y": { "transform.positionY": 0 },
			bottom: { "transform.positionY": canvas.height / 2 - halfH },
		}[id];
		write.set(
			Object.fromEntries(
				Object.entries(spot).map(([key, value]) => [key, Math.round(Number(value))]),
			),
		);
	};

	return (
		<div className="space-y-2 border-t px-4 pt-3" data-jeo="transform-block">
			<Heading>Transform</Heading>
			<Row label="Scale">
				<SliderNumber
					label="Scale"
					value={scaleX * scaleDisplay}
					min={1}
					max={400}
					step={1}
					suffix="%"
					onPreview={(shown) => write.preview(scaleParams(shown))}
					onCommit={write.commit}
				/>
			</Row>
			{hasScaleKeys && (
				<p className="text-muted-foreground text-xs">
					This has a pop-up or growing animation, which sets its own scale while
					it plays.
				</p>
			)}
			<Row label="Uniform scale">
				<div className="flex flex-1 justify-end">
					<Switch
						aria-label="Uniform scale"
						checked={isUniform}
						onCheckedChange={(checked) => {
							setIsUniform(checked);
							if (checked) write.set({ "transform.scaleY": scaleX });
						}}
					/>
				</div>
			</Row>
			{!isUniform && (
				<Row label="Height">
					<SliderNumber
						label="Height scale"
						value={scaleY * scaleDisplay}
						min={1}
						max={400}
						step={1}
						suffix="%"
						onPreview={(shown) =>
							write.preview({ "transform.scaleY": shown / scaleDisplay })
						}
						onCommit={write.commit}
					/>
				</Row>
			)}
			<div className="-mx-4 [&>div]:border-b-0">
				<ElementParamsTab
					element={element}
					trackId={trackId}
					paramKeys={[
						"transform.positionX",
						"transform.positionY",
						"transform.rotate",
					]}
					sectionKey="jeo-position"
				/>
			</div>
			<div className="bg-accent/60 flex w-fit gap-0.5 rounded-md p-0.5">
				{ALIGNS.map((item) => (
					<button
						key={item.id}
						type="button"
						title={item.title}
						aria-label={item.title}
						data-jeo-align={item.id}
						onClick={() => align(item.id)}
						className="hover:bg-background flex size-7 cursor-pointer items-center justify-center rounded text-sm transition-colors duration-150"
					>
						{item.glyph}
					</button>
				))}
			</div>
			<div className="pt-2">
				<Heading>Blend</Heading>
			</div>
			<div className="-mx-4 [&>div]:border-b-0">
				<ElementParamsTab
					element={element}
					trackId={trackId}
					paramKeys={["opacity", "blendMode"]}
					sectionKey="jeo-blend"
				/>
			</div>
		</div>
	);
}

// ---------- text ----------

function titleCase(text: string): string {
	return text.toLowerCase().replace(/(^|[\s"*(])([a-zà-ÿ])/g, (_, lead, letter) => {
		return `${lead}${String(letter).toUpperCase()}`;
	});
}

export function TextBasicTab({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const write = useParamWriter({ element, trackId });
	const params = element.params as Params;
	const content = typeof params.content === "string" ? params.content : "";
	const fontSize = num(params.fontSize, 5.478);
	const align = String(params.textAlign ?? "center");

	return (
		<div data-jeo="text-basic">
			<div className="[&>div]:border-b-0">
				<ElementParamsTab
					element={element}
					trackId={trackId}
					paramKeys={["content", "fontFamily"]}
					sectionKey="jeo-text-words"
				/>
			</div>
			<div className="space-y-2 px-4 pb-4">
				<Row label="Font size">
					<SliderNumber
						label="Font size"
						value={fontSize * FONT_SIZE_DISPLAY}
						min={3}
						max={40}
						step={0.5}
						onPreview={(shown) =>
							write.preview({ fontSize: shown / FONT_SIZE_DISPLAY })
						}
						onCommit={write.commit}
					/>
				</Row>
				<Row label="Pattern">
					<Pill
						title="Bold"
						isOn={params.fontWeight === "bold"}
						onClick={() =>
							write.set({
								fontWeight: params.fontWeight === "bold" ? "normal" : "bold",
							})
						}
						className="font-bold"
					>
						B
					</Pill>
					<Pill
						title="Underline"
						isOn={params.textDecoration === "underline"}
						onClick={() =>
							write.set({
								textDecoration:
									params.textDecoration === "underline" ? "none" : "underline",
							})
						}
						className="underline"
					>
						U
					</Pill>
					<Pill
						title="Italic"
						isOn={params.fontStyle === "italic"}
						onClick={() =>
							write.set({
								fontStyle: params.fontStyle === "italic" ? "normal" : "italic",
							})
						}
						className="italic"
					>
						I
					</Pill>
				</Row>
				<Row label="Case">
					<Pill
						title="ALL CAPITALS (your style)"
						isOn={content !== "" && content === content.toUpperCase()}
						onClick={() => write.set({ content: content.toUpperCase() })}
					>
						TT
					</Pill>
					<Pill
						title="all small letters"
						onClick={() => write.set({ content: content.toLowerCase() })}
					>
						tt
					</Pill>
					<Pill
						title="First Letter Capital"
						onClick={() => write.set({ content: titleCase(content) })}
					>
						Tt
					</Pill>
				</Row>
				<Row label="Alignment">
					{(
						[
							["left", "Left", "⇤"],
							["center", "Centre", "↔"],
							["right", "Right", "⇥"],
						] as const
					).map(([value, name, glyph]) => (
						<Pill
							key={value}
							title={`Lines line up: ${name}`}
							isOn={align === value}
							onClick={() => write.set({ textAlign: value })}
						>
							{glyph}
						</Pill>
					))}
				</Row>
				<div className="pt-2">
					<p className="text-muted-foreground mb-2 text-xs">Preset style</p>
					<PresetStyles element={element} onPick={write.set} />
				</div>
			</div>
			<div className="border-t [&>div]:border-b-0">
				<ElementParamsTab
					element={element}
					trackId={trackId}
					paramKeys={[
						"color",
						"letterSpacing",
						"lineHeight",
						"stroke.enabled",
						"stroke.color",
						"stroke.width",
						"tag.triangle",
						"background.enabled",
						"background.color",
						"background.cornerRadius",
						"background.paddingX",
						"background.paddingY",
					]}
					sectionKey="jeo-text-look"
				/>
			</div>
			<TransformBlock
				element={element}
				trackId={trackId}
				scaleDisplay={TEXT_SCALE_DISPLAY}
			/>
		</div>
	);
}

// ---------- video / picture ----------

export function VideoBasicTab({
	element,
	trackId,
}: {
	element: VideoElement | ImageElement;
	trackId: string;
}) {
	return (
		<div data-jeo="video-basic" className="[&>div:first-child]:border-t-0">
			<TransformBlock element={element} trackId={trackId} scaleDisplay={100} />
		</div>
	);
}
