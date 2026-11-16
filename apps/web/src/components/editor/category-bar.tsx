"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/jeo/components/ai-chat";
import { cn } from "@/utils/ui";
import {
	type Tab,
	TAB_KEYS,
	tabs,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";

/** What each category is for, shown when the mouse rests on it. */
const TAB_TIPS: Record<Tab, string> = {
	ai: "Chat with Claude: tell it the storyline or script and it edits the timeline.",
	media: "Your clips and pictures. Import, then add to the timeline.",
	sounds: "Music and sound effects from your assets folder.",
	text: "Captions in your style: scene text, narrative, dialogue, twist line.",
	tags: "▼ identity tags, feeling tags and ↗ arrows. Make a tag follow a head.",
	freeze: "Hold the picture at the playhead (your 2-second intro freeze).",
	effects: "Pop-up, colour flash, blur shake, colour split.",
	endings: "One-click 😂 or ❤️ ending, and the :29 length helper.",
	stickers: "Stickers and shapes.",
	captions: "Automatic subtitles from speech.",
	settings: "Project size, frame rate and background.",
};

function TabButton({ tabKey }: { tabKey: Tab }) {
	const { activeTab, setActiveTab } = useAssetsPanelStore();
	const isClaudeBusy = useChatStore((state) => state.isBusy);
	const tab = tabs[tabKey];
	const isActive = activeTab === tabKey;
	return (
		<button
			type="button"
			aria-pressed={isActive}
			title={`${tab.label}: ${TAB_TIPS[tabKey]}`}
			aria-label={tab.label}
			data-jeo-category={tabKey}
			onClick={() => setActiveTab(tabKey)}
			className={cn(
				"relative flex h-11 min-w-[3.3rem] shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md px-1.5 text-[0.66rem] leading-none font-medium transition-colors duration-150",
				isActive
					? "bg-accent text-primary"
					: tabKey === "ai"
						? "text-primary/80 hover:bg-primary/15"
						: "text-muted-foreground hover:bg-accent hover:text-foreground",
			)}
		>
			<tab.icon className="size-[1.15rem] shrink-0" />
			<span className="whitespace-nowrap">{tab.label}</span>
			{/* a dot on the AI tab while Claude is still working */}
			{tabKey === "ai" && isClaudeBusy && !isActive && (
				<span className="bg-primary absolute top-1 right-1.5 size-1.5 animate-pulse rounded-full" />
			)}
		</button>
	);
}

/**
 * JEO category tabs, laid out like CapCut's: one row at the top of the left
 * panel, each tab an icon with its name underneath.
 *
 * The AI tab stands alone on the left and never moves. The other tabs sit in
 * a row that slides sideways when they do not all fit: drag the thin bar, turn
 * the mouse wheel, or click the small arrow that appears at the hidden side.
 */
export function CategoryBar() {
	const activeTab = useAssetsPanelStore((state) => state.activeTab);
	const rowRef = useRef<HTMLDivElement>(null);
	const [canLeft, setCanLeft] = useState(false);
	const [canRight, setCanRight] = useState(false);

	const measure = useCallback(() => {
		const row = rowRef.current;
		if (!row) return;
		setCanLeft(row.scrollLeft > 2);
		setCanRight(row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
	}, []);

	useEffect(() => {
		const row = rowRef.current;
		if (!row) return;
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(row);
		row.addEventListener("scroll", measure, { passive: true });
		// the mouse wheel slides the row sideways
		const onWheel = (event: WheelEvent) => {
			if (row.scrollWidth <= row.clientWidth) return;
			if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
			event.preventDefault();
			row.scrollLeft += event.deltaY;
		};
		row.addEventListener("wheel", onWheel, { passive: false });
		return () => {
			observer.disconnect();
			row.removeEventListener("scroll", measure);
			row.removeEventListener("wheel", onWheel);
		};
	}, [measure]);

	// the chosen tab is always brought into view
	useEffect(() => {
		const row = rowRef.current;
		const chosen = row?.querySelector<HTMLElement>(
			`[data-jeo-category="${activeTab}"]`,
		);
		if (!row || !chosen) return;
		const left = chosen.offsetLeft - 28;
		const right = chosen.offsetLeft + chosen.offsetWidth + 28;
		if (left < row.scrollLeft) row.scrollTo({ left, behavior: "smooth" });
		else if (right > row.scrollLeft + row.clientWidth) {
			row.scrollTo({ left: right - row.clientWidth, behavior: "smooth" });
		}
	}, [activeTab]);

	const slide = (direction: -1 | 1) => {
		const row = rowRef.current;
		if (!row) return;
		row.scrollBy({
			left: direction * Math.max(120, row.clientWidth * 0.7),
			behavior: "smooth",
		});
	};

	const arrow =
		"text-foreground bg-background/95 hover:bg-accent absolute top-[1.375rem] z-10 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors duration-150 active:scale-95";

	return (
		<div
			className="flex shrink-0 items-start gap-1 border-b px-1.5 pt-1"
			data-jeo="category-bar"
		>
			{/* AI stands alone: it is not part of the sliding row */}
			<div className="shrink-0 pb-1" data-jeo="category-fixed">
				<TabButton tabKey="ai" />
			</div>
			<div className="bg-border mt-2.5 h-6 w-px shrink-0" />
			<div className="relative min-w-0 flex-1">
				<div
					ref={rowRef}
					data-jeo="category-slider"
					className="jeo-tab-slider relative flex gap-0.5 overflow-x-auto pb-1"
				>
					{TAB_KEYS.filter((tabKey) => tabKey !== "ai").map((tabKey) => (
						<TabButton key={tabKey} tabKey={tabKey} />
					))}
				</div>
				{canLeft && (
					<>
						<div className="from-background pointer-events-none absolute top-0 left-0 h-11 w-9 bg-gradient-to-r to-transparent" />
						<button
							type="button"
							aria-label="Show the tabs to the left"
							title="More tabs this way"
							data-jeo="category-arrow-left"
							onClick={() => slide(-1)}
							className={cn(arrow, "left-0")}
						>
							<span aria-hidden className="text-[10px] leading-none">
								&#9664;
							</span>
						</button>
					</>
				)}
				{canRight && (
					<>
						<div className="from-background pointer-events-none absolute top-0 right-0 h-11 w-9 bg-gradient-to-l to-transparent" />
						<button
							type="button"
							aria-label="Show the tabs to the right"
							title="More tabs this way"
							data-jeo="category-arrow-right"
							onClick={() => slide(1)}
							className={cn(arrow, "right-0")}
						>
							<span aria-hidden className="text-[10px] leading-none">
								&#9654;
							</span>
						</button>
					</>
				)}
			</div>
		</div>
	);
}
