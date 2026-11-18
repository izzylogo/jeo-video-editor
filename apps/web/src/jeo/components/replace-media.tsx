"use client";

/**
 * JEO: "Replace media" (right-click a clip). Pick another video or picture
 * from the project, or import a new file; the clip keeps its place, length,
 * framing, masks, keyframes and effects.
 */
import { useRef } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { importFile, replaceClipMedia } from "../actions";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/utils/ui";

interface ReplaceMediaStore {
	target: { trackId: string; elementId: string } | null;
	open: (target: { trackId: string; elementId: string }) => void;
	close: () => void;
}

export const useReplaceMedia = create<ReplaceMediaStore>((set) => ({
	target: null,
	open: (target) => set({ target }),
	close: () => set({ target: null }),
}));

function seconds(value?: number): string {
	if (!value) return "";
	const whole = Math.floor(value);
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function ReplaceMediaDialog() {
	const target = useReplaceMedia((state) => state.target);
	const close = useReplaceMedia((state) => state.close);
	const assets = useEditor((e) => e.media.getAssets());
	const element = useEditor((e) => {
		if (!target) return null;
		const tracks = e.scenes.getActiveSceneOrNull()?.tracks;
		if (!tracks) return null;
		return (
			[...tracks.overlay, tracks.main]
				.find((track) => track.id === target.trackId)
				?.elements.find((item) => item.id === target.elementId) ?? null
		);
	});
	const fileRef = useRef<HTMLInputElement>(null);
	const choices = assets.filter((asset) => asset.type === "video" || asset.type === "image");
	const currentId = element && "mediaId" in element ? element.mediaId : null;
	const needs = element ? element.duration / 120000 : 0;

	const pick = (mediaId: string) => {
		if (!target) return;
		const outcome = replaceClipMedia({ ...target, mediaId });
		if (outcome.ok) toast.success(outcome.message ?? "Replaced.");
		else toast.error(outcome.message);
		close();
	};

	return (
		<Dialog open={Boolean(target)} onOpenChange={(open) => (open ? null : close())}>
			<DialogContent className="max-w-xl" data-jeo="replace-media">
				<DialogHeader>
					<DialogTitle>Replace media</DialogTitle>
					<DialogDescription>
						The clip keeps its place, its {needs.toFixed(2)} s length, framing, masks, keyframes and effects.
					</DialogDescription>
				</DialogHeader>
				<div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
					<button
						type="button"
						onClick={() => fileRef.current?.click()}
						className="border-primary/60 text-primary hover:bg-primary/10 flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs"
					>
						<span className="text-2xl leading-none">+</span>
						Import a new file
					</button>
					{choices.map((asset) => {
						const tooShort = asset.type === "video" && (asset.duration ?? 0) < needs - 0.01;
						return (
							<button
								key={asset.id}
								type="button"
								data-jeo-replace-choice={asset.name}
								disabled={asset.id === currentId}
								onClick={() => pick(asset.id)}
								title={tooShort ? "Shorter than the clip: the clip will get shorter" : asset.name}
								className={cn(
									"group bg-accent relative flex aspect-[3/4] cursor-pointer flex-col overflow-hidden rounded-md border-2 text-left transition-colors",
									asset.id === currentId ? "border-primary cursor-default" : "hover:border-foreground/30 border-transparent",
								)}
							>
								{asset.thumbnailUrl || (asset.type === "image" && asset.url) ? (
									<img
										src={asset.thumbnailUrl ?? asset.url}
										alt=""
										className="min-h-0 w-full flex-1 bg-black object-contain"
									/>
								) : (
									<span className="text-muted-foreground flex flex-1 items-center justify-center text-xs">{asset.type}</span>
								)}
								<span className="truncate px-1.5 py-1 text-[0.68rem]">{asset.name}</span>
								{asset.type === "video" && (
									<span className={cn("absolute top-1 right-1 rounded bg-black/70 px-1 text-[0.62rem] tabular-nums", tooShort && "text-amber-300")}>
										{seconds(asset.duration)}
									</span>
								)}
								{asset.id === currentId && (
									<span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1 text-[0.62rem]">Now</span>
								)}
							</button>
						);
					})}
				</div>
				<input
					ref={fileRef}
					type="file"
					accept="image/*,video/*"
					className="hidden"
					onChange={async (event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						if (!file) return;
						const asset = await importFile({ file });
						if (!asset) {
							toast.error("Could not read that file.");
							return;
						}
						pick(asset.id);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
