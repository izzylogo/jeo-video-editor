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
 * JEO top toolbar: [AI] · Media · Audio · Captions · Tags · Freeze · Effects ·
 * Endings · … Clicking a category shows its options in the left panel.
 */
export function CategoryBar() {
	const { activeTab, setActiveTab } = useAssetsPanelStore();
	const isClaudeBusy = useChatStore((state) => state.isBusy);

	return (
		<div className="flex min-w-0 items-center gap-1">
			<div className="scrollbar-hidden flex min-w-0 items-center gap-0.5 overflow-x-auto">
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
								"flex h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150 max-[899px]:h-11 max-[899px]:min-w-11",
								isActive
									? "bg-secondary text-secondary-foreground"
									: tabKey === "ai"
										? "text-primary hover:bg-primary/15"
										: "text-muted-foreground hover:bg-accent hover:text-foreground",
							)}
						>
							<tab.icon className="size-4" />
							{/* JEO: on a small laptop the words go and the icons stay */}
							<span className="hidden min-[1560px]:inline">{tab.label}</span>
							{/* a dot on the AI tab while Claude is still working */}
							{tabKey === "ai" && isClaudeBusy && !isActive && (
								<span className="bg-primary size-1.5 animate-pulse rounded-full" />
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
