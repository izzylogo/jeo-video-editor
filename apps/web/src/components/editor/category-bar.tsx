"use client";

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

/**
 * JEO category tabs, laid out like CapCut's: a row at the top of the left
 * panel, each tab an icon with its name underneath. Clicking one shows its
 * options in the panel below. When the panel is narrow the row wraps onto a
 * second line, so every tab stays visible.
 */
export function CategoryBar() {
	const { activeTab, setActiveTab } = useAssetsPanelStore();
	const isClaudeBusy = useChatStore((state) => state.isBusy);

	return (
		<div className="@container shrink-0 border-b px-1.5 py-1" data-jeo="category-bar">
			{/* even columns; a very narrow panel shows the icons only, in one row */}
			<div className="grid grid-cols-[repeat(11,minmax(0,1fr))] gap-0.5 @[20rem]:grid-cols-[repeat(auto-fit,minmax(3.2rem,1fr))]">
				{TAB_KEYS.map((tabKey) => {
					const tab = tabs[tabKey];
					const isActive = activeTab === tabKey;
					return (
						<button
							key={tabKey}
							type="button"
							aria-pressed={isActive}
							title={`${tab.label}: ${TAB_TIPS[tabKey]}`}
							aria-label={tab.label}
							data-jeo-category={tabKey}
							onClick={() => setActiveTab(tabKey)}
							className={cn(
								"relative flex h-8 min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md px-0.5 text-[0.66rem] leading-none font-medium transition-colors duration-150 @[20rem]:h-11",
								isActive
									? "text-primary"
									: tabKey === "ai"
										? "text-primary/80 hover:bg-primary/15"
										: "text-muted-foreground hover:bg-accent hover:text-foreground",
							)}
						>
							<tab.icon className="size-4 shrink-0 @[20rem]:size-[1.15rem]" />
							<span className="hidden whitespace-nowrap @[20rem]:inline">{tab.label}</span>
							{/* a dot on the AI tab while Claude is still working */}
							{tabKey === "ai" && isClaudeBusy && !isActive && (
								<span className="bg-primary absolute top-1 right-1.5 size-1.5 animate-pulse rounded-full" />
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
