"use client";

import {
	type Tab,
	tabs,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { Captions } from "@/subtitles/components/assets-view";
import { MediaView } from "./views/assets";
import { SettingsView } from "./views/settings";
import { SoundsView } from "@/sounds/components/assets-view";
import { StickersView } from "@/stickers/components/assets-view";
import { TextView } from "@/text/components/assets-view";
import { EffectsView } from "@/effects/components/assets-view";

// JEO: the category buttons live in the top toolbar (CategoryBar); this panel
// only shows the options of the chosen category.
export function AssetsPanel() {
	const { activeTab } = useAssetsPanelStore();

	const viewMap: Record<Tab, React.ReactNode> = {
		media: <MediaView />,
		sounds: <SoundsView />,
		text: <TextView />,
		tags: (
			<ComingSoon
				tab="tags"
				text="▼ identity tags, feeling tags and ↗ arrows will be here."
			/>
		),
		freeze: (
			<ComingSoon
				tab="freeze"
				text="One click to add a 2-second freeze frame at the playhead."
			/>
		),
		effects: <EffectsView />,
		endings: (
			<ComingSoon
				tab="endings"
				text="One-click 😂 funny ending and ❤️ sweet ending."
			/>
		),
		stickers: <StickersView />,
		captions: <Captions />,
		settings: <SettingsView />,
	};

	return (
		<div className="panel bg-background flex h-full overflow-hidden rounded-sm border">
			<div className="flex-1 overflow-hidden">{viewMap[activeTab]}</div>
		</div>
	);
}

function ComingSoon({ tab, text }: { tab: Tab; text: string }) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
			<p className="text-foreground text-sm font-medium">{tabs[tab].label}</p>
			<p className="text-muted-foreground text-xs">{text}</p>
			<p className="text-muted-foreground/70 text-xs">Coming in Phase 2.</p>
		</div>
	);
}
