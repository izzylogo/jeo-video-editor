"use client";

/**
 * Colours, done the way My Animator does them: you pick two colours, an
 * accent and a base, and every other interface colour is worked out from
 * them. The accent is used exactly as picked; it is only nudged when it would
 * be unreadable against the panels.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "@/utils/ui";

const ACCENT_KEY = "jeo-accent";
const BASE_KEY = "jeo-base";
export const DEFAULT_ACCENT = "#8b5cf6";
const DEFAULT_BASE = "match";

const ACCENTS: Array<[string, string]> = [
	["Violet", "#8b5cf6"],
	["White", "#f2f2f2"],
	["Orange", "#ff7a1a"],
	["Red", "#f0444f"],
	["Pink", "#ff5fa2"],
	["Yellow", "#ffd23f"],
	["Green", "#35c46a"],
	["Teal", "#19bfae"],
	["Blue", "#3b8bff"],
];

/** panel tints; "match" follows the accent's hue */
const BASES: Array<[string, string]> = [
	["Match the accent", "match"],
	["Graphite", "#333333"],
	["Slate", "#2b3440"],
	["Forest", "#2a3a32"],
	["Wine", "#3b2a30"],
	["Walnut", "#3a342c"],
	["Midnight", "#262a45"],
];

const isHex = (value: unknown): value is string =>
	typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const channels = (hex: string) =>
	[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

function mix(a: string, b: string, t: number): string {
	const to = channels(b);
	return `#${channels(a)
		.map((v, i) =>
			Math.round(v + (to[i] - v) * t)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

function luminance(hex: string): number {
	const [r, g, b] = channels(hex).map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

function hueAndSaturation(hex: string): { h: number; s: number } {
	const [r, g, b] = channels(hex).map((v) => v / 255);
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	if (d === 0) return { h: 0, s: 0 };
	const s = d / (1 - Math.abs(2 * l - 1));
	let h =
		max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	h *= 60;
	if (h < 0) h += 360;
	return { h: Math.round(h), s: Math.round(s * 100) };
}

interface Colours {
	accent: string;
	base: string;
}

function loadColours(): Colours {
	try {
		const accent = window.localStorage.getItem(ACCENT_KEY);
		const base = window.localStorage.getItem(BASE_KEY);
		return {
			accent: isHex(accent) ? accent : DEFAULT_ACCENT,
			base: base === "match" || isHex(base) ? base : DEFAULT_BASE,
		};
	} catch {
		return { accent: DEFAULT_ACCENT, base: DEFAULT_BASE };
	}
}

/** Works out and sets every colour that depends on the two choices. */
export function applyColours({ accent, base }: Colours): void {
	if (!isHex(accent)) return;
	const root = document.documentElement;
	const isDark = root.classList.contains("dark");
	const panel = isDark ? "#1a1a1c" : "#fafafa";
	const text = isDark ? "#f2f2f2" : "#1e1e1e";

	// the accent as picked; nudged only if it would vanish against the panels
	let shown = accent;
	for (let i = 0; i < 30 && contrast(shown, panel) < 3; i++) {
		shown = mix(shown, text, 0.1);
	}
	const onAccent =
		contrast(shown, "#1e1e1e") >= contrast(shown, "#ffffff") ? "#1e1e1e" : "#ffffff";

	const { h, s } = hueAndSaturation(shown);
	root.style.setProperty("--jeo-h", String(h));
	root.style.setProperty("--jeo-s", `${s}%`);
	root.style.setProperty("--primary", shown);
	root.style.setProperty("--primary-foreground", onAccent);
	// the soft "selected" colours, tinted with the accent itself
	root.style.setProperty(
		"--secondary",
		isDark ? mix(shown, "#000000", 0.78) : mix(shown, "#ffffff", 0.88),
	);
	root.style.setProperty(
		"--secondary-border",
		isDark ? mix(shown, "#000000", 0.68) : mix(shown, "#ffffff", 0.78),
	);
	let soft = shown;
	const softPanel = isDark ? mix(shown, "#000000", 0.78) : mix(shown, "#ffffff", 0.88);
	for (let i = 0; i < 30 && contrast(soft, softPanel) < 4.5; i++) {
		soft = mix(soft, text, 0.08);
	}
	root.style.setProperty("--secondary-foreground", soft);

	// panels carry a little of the base colour
	const tint = base === "match" ? { h, s: s === 0 ? 0 : 5 } : hueAndSaturation(base);
	root.style.setProperty("--jeo-base-h", String(tint.h));
	root.style.setProperty("--jeo-base-s", `${Math.min(tint.s, 26)}%`);
}

/** kept for older callers */
export function applyAccent({ color }: { color: string }): void {
	applyColours({ ...loadColours(), accent: color });
}

/** Applies the saved colours as soon as the app loads, and on light/dark. */
export function AccentApplier() {
	useEffect(() => {
		applyColours(loadColours());
		const observer = new MutationObserver(() => applyColours(loadColours()));
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		// Desktop app: tell the user where an export was saved.
		const onExportSaved = (event: Event) => {
			const detail = (event as CustomEvent<{ ok: boolean; message: string }>)
				.detail;
			if (detail?.ok) toast.success(detail.message);
			else toast.error(detail?.message ?? "Export could not be saved");
		};
		window.addEventListener("jeo:export-saved", onExportSaved);
		return () => {
			observer.disconnect();
			window.removeEventListener("jeo:export-saved", onExportSaved);
		};
	}, []);
	return null;
}

function Swatches({
	label,
	options,
	value,
	onPick,
	jeoId,
}: {
	label: string;
	options: Array<[string, string]>;
	value: string;
	onPick: (value: string) => void;
	jeoId: string;
}) {
	const custom = isHex(value) && !options.some(([, hex]) => hex === value.toLowerCase());
	const [draft, setDraft] = useState<string | null>(null);
	return (
		<div>
			<p className="text-muted-foreground mb-2 text-xs">{label}</p>
			<div className="flex flex-wrap items-center gap-2">
				{options.map(([name, hex]) => (
					<button
						key={hex}
						type="button"
						title={name}
						aria-label={`${label}: ${name}`}
						aria-pressed={value.toLowerCase() === hex}
						data-jeo-swatch={`${jeoId}:${hex}`}
						onClick={() => onPick(hex)}
						className={cn(
							"size-7 cursor-pointer rounded-full border border-white/20 transition-transform duration-150 hover:scale-110",
							value.toLowerCase() === hex &&
								"ring-foreground ring-offset-background ring-2 ring-offset-2",
						)}
						style={
							hex === "match"
								? {
										background:
											"conic-gradient(var(--primary), #333 40%, var(--primary))",
									}
								: { backgroundColor: hex }
						}
					/>
				))}
				{/* any colour: the system picker, used live while you drag in it */}
				<label
					title="Pick any colour"
					className={cn(
						"relative size-7 cursor-pointer overflow-hidden rounded-full border border-white/20",
						custom && "ring-foreground ring-offset-background ring-2 ring-offset-2",
					)}
					style={{
						background: custom
							? value
							: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
					}}
				>
					<input
						type="color"
						aria-label={`${label}: any colour`}
						data-jeo-colour={jeoId}
						value={isHex(value) ? value : "#8b5cf6"}
						onInput={(event) => onPick(event.currentTarget.value.toLowerCase())}
						onChange={(event) => onPick(event.currentTarget.value.toLowerCase())}
						className="absolute inset-0 size-full cursor-pointer opacity-0"
					/>
				</label>
			</div>
			<div className="mt-2 flex items-center gap-2">
				<span className="text-muted-foreground text-xs">Code</span>
				<input
					aria-label={`${label}: colour code`}
					data-jeo-hex={jeoId}
					spellCheck={false}
					className="border-input bg-accent h-7 w-24 rounded-md border px-2 font-mono text-xs outline-none"
					value={draft ?? (isHex(value) ? value : "")}
					placeholder="#rrggbb"
					onChange={(event) => {
						const next = event.currentTarget.value.trim();
						setDraft(next);
						const withHash = next.startsWith("#") ? next : `#${next}`;
						if (isHex(withHash)) onPick(withHash.toLowerCase());
					}}
					onBlur={() => setDraft(null)}
				/>
			</div>
		</div>
	);
}

export function AccentPicker() {
	const [colours, setColours] = useState<Colours>({
		accent: DEFAULT_ACCENT,
		base: DEFAULT_BASE,
	});

	useEffect(() => {
		setColours(loadColours());
	}, []);

	const choose = (change: Partial<Colours>) => {
		const next = { ...colours, ...change };
		setColours(next);
		try {
			window.localStorage.setItem(ACCENT_KEY, next.accent);
			window.localStorage.setItem(BASE_KEY, next.base);
		} catch {
			// the choice still applies until the app closes
		}
		applyColours(next);
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
					data-jeo="colours"
				>
					<span className="bg-primary size-4 rounded-full ring-1 ring-white/30" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="z-100 w-72 space-y-4 p-4"
				// the system colour picker is its own window: opening it must not
				// close this box, or the colour you pick has nowhere to land
				onFocusOutside={(event) => event.preventDefault()}
			>
				<Swatches
					label="Accent"
					jeoId="accent"
					options={ACCENTS}
					value={colours.accent}
					onPick={(accent) => choose({ accent })}
				/>
				<Swatches
					label="Base (panel tint)"
					jeoId="base"
					options={BASES}
					value={colours.base}
					onPick={(base) => choose({ base })}
				/>
				<button
					type="button"
					onClick={() => choose({ accent: DEFAULT_ACCENT, base: DEFAULT_BASE })}
					className="text-muted-foreground hover:text-foreground cursor-pointer text-xs underline-offset-2 hover:underline"
				>
					Back to the JEO colours
				</button>
			</PopoverContent>
		</Popover>
	);
}