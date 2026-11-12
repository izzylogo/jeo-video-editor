"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "@/utils/ui";

const STORAGE_KEY = "jeo-accent";
export const DEFAULT_ACCENT = "#8b5cf6";

const PRESETS: Array<{ name: string; color: string }> = [
	{ name: "Violet", color: "#8b5cf6" },
	{ name: "Pink", color: "#ec4899" },
	{ name: "Red", color: "#ef4444" },
	{ name: "Orange", color: "#f97316" },
	{ name: "Yellow", color: "#facc15" },
	{ name: "Lime", color: "#84cc16" },
	{ name: "Teal", color: "#14b8a6" },
	{ name: "Blue", color: "#3b82f6" },
];

function hexToHsl({ hex }: { hex: string }): { h: number; s: number; l: number } {
	const value = hex.replace("#", "");
	const r = Number.parseInt(value.slice(0, 2), 16) / 255;
	const g = Number.parseInt(value.slice(2, 4), 16) / 255;
	const b = Number.parseInt(value.slice(4, 6), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	let h = 0;
	let s = 0;
	if (d !== 0) {
		s = d / (1 - Math.abs(2 * l - 1));
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function isHexColor({ value }: { value: string }): boolean {
	return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function applyAccent({ color }: { color: string }): void {
	if (!isHexColor({ value: color })) return;
	const { h, s, l } = hexToHsl({ hex: color });
	const root = document.documentElement;
	root.style.setProperty("--jeo-h", String(h));
	root.style.setProperty("--jeo-s", `${s}%`);
	// Keep the accent readable on the dark theme.
	root.style.setProperty("--jeo-l", `${Math.min(Math.max(l, 45), 70)}%`);
}

const TINT_KEY = "jeo-tint";
const TINTS: Array<{ name: string; value: string }> = [
	{ name: "Grey", value: "0%" },
	{ name: "Soft", value: "5%" },
	{ name: "Deep", value: "11%" },
];
const DEFAULT_TINT = "5%";

/** How much of the accent hue the dark panels carry. */
export function applyTint({ value }: { value: string }): void {
	if (!TINTS.some((tint) => tint.value === value)) return;
	document.documentElement.style.setProperty("--jeo-base-s", value);
}

function readStoredTint(): string {
	try {
		const stored = window.localStorage.getItem(TINT_KEY);
		return stored && TINTS.some((tint) => tint.value === stored)
			? stored
			: DEFAULT_TINT;
	} catch {
		return DEFAULT_TINT;
	}
}

function readStoredAccent(): string {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		return stored && isHexColor({ value: stored }) ? stored : DEFAULT_ACCENT;
	} catch {
		return DEFAULT_ACCENT;
	}
}

/** Applies the saved accent colour as soon as the app loads. */
export function AccentApplier() {
	useEffect(() => {
		applyAccent({ color: readStoredAccent() });
		applyTint({ value: readStoredTint() });

		// Desktop app: tell the user where an export was saved.
		const onExportSaved = (event: Event) => {
			const detail = (event as CustomEvent<{ ok: boolean; message: string }>)
				.detail;
			if (detail?.ok) toast.success(detail.message);
			else toast.error(detail?.message ?? "Export could not be saved");
		};
		window.addEventListener("jeo:export-saved", onExportSaved);
		return () => window.removeEventListener("jeo:export-saved", onExportSaved);
	}, []);
	return null;
}

export function AccentPicker() {
	const [accent, setAccent] = useState(DEFAULT_ACCENT);
	const [tint, setTint] = useState(DEFAULT_TINT);

	useEffect(() => {
		setAccent(readStoredAccent());
		setTint(readStoredTint());
	}, []);

	const chooseTint = ({ value }: { value: string }) => {
		setTint(value);
		applyTint({ value });
		try {
			window.localStorage.setItem(TINT_KEY, value);
		} catch {
			// Tint still applies for this session.
		}
	};

	const choose = ({ color }: { color: string }) => {
		setAccent(color);
		applyAccent({ color });
		try {
			window.localStorage.setItem(STORAGE_KEY, color);
		} catch {
			// Colour still applies for this session.
		}
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					size="icon"
					variant="ghost"
					className="size-8"
					aria-label="Colours"
					title="Accent and panel colours"
				>
					<span className="bg-primary size-4 rounded-full ring-1 ring-white/30" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="z-100 w-56 p-3">
				<p className="text-muted-foreground mb-2 text-xs">Accent colour</p>
				<div className="grid grid-cols-4 gap-2">
					{PRESETS.map((preset) => (
						<button
							key={preset.color}
							type="button"
							title={preset.name}
							aria-label={preset.name}
							aria-pressed={accent.toLowerCase() === preset.color}
							onClick={() => choose({ color: preset.color })}
							className={cn(
								"h-8 w-full cursor-pointer rounded-md ring-offset-2 ring-offset-background",
								accent.toLowerCase() === preset.color && "ring-2 ring-white",
							)}
							style={{ backgroundColor: preset.color }}
						/>
					))}
				</div>
				<label className="mt-3 flex items-center justify-between gap-2 text-xs">
					<span className="text-muted-foreground">Any colour</span>
					<input
						type="color"
						value={accent}
						onChange={(event) => choose({ color: event.target.value })}
						className="h-7 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
					/>
				</label>
				<p className="text-muted-foreground mt-3 mb-2 text-xs">Panel colour</p>
				<div className="grid grid-cols-3 gap-1.5">
					{TINTS.map((option) => (
						<button
							key={option.value}
							type="button"
							aria-pressed={tint === option.value}
							onClick={() => chooseTint({ value: option.value })}
							className={cn(
								"cursor-pointer rounded-md px-2 py-1.5 text-xs transition-colors duration-150",
								tint === option.value
									? "bg-secondary text-secondary-foreground"
									: "bg-accent hover:bg-accent/70",
							)}
						>
							{option.name}
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
