"use client";

import { useChatStore } from "@/jeo/components/ai-chat";
import { HugeiconsIcon } from "@hugeicons/react";
import { BubbleChatIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";
import {
	type Tab,
	TAB_KEYS,
	tabs,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";

/** What each category is for, shown when the mouse rests on it. */
const TAB_TIPS: Record<Tab, string> = {
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
	const isChatOpen = useChatStore((state) => state.isOpen);
	const toggleChat = useChatStore((state) => state.toggle);

	return (
		<div className="flex min-w-0 items-center gap-1">
			<button
				type="button"
				onClick={toggleChat}
				aria-pressed={isChatOpen}
				title="Show or hide the Claude chat"
				className={cn(
					"flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors duration-150",
					isChatOpen
						? "bg-primary text-primary-foreground"
						: "bg-primary/15 text-primary hover:bg-primary/25",
				)}
			>
				<HugeiconsIcon icon={BubbleChatIcon} className="size-4" />
				AI
			</button>
			<div className="bg-border mx-1 h-5 w-px shrink-0" />
			<div className="scrollbar-hidden flex min-w-0 items-center gap-0.5 overflow-x-auto">
				{TAB_KEYS.map((tabKey) => {
					const tab = tabs[tabKey];
					const isActive = activeTab === tabKey;
					return (
						<button
							key={tabKey}
							type="button"
							aria-pressed={isActive}
							title={TAB_TIPS[tabKey]}
							onClick={() => setActiveTab(tabKey)}
							className={cn(
								"flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150",
								isActive
									? "bg-secondary text-secondary-foreground"
									: "text-muted-foreground hover:bg-accent hover:text-foreground",
							)}
						>
							<tab.icon className="size-4" />
							{tab.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
