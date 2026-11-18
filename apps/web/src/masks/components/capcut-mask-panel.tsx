"use client";

/**
 * JEO: the Mask panel laid out like CapCut's.
 *
 *  [x] Mask
 *  [Mask1 Rectangle] [Mask2 Circle] [+]
 *  shape tiles: Split, Filmstrip, Circle, Rectangle, Stars, Heart, Text, Brush, Pen
 *  Mask settings: Position X / Y, Rotation, Size W / H, Feather, Round corners
 *
 * Position and size are shown in pixels of the clip, as CapCut shows them;
 * feather and round corners 0..100. Underneath they are CapCut's own numbers,
 * so "Open in CapCut" carries them across unchanged.
 */
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	CircleIcon,
	FavouriteIcon,
	PaintBrush02Icon,
	PenTool01Icon,
	PlusSignIcon,
	RefreshIcon,
	SquareIcon,
	StarsIcon,
	TextFontIcon,
	Cancel01Icon,
	ViewIcon,
	ViewOffSlashIcon,
	ArrowDataTransferHorizontalIcon,
	ArrowDataTransferVerticalIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { IconSvgElement } from "@hugeicons/react";
import type { MaskableElement } from "@/timeline";
import type { CapCutMask, CapCutMaskParams, CapCutMaskShape, Mask } from "@/masks/types";
import { buildDefaultMaskInstance } from "@/masks";
import {
	CAPCUT_MASK_SLOTS,
	type CapCutSlot,
	readSlot,
	slotPatch,
	usedSlots,
} from "@/masks/builtin/definitions/capcut";
import { useEditor } from "@/editor/use-editor";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/utils/ui";

type Tile = {
	id: string;
	label: string;
	icon: IconSvgElement;
	shape?: CapCutMaskShape;
	pro?: boolean;
};

const TILES: Tile[] = [
	{ id: "split", label: "Split", icon: SquareIcon },
	{ id: "filmstrip", label: "Filmstrip", icon: SquareIcon },
	{ id: "circle", label: "Circle", icon: CircleIcon, shape: "circle" },
	{ id: "rectangle", label: "Rectangle", icon: SquareIcon, shape: "rectangle" },
	{ id: "stars", label: "Stars", icon: StarsIcon },
	{ id: "heart", label: "Heart", icon: FavouriteIcon },
	{ id: "text", label: "Text", icon: TextFontIcon },
	{ id: "brush", label: "Brush", icon: PaintBrush02Icon, pro: true },
	{ id: "pen", label: "Pen", icon: PenTool01Icon, pro: true },
];

function TileArt({ id }: { id: string }) {
	// small drawings like CapCut's tiles
	const common = "stroke-current fill-none";
	switch (id) {
		case "split":
			return (
				<svg viewBox="0 0 32 32" className="size-8" aria-hidden>
					<rect x="4" y="4" width="24" height="24" rx="2" className={common} strokeWidth="1.6" />
					<line x1="4" y1="16" x2="28" y2="16" className={common} strokeWidth="1.6" />
				</svg>
			);
		case "filmstrip":
			return (
				<svg viewBox="0 0 32 32" className="size-8" aria-hidden>
					<rect x="4" y="4" width="24" height="24" rx="2" className={common} strokeWidth="1.6" />
					<line x1="4" y1="11" x2="28" y2="11" className={common} strokeWidth="1.6" />
					<line x1="4" y1="21" x2="28" y2="21" className={common} strokeWidth="1.6" />
				</svg>
			);
		case "circle":
			return (
				<svg viewBox="0 0 32 32" className="size-8" aria-hidden>
					<rect x="4" y="4" width="24" height="24" rx="2" className={common} strokeWidth="1.6" />
					<circle cx="16" cy="16" r="7.5" className={common} strokeWidth="1.6" />
				</svg>
			);
		case "rectangle":
			return (
				<svg viewBox="0 0 32 32" className="size-8" aria-hidden>
					<rect x="4" y="4" width="24" height="24" rx="2" className={common} strokeWidth="1.6" />
					<rect x="9" y="9" width="14" height="14" className={common} strokeWidth="1.6" />
				</svg>
			);
		default:
			return null;
	}
}

/** A number box with up / down arrows, like CapCut's. */
function Stepper({
	value,
	onChange,
	step = 1,
	digits = 0,
	suffix = "",
	icon,
	label,
}: {
	value: number;
	onChange: (value: number) => void;
	step?: number;
	digits?: number;
	suffix?: string;
	icon?: React.ReactNode;
	label: string;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const shown = draft ?? `${value.toFixed(digits)}${suffix}`;
	const commit = (text: string) => {
		const parsed = Number.parseFloat(text.replace(suffix, ""));
		setDraft(null);
		if (Number.isFinite(parsed)) onChange(parsed);
	};
	return (
		<div className="bg-accent flex h-8 min-w-0 items-center rounded-md pl-2" data-jeo-stepper={label}>
			{icon}
			<input
				aria-label={label}
				value={shown}
				onChange={(event) => setDraft(event.target.value)}
				onFocus={(event) => {
					setDraft(value.toFixed(digits));
					event.target.select();
				}}
				onBlur={(event) => commit(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") (event.target as HTMLInputElement).blur();
					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault();
						onChange(value + (event.key === "ArrowUp" ? step : -step));
					}
				}}
				className="w-full min-w-0 bg-transparent px-1.5 text-center text-xs tabular-nums outline-none"
			/>
			<div className="border-background flex h-full flex-col border-l">
				<button
					type="button"
					aria-label={`${label} up`}
					onClick={() => onChange(value + step)}
					className="hover:bg-background/60 flex h-1/2 w-5 cursor-pointer items-center justify-center text-[8px] leading-none"
				>
					&#9650;
				</button>
				<button
					type="button"
					aria-label={`${label} down`}
					onClick={() => onChange(value - step)}
					className="hover:bg-background/60 flex h-1/2 w-5 cursor-pointer items-center justify-center text-[8px] leading-none"
				>
					&#9660;
				</button>
			</div>
		</div>
	);
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
			<span className="text-muted-foreground text-xs">{label}</span>
			<div className="flex min-w-0 items-center gap-2">{children}</div>
		</div>
	);
}

export function CapCutMaskPanel({
	element,
	trackId,
	legacyMask,
}: {
	element: MaskableElement;
	trackId: string;
	/** an older JEO mask on this clip (shown with a switch button) */
	legacyMask?: Mask;
}) {
	const editor = useEditor();
	const assets = useEditor((e) => e.media.getAssets());
	const asset = "mediaId" in element ? assets.find((item) => item.id === element.mediaId) : undefined;
	const mediaW = asset?.width || 1080;
	const mediaH = asset?.height || 1920;
	const mask = element.masks?.[0]?.type === "capcut" ? (element.masks[0] as CapCutMask) : undefined;
	const [isOpen, setIsOpen] = useState(true);
	const [settingsOpen, setSettingsOpen] = useState(true);
	// while a slider is dragged it shows this value (the saved one only
	// changes when the mouse is let go), so the knob follows the mouse
	const [drag, setDrag] = useState<{ key: "f" | "c"; value: number } | null>(null);

	const save = (masks: Mask[]) => {
		editor.timeline.discardPreview();
		editor.timeline.updateElements({ updates: [{ trackId, elementId: element.id, patch: { masks } }] });
	};
	const preview = (params: CapCutMaskParams) => {
		if (!mask) return;
		editor.timeline.previewElements({
			updates: [{ trackId, elementId: element.id, updates: { masks: [{ ...mask, params }] } }],
		});
	};
	const change = (patch: Partial<CapCutMaskParams>, live = false) => {
		if (!mask) return;
		const params = { ...mask.params, ...patch };
		if (live) preview(params);
		else save([{ ...mask, params }]);
	};

	const turnOn = () => {
		const fresh = buildDefaultMaskInstance({
			maskType: "capcut",
			elementSize: { width: mediaW, height: mediaH },
		}) as CapCutMask;
		save([fresh]);
	};
	const turnOff = () => save([]);

	if (legacyMask && !mask) {
		return (
			<div className="space-y-2 border-b px-3 py-3 text-xs" data-jeo="capcut-mask-legacy">
				<p className="text-muted-foreground">
					This clip has an older JEO mask ({legacyMask.type}). CapCut-style masks can hold several shapes and look exactly like CapCut.
				</p>
				<button
					type="button"
					onClick={turnOn}
					className="bg-primary text-primary-foreground cursor-pointer rounded-md px-3 py-1.5 font-medium"
				>
					Switch to a CapCut mask
				</button>
			</div>
		);
	}

	const used = mask ? usedSlots(mask.params) : [];
	const active = (mask ? Math.min(4, Math.max(1, Math.round(mask.params.active || 1))) : 1) as CapCutSlot;
	const current = mask ? readSlot(mask.params, active) : undefined;

	const anyShown = used.some((slot) => mask && !readSlot(mask.params, slot).hidden);
	const toggleAll = () => {
		if (!mask) return turnOn();
		const patch: Partial<CapCutMaskParams> = {};
		for (const slot of used) Object.assign(patch, slotPatch(slot, { hidden: anyShown }));
		change(patch);
	};

	const addMask = () => {
		if (!mask) return turnOn();
		const free = CAPCUT_MASK_SLOTS.find((slot) => readSlot(mask.params, slot).shape === "none");
		if (!free) {
			toast.message("Four masks is the most on one clip.");
			return;
		}
		change({
			active: free,
			...slotPatch(free, { shape: "circle", x: 0, y: 0, w: 0.4, h: (0.4 * mediaW) / mediaH, r: 0, f: 0, c: 0, invert: false }),
		});
	};
	const removeMask = (slot: CapCutSlot) => {
		if (!mask) return;
		const left = used.filter((item) => item !== slot);
		if (left.length === 0) return turnOff();
		change({ active: left[0], ...slotPatch(slot, { shape: "none" }) });
	};
	const pickShape = (tile: Tile) => {
		if (!tile.shape) {
			toast.message(`${tile.label} masks are not in JEO yet. Circle and Rectangle work, and go to CapCut as they are.`);
			return;
		}
		if (!mask) {
			turnOn();
			return;
		}
		change(slotPatch(active, { shape: tile.shape }));
	};

	return (
		<div className="border-b px-3 py-3" data-jeo="capcut-mask-panel">
			<div className="flex items-center gap-2">
				<button
					type="button"
					role="checkbox"
					aria-checked={anyShown}
					aria-label="Masks on or off (keeps their settings)"
					title={anyShown ? "Hide all masks (settings are kept)" : "Show the masks"}
					onClick={toggleAll}
					className={cn(
						"flex size-4 cursor-pointer items-center justify-center rounded-[3px] border text-[10px] leading-none",
						anyShown ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/50",
					)}
				>
					{anyShown ? "✓" : ""}
				</button>
				<button type="button" onClick={() => setIsOpen((open) => !open)} className="flex cursor-pointer items-center gap-1 text-sm font-medium">
					Mask
					<span aria-hidden className={cn("text-[8px] transition-transform", isOpen ? "" : "rotate-180")}>&#9650;</span>
				</button>
			</div>

			{isOpen && (
				<div className="mt-3 space-y-4">
					{/* Mask1 Rectangle · Mask2 Circle · + */}
					<div className="flex flex-wrap items-center gap-1.5" data-jeo="capcut-mask-tabs">
						{used.map((slot, index) => {
							const s = mask ? readSlot(mask.params, slot) : undefined;
							const name = s?.shape === "rectangle" ? "Rectangle" : "Circle";
							return (
								<span key={slot} className="group relative">
									<button
										type="button"
										onClick={() => change({ active: slot })}
										className={cn(
											"cursor-pointer rounded-full px-3 py-1 text-xs transition-colors",
											slot === active ? "bg-accent text-foreground font-medium" : "bg-accent/40 text-muted-foreground hover:text-foreground",
										)}
									>
										<span className={cn(s?.hidden && "line-through opacity-60")}>
											Mask{index + 1} {name}
										</span>
									</button>
									<button
										type="button"
										aria-label={s?.hidden ? `Show mask ${index + 1}` : `Hide mask ${index + 1}`}
										aria-pressed={!s?.hidden}
										title={s?.hidden ? "Show this mask" : "Hide this mask to see the difference"}
										data-jeo="capcut-mask-eye"
										onClick={() => change(slotPatch(slot, { hidden: !s?.hidden }))}
										className={cn(
											"ml-0.5 inline-flex size-6 cursor-pointer items-center justify-center rounded-full align-middle transition-colors",
											s?.hidden ? "text-muted-foreground/60 hover:text-foreground" : "text-foreground/80 hover:bg-accent",
										)}
									>
										<HugeiconsIcon icon={s?.hidden ? ViewOffSlashIcon : ViewIcon} className="size-3.5" />
									</button>
									<button
										type="button"
										aria-label={`Remove mask ${index + 1}`}
										onClick={() => removeMask(slot)}
										className="bg-background absolute -top-1 -right-1 hidden size-4 cursor-pointer items-center justify-center rounded-full border group-hover:flex"
									>
										<HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
									</button>
								</span>
							);
						})}
						<button
							type="button"
							aria-label="Add a mask"
							title="Add another mask on this clip"
							onClick={addMask}
							className="bg-accent/60 hover:bg-accent flex size-6 cursor-pointer items-center justify-center rounded-full"
						>
							<HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
						</button>
					</div>

					{/* shape tiles */}
					<div className="grid grid-cols-[repeat(auto-fill,minmax(3.6rem,1fr))] gap-2" data-jeo="capcut-mask-shapes">
						{TILES.map((tile) => {
							const chosen = Boolean(mask && current && tile.shape === current.shape);
							return (
								<button
									key={tile.id}
									type="button"
									onClick={() => pickShape(tile)}
									title={tile.shape ? tile.label : `${tile.label} (not in JEO yet)`}
									className="group flex cursor-pointer flex-col items-center gap-1"
								>
									<span
										className={cn(
											"bg-accent relative flex aspect-square w-full items-center justify-center rounded-md border-2 transition-colors",
											chosen ? "border-primary" : "border-transparent group-hover:border-foreground/20",
											!tile.shape && "opacity-45",
										)}
									>
										{TileArt({ id: tile.id }) ?? <HugeiconsIcon icon={tile.icon} className="size-6" />}
										{tile.pro && <span className="bg-primary absolute top-0.5 left-0.5 size-2 rounded-full" />}
									</span>
									<span className={cn("text-[0.68rem]", tile.shape ? "text-muted-foreground" : "text-muted-foreground/50")}>{tile.label}</span>
								</button>
							);
						})}
					</div>

					{mask && current && (
						<div className="space-y-3" data-jeo="capcut-mask-settings">
							<div className="flex items-center justify-between">
								<button type="button" onClick={() => setSettingsOpen((open) => !open)} className="flex cursor-pointer items-center gap-1 text-sm font-medium">
									Mask settings
									<span aria-hidden className={cn("text-[8px] transition-transform", settingsOpen ? "" : "rotate-180")}>&#9650;</span>
								</button>
								<div className="flex items-center gap-1">
									<button
										type="button"
										title="Invert this mask (show the outside instead)"
										aria-pressed={current.invert}
										onClick={() => change(slotPatch(active, { invert: !current.invert }))}
										className={cn("flex size-6 cursor-pointer items-center justify-center rounded", current.invert ? "bg-primary/25 text-primary" : "hover:bg-accent")}
									>
										<svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
											<rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
											<path d="M2 14 L14 2 L14 14 Z" fill="currentColor" />
										</svg>
									</button>
									<button
										type="button"
										title="Reset this mask"
										onClick={() =>
											change(
												slotPatch(active, {
													x: 0,
													y: 0,
													w: 0.5,
													h: (0.5 * mediaW) / mediaH,
													r: 0,
													f: 0,
													c: 0,
													invert: false,
												}),
											)
										}
										className="hover:bg-accent flex size-6 cursor-pointer items-center justify-center rounded"
									>
										<HugeiconsIcon icon={RefreshIcon} className="size-3.5" />
									</button>
								</div>
							</div>
							{settingsOpen && (
								<div className="space-y-3">
									<SettingRow label="Position">
										<Stepper
											label="X"
											icon={<span className="text-muted-foreground text-[0.68rem]">X</span>}
											value={Math.trunc((current.x * mediaW) / 2)}
											onChange={(px) => change(slotPatch(active, { x: (2 * px) / mediaW }))}
										/>
										<Stepper
											label="Y"
											icon={<span className="text-muted-foreground text-[0.68rem]">Y</span>}
											value={Math.trunc((current.y * mediaH) / 2)}
											onChange={(px) => change(slotPatch(active, { y: (2 * px) / mediaH }))}
										/>
									</SettingRow>
									<SettingRow label="Rotation">
										<Stepper
											label="Rotation"
											value={current.r}
											digits={1}
											step={1}
											suffix="°"
											onChange={(deg) => change(slotPatch(active, { r: Math.max(-360, Math.min(360, deg)) }))}
										/>
										<span
											aria-hidden
											className="border-muted-foreground/60 relative size-5 shrink-0 rounded-full border"
											style={{ transform: `rotate(${current.r}deg)` }}
										>
											<span className="bg-foreground absolute top-1/2 left-1/2 h-px w-2 -translate-y-1/2" />
										</span>
									</SettingRow>
									<SettingRow label="Size">
										<Stepper
											label="Width"
											icon={<HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} className="text-muted-foreground size-3" />}
											value={Math.round(current.w * mediaW)}
											onChange={(px) => change(slotPatch(active, { w: Math.max(4, px) / mediaW }))}
										/>
										<Stepper
											label="Height"
											icon={<HugeiconsIcon icon={ArrowDataTransferVerticalIcon} className="text-muted-foreground size-3" />}
											value={Math.round(current.h * mediaH)}
											onChange={(px) => change(slotPatch(active, { h: Math.max(4, px) / mediaH }))}
										/>
									</SettingRow>
									<div className="space-y-1.5">
										<span className="text-muted-foreground text-xs">Feather</span>
										<div className="flex items-center gap-3">
											<Slider
												aria-label="Feather"
												min={0}
												max={100}
												step={1}
												value={[drag?.key === "f" ? drag.value : Math.round(current.f * 100)]}
												onValueChange={([v]) => {
													setDrag({ key: "f", value: v });
													change(slotPatch(active, { f: v / 100 }), true);
												}}
												onValueCommit={([v]) => {
													setDrag(null);
													change(slotPatch(active, { f: v / 100 }));
												}}
											/>
											<div className="w-20 shrink-0">
												<Stepper label="Feather" value={drag?.key === "f" ? drag.value : Math.round(current.f * 100)} onChange={(v) => change(slotPatch(active, { f: Math.max(0, Math.min(100, v)) / 100 }))} />
											</div>
										</div>
									</div>
									{current.shape === "rectangle" && (
										<div className="space-y-1.5">
											<span className="text-muted-foreground text-xs">Round corners</span>
											<div className="flex items-center gap-3">
												<Slider
													aria-label="Round corners"
													min={0}
													max={100}
													step={1}
													value={[drag?.key === "c" ? drag.value : Math.round(current.c * 100)]}
													onValueChange={([v]) => {
														setDrag({ key: "c", value: v });
														change(slotPatch(active, { c: v / 100 }), true);
													}}
													onValueCommit={([v]) => {
														setDrag(null);
														change(slotPatch(active, { c: v / 100 }));
													}}
												/>
												<div className="w-20 shrink-0">
													<Stepper label="Round corners" value={drag?.key === "c" ? drag.value : Math.round(current.c * 100)} onChange={(v) => change(slotPatch(active, { c: Math.max(0, Math.min(100, v)) / 100 }))} />
												</div>
											</div>
										</div>
									)}
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
