"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { VoiceRecordButton } from "@/jeo/components/voice-record";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { MediaDragOverlay } from "@/components/editor/panels/assets/drag-overlay";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { mediaTimeFromSeconds, type MediaTime } from "@/wasm";
import { useEditor } from "@/editor/use-editor";
import { useFileUpload } from "@/media/use-file-upload";
import { invokeAction } from "@/actions";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import {
	SelectableItem,
	SelectableSurface,
	useSelection,
	useSelectionScope,
} from "@/selection";
import { buildElementFromMedia } from "@/timeline/element-utils";
import {
	type MediaSortKey,
	type MediaSortOrder,
	type MediaViewMode,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { MASKABLE_ELEMENT_TYPES } from "@/timeline";
import type { MediaAsset } from "@/media/types";
import { cn } from "@/utils/ui";
import {
	CloudUploadIcon,
	GridViewIcon,
	LeftToRightListDashIcon,
	SortingOneNineIcon,
	Image02Icon,
	MusicNote03Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

type MediaFilter = "all" | "video" | "image" | "audio" | "used" | "unused";
const MEDIA_FILTERS: Array<{ id: MediaFilter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "video", label: "Videos" },
	{ id: "image", label: "Pictures" },
	{ id: "audio", label: "Sounds" },
	{ id: "used", label: "Added" },
	{ id: "unused", label: "Not used" },
];

function matchesFilter({
	item,
	filter,
	usedIds,
}: {
	item: MediaAsset;
	filter: MediaFilter;
	usedIds: Set<string>;
}): boolean {
	if (item.ephemeral) return false;
	if (filter === "all") return true;
	if (filter === "used") return usedIds.has(item.id);
	if (filter === "unused") return !usedIds.has(item.id);
	return item.type === filter;
}

export function MediaView() {
	const editor = useEditor();
	const mediaFiles = useEditor((e) => e.media.getAssets());
	const activeProject = useEditor((e) => e.project.getActive());

	const {
		mediaViewMode,
		setMediaViewMode,
		highlightMediaId,
		clearHighlight,
		mediaSortBy,
		mediaSortOrder,
		setMediaSort,
	} = useAssetsPanelStore();

	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);

	const processFiles = async ({ files }: { files: File[] }) => {
		if (!files || files.length === 0) return;
		if (!activeProject) {
			toast.error("No active project");
			return;
		}

		setIsProcessing(true);
		setProgress(0);
		try {
			await showMediaUploadToast({
				filesCount: files.length,
				promise: async () => {
					const processedAssets = await processMediaAssets({
						files,
						onProgress: (progress: { progress: number }) =>
							setProgress(progress.progress),
					});
					for (const asset of processedAssets) {
						await editor.media.addMediaAsset({
							projectId: activeProject.metadata.id,
							asset,
						});
					}
					return {
						uploadedCount: processedAssets.length,
						assetNames: processedAssets.map((asset) => asset.name),
					};
				},
			});
		} catch (error) {
			console.error("Error processing files:", error);
		} finally {
			setIsProcessing(false);
			setProgress(0);
		}
	};

	const { isDragOver, dragProps, openFilePicker, fileInputProps } =
		useFileUpload({
			accept: "image/*,video/*,audio/*",
			multiple: true,
			onFilesSelected: (files) => processFiles({ files }),
		});

	const handleRemove = ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => {
		event.stopPropagation();

		invokeAction("remove-media-assets", {
			projectId: activeProject.metadata.id,
			assetIds: ids,
		});
	};

	const handleSort = ({ key }: { key: MediaSortKey }) => {
		if (mediaSortBy === key) {
			setMediaSort({
				key,
				order: mediaSortOrder === "asc" ? "desc" : "asc",
			});
		} else {
			setMediaSort({ key, order: "asc" });
		}
	};

	// JEO: which files are already on the timeline (they get an "Added" badge)
	const sceneTracks = useEditor((e) => e.scenes.getActiveSceneOrNull()?.tracks);
	const usedIds = useMemo(() => {
		const ids = new Set<string>();
		if (!sceneTracks) return ids;
		for (const track of [sceneTracks.main, ...sceneTracks.overlay, ...sceneTracks.audio]) {
			for (const element of track.elements) {
				if ("mediaId" in element && typeof element.mediaId === "string") {
					ids.add(element.mediaId);
				}
			}
		}
		return ids;
	}, [sceneTracks]);
	const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
	const [query, setQuery] = useState("");
	const allMedia = useMemo(
		() => mediaFiles.filter((item) => !item.ephemeral),
		[mediaFiles],
	);

	const filteredMediaItems = useMemo(() => {
		const wanted = query.trim().toLowerCase();
		const filtered = mediaFiles.filter(
			(item) =>
				!item.ephemeral &&
				matchesFilter({ item, filter: mediaFilter, usedIds }) &&
				(wanted === "" || item.name.toLowerCase().includes(wanted)),
		);

		filtered.sort((a, b) => {
			let valueA: string | number;
			let valueB: string | number;

			switch (mediaSortBy) {
				case "name":
					valueA = a.name.toLowerCase();
					valueB = b.name.toLowerCase();
					break;
				case "type":
					valueA = a.type;
					valueB = b.type;
					break;
				case "duration":
					valueA = a.duration || 0;
					valueB = b.duration || 0;
					break;
				case "size":
					valueA = a.file.size;
					valueB = b.file.size;
					break;
				default:
					return 0;
			}

			if (valueA < valueB) return mediaSortOrder === "asc" ? -1 : 1;
			if (valueA > valueB) return mediaSortOrder === "asc" ? 1 : -1;
			return 0;
		});

		return filtered;
	}, [mediaFiles, mediaSortBy, mediaSortOrder, mediaFilter, query, usedIds]);
	const orderedMediaIds = useMemo(() => {
		return filteredMediaItems.map((item) => item.id);
	}, [filteredMediaItems]);

	return (
		<>
			<input {...fileInputProps} />

			{/* JEO: laid out like CapCut's media panel: a short list on the left,
			    then Import / Record / search, then the files as cards */}
			<div
				className={cn(
					"@container relative flex h-full",
					isDragOver && "bg-accent/30",
				)}
				data-jeo="media-panel"
				{...dragProps}
			>
				<nav
					aria-label="Media kinds"
					className="hidden w-[6.6rem] shrink-0 flex-col gap-1 border-r p-2 @[23rem]:flex"
				>
					<Button
						size="sm"
						className="bg-primary/15 text-primary hover:bg-primary/25 h-8 w-full justify-start rounded-md px-2.5 text-xs font-medium"
						onClick={openFilePicker}
						disabled={isProcessing}
					>
						Import
					</Button>
					{MEDIA_FILTERS.map((option) => {
						const count = allMedia.filter((item) =>
							matchesFilter({ item, filter: option.id, usedIds }),
						).length;
						return (
							<button
								key={option.id}
								type="button"
								aria-pressed={mediaFilter === option.id}
								data-jeo-media-filter={option.id}
								onClick={() => setMediaFilter(option.id)}
								className={cn(
									"flex h-8 w-full cursor-pointer items-center justify-between rounded-md px-2.5 text-left text-xs transition-colors duration-150",
									mediaFilter === option.id
										? "bg-accent text-primary font-medium"
										: "text-foreground/85 hover:bg-accent/60",
								)}
							>
								<span className="truncate">{option.label}</span>
								<span className="text-muted-foreground text-[0.65rem] tabular-nums">
									{count}
								</span>
							</button>
						);
					})}
				</nav>
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex h-12 shrink-0 items-center gap-1.5 px-3">
						<Button
							size="sm"
							className="bg-accent hover:bg-accent/70 text-foreground h-8 shrink-0 gap-1.5 rounded-md px-2.5 text-xs font-medium"
							onClick={openFilePicker}
							disabled={isProcessing}
							data-jeo="media-import"
							title="Bring videos, pictures or sounds into this project"
						>
							<span className="bg-primary text-primary-foreground flex size-4 items-center justify-center rounded-full text-[0.8rem] leading-none">
								+
							</span>
							{isProcessing ? "Importing…" : "Import"}
						</Button>
						<VoiceRecordButton />
						<input
							aria-label="Search media"
							value={query}
							onChange={(event) => setQuery(event.currentTarget.value)}
							onKeyDown={(event) => event.stopPropagation()}
							placeholder="Search media"
							className="border-input bg-accent/60 placeholder:text-muted-foreground h-8 min-w-0 flex-1 rounded-md border px-2.5 text-xs outline-none focus:border-primary"
						/>
						<MediaActions
							mediaViewMode={mediaViewMode}
							setMediaViewMode={setMediaViewMode}
							isProcessing={isProcessing}
							sortBy={mediaSortBy}
							sortOrder={mediaSortOrder}
							onSort={handleSort}
						/>
					</div>
					<div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-3 pb-3">
						{isDragOver || allMedia.length === 0 ? (
							<MediaDragOverlay
								isVisible={true}
								isProcessing={isProcessing}
								progress={progress}
								onClick={openFilePicker}
							/>
						) : (
							<>
								<p className="text-muted-foreground mb-2 text-xs">
									{MEDIA_FILTERS.find((option) => option.id === mediaFilter)?.label}
									{query.trim() ? ` matching "${query.trim()}"` : ""}
								</p>
								{filteredMediaItems.length === 0 ? (
									<p className="text-muted-foreground py-6 text-center text-sm">
										Nothing here.
										{query.trim() ? " Try a different search." : ""}
									</p>
								) : (
									<SelectableSurface
										ariaLabel="Assets"
										orderedIds={orderedMediaIds}
										revealId={highlightMediaId}
										onRevealComplete={clearHighlight}
									>
										<MediaScopeRegistrar />
										<MediaItemList
											items={filteredMediaItems}
											mode={mediaViewMode}
											onRemove={handleRemove}
											usedIds={usedIds}
										/>
									</SelectableSurface>
								)}
							</>
						)}
					</div>
				</div>
			</div>
		</>
	);
}

function MediaScopeRegistrar() {
	useSelectionScope();
	return null;
}

function MediaAssetDraggable({
	item,
	preview,
	variant,
	isRounded,
}: {
	item: MediaAsset;
	preview: React.ReactNode;
	variant: "card" | "compact";
	isRounded?: boolean;
}) {
	const editor = useEditor();

	const addElementAtTime = ({
		asset,
		startTime,
	}: {
		asset: MediaAsset;
		startTime: MediaTime;
	}) => {
		const duration =
			asset.duration != null
				? mediaTimeFromSeconds({ seconds: asset.duration })
				: DEFAULT_NEW_ELEMENT_DURATION;
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration,
			startTime,
		});
		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	return (
		<DraggableItem
			name={item.name}
			preview={preview}
			dragData={{
				id: item.id,
				type: "media",
				mediaType: item.type,
				name: item.name,
				...(item.type !== "audio" && {
					targetElementTypes: [...MASKABLE_ELEMENT_TYPES],
				}),
			}}
			shouldShowPlusOnDrag={false}
			onAddToTimeline={({ currentTime }) =>
				addElementAtTime({ asset: item, startTime: currentTime })
			}
			variant={variant}
			isRounded={isRounded}
		/>
	);
}

function MediaItemWithContextMenu({
	item,
	children,
	onRemove,
}: {
	item: MediaAsset;
	children: React.ReactNode;
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
}) {
	const { isSelected, selectedIds } = useSelection();
	const idsToDelete = isSelected(item.id) ? selectedIds : [item.id];
	const deleteLabel =
		idsToDelete.length > 1 ? `Delete ${idsToDelete.length} items` : "Delete";

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem>Export clips</ContextMenuItem>
				<ContextMenuItem
					variant="destructive"
					onClick={(event: React.MouseEvent<HTMLDivElement>) =>
						onRemove({ event, ids: idsToDelete })
					}
				>
					{deleteLabel}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function MediaItemList({
	items,
	mode,
	onRemove,
	usedIds,
}: {
	items: MediaAsset[];
	mode: MediaViewMode;
	usedIds: Set<string>;
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
}) {
	const isGrid = mode === "grid";

	return (
		<div
			className={cn(isGrid ? "grid gap-x-2.5 gap-y-3" : "flex flex-col gap-1.5")}
			style={
				isGrid
					? { gridTemplateColumns: "repeat(auto-fill, minmax(6.8rem, 1fr))" }
					: undefined
			}
		>
			{items.map((item) => (
				<MediaItemWithContextMenu item={item} onRemove={onRemove} key={item.id}>
					<SelectableItem className={cn(!isGrid && "w-full")} id={item.id}>
						<MediaAssetDraggable
							item={item}
							preview={
								<MediaPreview
									item={item}
									variant={isGrid ? "grid" : "compact"}
									isUsed={usedIds.has(item.id)}
								/>
							}
							variant={isGrid ? "card" : "compact"}
							isRounded={isGrid ? true : undefined}
							containerClassName={isGrid ? "w-full" : undefined}
							aspectRatio={16 / 10}
						/>
					</SelectableItem>
				</MediaItemWithContextMenu>
			))}
		</div>
	);
}

function formatDuration({ duration }: { duration: number }) {
	const min = Math.floor(duration / 60);
	const sec = Math.floor(duration % 60);
	return `${min}:${sec.toString().padStart(2, "0")}`;
}

function MediaDurationBadge({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<div className="absolute top-1 right-1 rounded bg-black/65 px-1 text-[0.65rem] leading-4 text-white tabular-nums">
			{formatDuration({ duration })}
		</div>
	);
}

/** JEO: shown on a file that is already somewhere on the timeline */
function AddedBadge() {
	return (
		<div className="absolute top-1 left-1 rounded bg-black/65 px-1 text-[0.65rem] leading-4 text-white">
			Added
		</div>
	);
}

function MediaDurationLabel({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<span className="text-xs opacity-70">{formatDuration({ duration })}</span>
	);
}

function MediaTypePlaceholder({
	icon,
	label,
	duration,
}: {
	icon: IconSvgElement;
	label: string;
	duration?: number;
	variant?: "muted" | "bordered";
}) {
	return (
		<div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-0.5 bg-black/35">
			<HugeiconsIcon icon={icon} className="size-6" />
			<span className="text-xs">{label}</span>
			<MediaDurationLabel duration={duration} />
		</div>
	);
}

function MediaPreview({
	item,
	variant = "grid",
	isUsed = false,
}: {
	item: MediaAsset;
	variant?: "grid" | "compact";
	isUsed?: boolean;
}) {
	const isGrid = variant === "grid";
	const picture =
		item.type === "image"
			? (item.url ?? "")
			: item.type === "video"
				? item.thumbnailUrl
				: undefined;

	// the whole picture on a dark tile, so an upright clip is not cropped
	if (picture) {
		return (
			<div className="relative size-full bg-black/45">
				<Image
					src={picture}
					alt={item.name}
					fill
					sizes="100vw"
					className={isGrid ? "object-contain" : "rounded object-cover"}
					loading="lazy"
					unoptimized
				/>
				{isGrid && isUsed ? <AddedBadge /> : null}
				{isGrid && item.type === "video" ? (
					<MediaDurationBadge duration={item.duration} />
				) : null}
			</div>
		);
	}

	return (
		<div className="relative size-full">
			<MediaTypePlaceholder
				icon={
					item.type === "audio"
						? MusicNote03Icon
						: item.type === "video"
							? Video01Icon
							: Image02Icon
				}
				label={
					item.type === "audio" ? "Sound" : item.type === "video" ? "Video" : "File"
				}
				duration={isGrid ? undefined : item.duration}
			/>
			{isGrid && isUsed ? <AddedBadge /> : null}
			{isGrid ? <MediaDurationBadge duration={item.duration} /> : null}
		</div>
	);
}
function MediaActions({
	mediaViewMode,
	setMediaViewMode,
	isProcessing,
	sortBy,
	sortOrder,
	onSort,
}: {
	mediaViewMode: MediaViewMode;
	setMediaViewMode: (mode: MediaViewMode) => void;
	isProcessing: boolean;
	sortBy: MediaSortKey;
	sortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
}) {
	return (
		<div className="flex shrink-0 gap-0.5">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							size="icon"
							variant="ghost"
							onClick={() =>
								setMediaViewMode(mediaViewMode === "grid" ? "list" : "grid")
							}
							disabled={isProcessing}
							className="items-center justify-center"
						>
							{mediaViewMode === "grid" ? (
								<HugeiconsIcon icon={LeftToRightListDashIcon} />
							) : (
								<HugeiconsIcon icon={GridViewIcon} />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							{mediaViewMode === "grid"
								? "Switch to list view"
								: "Switch to grid view"}
						</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<DropdownMenu>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									disabled={isProcessing}
									className="items-center justify-center"
								>
									<HugeiconsIcon icon={SortingOneNineIcon} />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<DropdownMenuContent align="end">
							<SortMenuItem
								label="Name"
								sortKey="name"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="Type"
								sortKey="type"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="Duration"
								sortKey="duration"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label="File size"
								sortKey="size"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
					<TooltipContent>
						<p>
							Sort by {sortBy} (
							{sortOrder === "asc" ? "ascending" : "descending"})
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>

		</div>
	);
}

function SortMenuItem({
	label,
	sortKey,
	currentSortBy,
	currentSortOrder,
	onSort,
}: {
	label: string;
	sortKey: MediaSortKey;
	currentSortBy: MediaSortKey;
	currentSortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
}) {
	const isActive = currentSortBy === sortKey;
	const arrow = isActive ? (currentSortOrder === "asc" ? "↑" : "↓") : "";

	return (
		<DropdownMenuItem onClick={() => onSort({ key: sortKey })}>
			{label} {arrow}
		</DropdownMenuItem>
	);
}
