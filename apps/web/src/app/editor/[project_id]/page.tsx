"use client";

import { useParams } from "next/navigation";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import { AssetsPanel } from "@/components/editor/panels/assets";
import { PropertiesPanel } from "@/components/editor/panels/properties";
import { Timeline } from "@/timeline/components";
import { PreviewPanel } from "@/preview/components";
import { EditorHeader } from "@/components/editor/editor-header";
import { EditorProvider } from "@/components/providers/editor-provider";
import { MigrationDialog } from "@/project/components/migration-dialog";
import { usePanelStore } from "@/editor/panel-store";
import { getLayoutPreset, type TopPanelId } from "@/panels/layout";
import { usePasteMedia } from "@/media/use-paste-media";
import { MobileGate } from "@/components/editor/mobile-gate";
import { AiChatRuntime } from "@/jeo/components/ai-chat";
import { Fragment, useMemo, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
	createPreviewOverlayControl,
	isPreviewOverlayVisible,
	mergePreviewOverlaySources,
} from "@/preview/overlays";
import { usePreviewStore } from "@/preview/preview-store";
import { getGuidePreviewOverlaySource } from "@/guides";
import {
	bookmarkNotesPreviewOverlay,
	getBookmarkPreviewOverlaySource,
} from "@/timeline/bookmarks/index";

export default function Editor() {
	const params = useParams();
	const projectId = params.project_id as string;

	return (
		<MobileGate>
			<EditorProvider projectId={projectId}>
				<div className="bg-background flex h-screen w-screen flex-col overflow-hidden">
					<DegradedRendererBanner />
					<EditorHeader />
					<div className="min-h-0 min-w-0 flex-1">
						<EditorLayout />
					</div>
					<MigrationDialog />
					<AiChatRuntime />
				</div>
			</EditorProvider>
		</MobileGate>
	);
}

function DegradedRendererBanner() {
	const isDegraded = useEditor((e) => e.renderer.isDegraded);
	const [dismissed, setDismissed] = useState(false);
	if (!isDegraded || dismissed) return null;

	return (
		<div className="bg-accent border-b h-9 flex items-center justify-center gap-2 text-xs text-muted-foreground">
			<span>Graphics are running in slow fallback mode on this computer.</span>
			<Button
				variant="text"
				size="icon"
				className="p-0 w-auto [&_svg]:size-3.5"
				onClick={() => setDismissed(true)}
				aria-label="Dismiss"
			>
				<HugeiconsIcon icon={Cancel01Icon} />
			</Button>
		</div>
	);
}

function EditorLayout() {
	usePasteMedia();
	const { panels, setPanel, layout, layoutNonce } = usePanelStore();
	const preset = getLayoutPreset(layout);
	const order = preset.order;
	const activeScene = useEditor((editor) =>
		editor.scenes.getActiveSceneOrNull(),
	);
	const currentTime = useEditor((editor) => editor.playback.getCurrentTime());
	const activeGuide = usePreviewStore((state) => state.activeGuide);
	const overlays = usePreviewStore((state) => state.overlays);
	const setOverlayVisibility = usePreviewStore(
		(state) => state.setOverlayVisibility,
	);
	const showBookmarkNotes = isPreviewOverlayVisible({
		overlay: bookmarkNotesPreviewOverlay,
		overlays,
	});

	const overlaySource = useMemo(
		() =>
			mergePreviewOverlaySources({
				sources: [
					getGuidePreviewOverlaySource({
						guideId: activeGuide,
					}),
					activeScene
						? getBookmarkPreviewOverlaySource({
								bookmarks: activeScene.bookmarks,
								time: currentTime,
								isVisible: showBookmarkNotes,
							})
						: {
								definitions: [bookmarkNotesPreviewOverlay],
								instances: [],
							},
				],
			}),
		[activeGuide, activeScene, currentTime, showBookmarkNotes],
	);

	const overlayControls = useMemo(
		() =>
			overlaySource.definitions.map((overlay) =>
				createPreviewOverlayControl({ overlay, overlays }),
			),
		[overlaySource.definitions, overlays],
	);

	const overlayProps = {
		overlayControls,
		overlayInstances: overlaySource.instances,
		onOverlayVisibilityChange: setOverlayVisibility,
	};
	const topPanel = (id: TopPanelId) => {
		if (id === "tools") return <AssetsPanel />;
		if (id === "properties") return <PropertiesPanel />;
		return <PreviewPanel {...overlayProps} />;
	};
	const limits: Record<TopPanelId, { min: number; max?: number }> = {
		tools: { min: 15, max: 45 },
		properties: { min: 15, max: 45 },
		preview: { min: 25 },
	};

	const topRow = (
		<ResizablePanelGroup
			direction="horizontal"
			className={
				preset.shape === "tall-preview"
					? "size-full gap-[0.19rem] pl-3"
					: "size-full gap-[0.19rem] px-3"
			}
			onLayout={(sizes) => {
				order.forEach((id, index) => {
					setPanel({ panel: id, size: sizes[index] ?? panels[id] });
				});
			}}
		>
			{order.map((id, index) => (
				<Fragment key={id}>
					{index > 0 && <ResizableHandle withHandle />}
					<ResizablePanel
						defaultSize={panels[id]}
						minSize={limits[id].min}
						maxSize={preset.shape === "tall-preview" ? 85 : limits[id].max}
						className="min-h-0 min-w-0"
					>
						{topPanel(id)}
					</ResizablePanel>
				</Fragment>
			))}
		</ResizablePanelGroup>
	);

	// JEO: CapCut's upright-video layout, with the preview as a tall column
	if (preset.shape === "tall-preview") {
		return (
			<ResizablePanelGroup
				key={`${layout}:${layoutNonce}`}
				direction="horizontal"
				className="size-full gap-[0.19rem] pr-3"
				data-jeo-shape="tall-preview"
				onLayout={(sizes) => {
					setPanel({ panel: "preview", size: sizes[1] ?? panels.preview });
				}}
			>
				<ResizablePanel
					defaultSize={100 - panels.preview}
					minSize={40}
					className="min-h-0 min-w-0"
				>
					<ResizablePanelGroup
						direction="vertical"
						className="size-full gap-[0.18rem]"
						onLayout={(sizes) => {
							setPanel({
								panel: "mainContent",
								size: sizes[0] ?? panels.mainContent,
							});
							setPanel({ panel: "timeline", size: sizes[1] ?? panels.timeline });
						}}
					>
						<ResizablePanel
							defaultSize={panels.mainContent}
							minSize={25}
							maxSize={80}
							className="min-h-0"
						>
							{topRow}
						</ResizablePanel>
						<ResizableHandle withHandle />
						<ResizablePanel
							defaultSize={panels.timeline}
							minSize={15}
							maxSize={75}
							className="min-h-0 pb-3 pl-3"
						>
							<Timeline />
						</ResizablePanel>
					</ResizablePanelGroup>
				</ResizablePanel>
				<ResizableHandle withHandle />
				<ResizablePanel
					defaultSize={panels.preview}
					minSize={20}
					maxSize={60}
					className="min-h-0 min-w-0 pb-3"
				>
					<PreviewPanel {...overlayProps} />
				</ResizablePanel>
			</ResizablePanelGroup>
		);
	}

	return (
		<ResizablePanelGroup
			// JEO: choosing a layout re-lays the panels from the preset's sizes
			key={`${layout}:${layoutNonce}`}
			direction="vertical"
			className="size-full gap-[0.18rem]"
			onLayout={(sizes) => {
				setPanel({
					panel: "mainContent",
					size: sizes[0] ?? panels.mainContent,
				});
				setPanel({
					panel: "timeline",
					size: sizes[1] ?? panels.timeline,
				});
			}}
		>
			<ResizablePanel
				defaultSize={panels.mainContent}
				minSize={30}
				maxSize={85}
				className="min-h-0"
			>
				{topRow}
			</ResizablePanel>

			<ResizableHandle withHandle />

			<ResizablePanel
				defaultSize={panels.timeline}
				minSize={15}
				maxSize={70}
				className="min-h-0 px-3 pb-3"
			>
				<Timeline />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}