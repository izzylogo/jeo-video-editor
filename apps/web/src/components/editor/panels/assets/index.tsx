"use client";

import { AudioView } from "@/jeo/components/audio-view";
import { CategoryBar } from "@/components/editor/category-bar";
import {
	type Tab,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { Captions } from "@/subtitles/components/assets-view";
import { MediaView } from "./views/assets";
import { SettingsView } from "./views/settings";
import { StickersView } from "@/stickers/components/assets-view";
import { EffectsView } from "@/effects/components/assets-view";
import { AiChatView } from "@/jeo/components/ai-chat";
import {
	CaptionsView,
	EndingsView,
	FreezeView,
	TagsView,
	useExposeJeoActions,
} from "@/jeo/components/panels";

// JEO: like CapCut, the category tabs sit at the top of this panel and the
// options of the chosen category are shown underneath.
export function AssetsPanel() {
	const { activeTab } = useAssetsPanelStore();
	useExposeJeoActions();

	const viewMap: Record<Tab, React.ReactNode> = {
		ai: <AiChatView />,
		media: <MediaView />,
		sounds: <AudioView />,
		text: <CaptionsView />,
		tags: <TagsView />,
		freeze: <FreezeView />,
		effects: <EffectsView />,
		endings: <EndingsView />,
		stickers: <StickersView />,
		captions: <Captions />,
		settings: <SettingsView />,
	};

	return (
		<div className="panel bg-background flex h-full flex-col overflow-hidden rounded-sm border">
			<CategoryBar />
			<div className="min-h-0 flex-1 overflow-hidden">{viewMap[activeTab]}</div>
		</div>
	);
}
