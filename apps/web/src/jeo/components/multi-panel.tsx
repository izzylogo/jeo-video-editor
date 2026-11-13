"use client";

/**
 * Settings for several selected clips at once. Only the settings they all
 * have are shown. A box shows the value when every clip agrees, or "Mixed"
 * when they differ; typing a value sets it on all of them in one step, so one
 * Ctrl+Z undoes it.
 */
import { useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import type { TimelineElement, TimelineTrack } from "@/timeline";
import { cn } from "@/utils/ui";
import { FONT_SIZE_DISPLAY, TEXT_SCALE_DISPLAY } from "../text-units";
import { STYLE_PRESETS, presetParams } from "./capcut-panels";

type Params = Record<string, string | number | boolean>;
interface Picked {
	element: TimelineElement;
	track: TimelineTrack;
}

function paramsOf(element: TimelineElement): Params {
	return ("params" in element ? element.params : {}) as Params;
}

function Field({
	label,
	values,
	suffix,
	digits = 0,
	onApply,
	jeoId,
}: {
	label: string;
	/** one shown value per selected clip */
	values: number[];
	suffix?: string;
	digits?: number;
	onApply: (shown: number) => void;
	jeoId: string;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const rounded = values.map((value) => Number(value.toFixed(digits)));
	const isSame = rounded.every((value) => value === rounded[0]);
	const shown = isSame ? `${rounded[0]}${suffix ?? ""}` : "";

	const commit = () => {
		if (draft === null) return;
		const parsed = Number.parseFloat(draft);
		setDraft(null);
		if (Number.isNaN(parsed)) return;
		onApply(parsed);
	};

	return (
		<div className="flex min-h-8 items-center gap-3">
			<span className="text-muted-foreground w-[5.6rem] shrink-0 text-xs whitespace-nowrap">
				{label}
			</span>
			<input
				aria-label={label}
				data-jeo-multi={jeoId}
				className="border-input bg-accent placeholder:text-muted-foreground h-8 min-w-0 flex-1 rounded-md border px-2 text-xs tabular-nums outline-none"
				placeholder={isSame ? undefined : "Mixed"}
				value={draft ?? shown}
				onFocus={(event) => {
					setDraft(isSame ? String(rounded[0]) : "");
					event.currentTarget.select();
				}}
				onChange={(event) => setDraft(event.currentTarget.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						commit();
						event.currentTarget.blur();
					}
					if (event.key === "Escape") {
						setDraft(null);
						event.currentTarget.blur();
					}
				}}
			/>
		</div>
	);
}

function Heading({ children }: { children: React.ReactNode }) {
	return <p className="pt-2 text-sm font-medium">{children}</p>;
}

function Toggle({
	label,
	states,
	onApply,
	jeoId,
}: {
	label: string;
	states: boolean[];
	onApply: (next: boolean) => void;
	jeoId: string;
}) {
	const allOn = states.every(Boolean);
	const someOn = states.some(Boolean);
	return (
		<button
			type="button"
			data-jeo-multi={jeoId}
			aria-pressed={allOn}
			onClick={() => onApply(!allOn)}
			className={cn(
				"cursor-pointer rounded-md px-2.5 py-1.5 text-xs transition-colors duration-150",
				allOn
					? "bg-primary text-primary-foreground"
					: "bg-accent hover:bg-accent/70",
			)}
		>
			{label}
			{!allOn && someOn ? " (some)" : ""}
		</button>
	);
}

export function MultiSelectPanel({ picked }: { picked: Picked[] }) {
	const editor = useEditor();
	const count = picked.length;
	const types = new Set(picked.map(({ element }) => element.type));
	const isVisual = picked.every(({ element }) =>
		["text", "video", "image", "sticker", "graphic"].includes(element.type),
	);
	const allText = types.size === 1 && types.has("text");
	const allSound = picked.every(
		({ element }) => element.type === "video" || element.type === "audio",
	);
	const scaleShown = allText ? TEXT_SCALE_DISPLAY : 100;

	/** one undo step for the whole selection */
	const applyAll = (build: (params: Params) => Params) => {
		editor.timeline.updateElements({
			updates: picked.map(({ element, track }) => {
				const params = paramsOf(element);
				return {
					trackId: track.id,
					elementId: element.id,
					patch: { params: { ...params, ...build(params) } },
				};
			}),
		});
		toast.success(`Changed on ${count} clips. Ctrl+Z undoes it.`);
	};
	const read = (key: string, fallback: number) =>
		picked.map(({ element }) => {
			const value = paramsOf(element)[key];
			return typeof value === "number" ? value : fallback;
		});

	const names = [...types]
		.map((type) => (type === "text" ? "texts" : type === "video" ? "video clips" : `${type}s`))
		.join(" and ");

	return (
		<div
			className="panel bg-background flex h-full flex-col overflow-hidden rounded-sm border"
			data-jeo="multi-panel"
		>
			<div className="flex h-10 shrink-0 items-center border-b px-4">
				<span className="text-primary text-sm font-medium">
					{count} selected
				</span>
				<span className="text-muted-foreground ml-2 truncate text-xs">
					{names} · a change here goes to all of them
				</span>
			</div>
			<div className="scrollbar-hidden min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pt-2 pb-4">
				{allText && (
					<>
						<Heading>Text</Heading>
						<Field
							label="Font size"
							jeoId="fontSize"
							digits={1}
							values={read("fontSize", 5.478).map((value) => value * FONT_SIZE_DISPLAY)}
							onApply={(shown) =>
								applyAll(() => ({ fontSize: Math.max(1, shown) / FONT_SIZE_DISPLAY }))
							}
						/>
						<div className="flex flex-wrap gap-1.5 pt-1">
							<Toggle
								label="Bold"
								jeoId="bold"
								states={picked.map(({ element }) => paramsOf(element).fontWeight === "bold")}
								onApply={(next) => applyAll(() => ({ fontWeight: next ? "bold" : "normal" }))}
							/>
							<Toggle
								label="Outline"
								jeoId="outline"
								states={picked.map(({ element }) => paramsOf(element)["stroke.enabled"] === true)}
								onApply={(next) => applyAll(() => ({ "stroke.enabled": next }))}
							/>
							<Toggle
								label="▼ Triangle"
								jeoId="triangle"
								states={picked.map(({ element }) => paramsOf(element)["tag.triangle"] === true)}
								onApply={(next) => applyAll(() => ({ "tag.triangle": next }))}
							/>
							<button
								type="button"
								data-jeo-multi="caps"
								onClick={() =>
									applyAll((params) => ({
										content: String(params.content ?? "").toUpperCase(),
									}))
								}
								className="bg-accent hover:bg-accent/70 cursor-pointer rounded-md px-2.5 py-1.5 text-xs transition-colors duration-150"
							>
								ALL CAPITALS
							</button>
						</div>
						<p className="text-muted-foreground pt-2 text-xs">Preset style</p>
						<div className="grid grid-cols-7 gap-1.5">
							{STYLE_PRESETS.map((preset) => (
								<button
									key={preset.id}
									type="button"
									title={preset.name}
									aria-label={preset.name}
									data-jeo-multi-style={preset.id}
									onClick={() => applyAll(() => presetParams(preset))}
									className="hover:ring-foreground/30 flex aspect-square cursor-pointer items-center justify-center rounded-md text-[0.8rem] font-bold transition-shadow duration-150 hover:ring-1"
									style={{
										background: preset.background ?? "var(--accent)",
										color: preset.fill,
										WebkitTextStroke: preset.stroke ? `2.5px ${preset.stroke}` : undefined,
										paintOrder: "stroke fill",
									}}
								>
									Aa
								</button>
							))}
						</div>
					</>
				)}

				{isVisual && (
					<>
						<Heading>Transform</Heading>
						<Field
							label="Scale"
							jeoId="scale"
							suffix="%"
							values={read("transform.scaleX", 1).map((value) => Math.abs(value) * scaleShown)}
							onApply={(shown) =>
								applyAll((params) => {
									const next = Math.max(1, shown) / scaleShown;
									const flip =
										typeof params["transform.scaleX"] === "number" &&
										params["transform.scaleX"] < 0
											? -1
											: 1;
									return {
										"transform.scaleX": next * flip,
										"transform.scaleY": next,
									};
								})
							}
						/>
						<Field
							label="Position X"
							jeoId="x"
							values={read("transform.positionX", 0)}
							onApply={(shown) => applyAll(() => ({ "transform.positionX": shown }))}
						/>
						<Field
							label="Position Y"
							jeoId="y"
							values={read("transform.positionY", 0)}
							onApply={(shown) => applyAll(() => ({ "transform.positionY": shown }))}
						/>
						<Field
							label="Rotate"
							jeoId="rotate"
							suffix="°"
							values={read("transform.rotate", 0)}
							onApply={(shown) =>
								applyAll(() => ({
									"transform.rotate": Math.max(-360, Math.min(360, shown)),
								}))
							}
						/>
						<Heading>Blend</Heading>
						<Field
							label="Opacity"
							jeoId="opacity"
							suffix="%"
							values={read("opacity", 1).map((value) => value * 100)}
							onApply={(shown) =>
								applyAll(() => ({ opacity: Math.max(0, Math.min(100, shown)) / 100 }))
							}
						/>
					</>
				)}

				{allSound && (
					<>
						<Heading>Sound</Heading>
						<Field
							label="Volume"
							jeoId="volume"
							suffix=" dB"
							digits={1}
							values={read("volume", 0)}
							onApply={(shown) =>
								applyAll(() => ({ volume: Math.max(-60, Math.min(20, shown)) }))
							}
						/>
						<div className="flex gap-1.5 pt-1">
							<Toggle
								label="Muted"
								jeoId="muted"
								states={picked.map(({ element }) => paramsOf(element).muted === true)}
								onApply={(next) => applyAll(() => ({ muted: next }))}
							/>
						</div>
					</>
				)}

				{!isVisual && !allSound && (
					<p className="text-muted-foreground pt-4 text-sm">
						These clips have no settings in common. Select clips of the same
						kind (all texts, or all video clips) to change them together.
					</p>
				)}
				<p className="text-muted-foreground border-t pt-3 text-xs">
					Tip: hold Ctrl and click clips to add them, or drag a box around them
					on the timeline.
				</p>
			</div>
		</div>
	);
}
