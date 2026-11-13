"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { usePropertiesStore } from "./stores/properties-store";
import { getPropertiesConfig } from "./registry";
import { cn } from "@/utils/ui";
import { EmptyView } from "./empty-view";
import { MultiSelectPanel } from "@/jeo/components/multi-panel";

export function PropertiesPanel() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	useEditor((e) => e.media.getAssets());
	const { selectedElements } = useElementSelection();
	const { activeTabPerType, setActiveTab } = usePropertiesStore();

	if (selectedElements.length === 0) {
		return (
			<div className="panel bg-background flex h-full flex-col items-center justify-center overflow-hidden rounded-sm border">
				<EmptyView />
			</div>
		);
	}

	// JEO: several clips selected: show the settings they share
	if (selectedElements.length > 1) {
		return (
			<MultiSelectPanel
				// a new selection starts with clean boxes
				key={selectedElements.map((item) => item.elementId).join("|")}
				picked={editor.timeline.getElementsWithTracks({
					elements: selectedElements,
				})}
			/>
		);
	}
	const mediaAssets = editor.media.getAssets();

	const elementsWithTracks = editor.timeline.getElementsWithTracks({
		elements: selectedElements,
	});
	const elementWithTrack = elementsWithTracks[0];

	if (!elementWithTrack) return null;

	const { element, track } = elementWithTrack;
	const config = getPropertiesConfig({ element, mediaAssets });
	const visibleTabs = config.tabs;

	const storedTabId = activeTabPerType[element.type];
	const isStoredTabVisible = visibleTabs.some((t) => t.id === storedTabId);
	const activeTabId = isStoredTabVisible ? storedTabId : config.defaultTab;
	const activeTab =
		visibleTabs.find((t) => t.id === activeTabId) ?? visibleTabs[0];

	if (!activeTab) return null;

	return (
		<div
			className="panel bg-background flex h-full flex-col overflow-hidden rounded-sm border"
			data-jeo="properties"
		>
			{/* JEO: named tabs across the top, the way CapCut shows them */}
			<div
				role="tablist"
				className="scrollbar-hidden flex h-10 shrink-0 items-center gap-4 overflow-x-auto border-b px-4"
			>
				{visibleTabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={tab.id === activeTab.id}
						data-jeo-tab={tab.id}
						onClick={() =>
							setActiveTab({ elementType: element.type, tabId: tab.id })
						}
						className={cn(
							"h-full shrink-0 cursor-pointer border-b-2 text-sm transition-colors duration-150",
							tab.id === activeTab.id
								? "border-primary text-primary font-medium"
								: "text-muted-foreground hover:text-foreground border-transparent",
						)}
					>
						{tab.label}
					</button>
				))}
			</div>
			<ScrollArea className="min-h-0 flex-1 scrollbar-hidden">
				{activeTab.content({ trackId: track.id })}
			</ScrollArea>
		</div>
	);
}