"use client";

/**
 * Hover preview (CapCut calls it the "preview axis"): move the mouse over the
 * timeline without clicking and the preview shows that moment, with a faint
 * top-to-bottom line under the mouse. The real playhead does not move, and
 * leaving the timeline goes back to it.
 */
import { useEffect, useRef } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEditor } from "@/editor/use-editor";
import { getTimelinePixelsPerSecond } from "@/timeline";
import { type MediaTime, TICKS_PER_SECOND } from "@/wasm";

export const useHoverPreview = create<{
	isOn: boolean;
	toggle: () => void;
}>()(
	persist(
		(set) => ({
			isOn: true,
			toggle: () => set((state) => ({ isOn: !state.isOn })),
		}),
		{ name: "jeo-hover-preview" },
	),
);

export function HoverScrub({
	zoomLevel,
	tracksScrollRef,
}: {
	zoomLevel: number;
	tracksScrollRef: React.RefObject<HTMLDivElement | null>;
}) {
	const editor = useEditor();
	const isOn = useHoverPreview((state) => state.isOn);
	const lineRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const line = lineRef.current;
		const surface = line?.parentElement;
		if (!line || !surface) return;

		const hide = () => {
			line.style.display = "none";
			editor.playback.setHoverTime({ time: null });
		};
		if (!isOn) {
			hide();
			return;
		}

		const onMove = (event: MouseEvent) => {
			// not while dragging something, and not while the video is playing
			if (event.buttons !== 0 || editor.playback.getIsPlaying()) {
				hide();
				return;
			}
			const rect = surface.getBoundingClientRect();
			const x = event.clientX - rect.left;
			const scrollLeft = tracksScrollRef.current?.scrollLeft ?? 0;
			const seconds =
				(x + scrollLeft) / getTimelinePixelsPerSecond({ zoomLevel });
			const total = editor.timeline.getTotalDuration();
			if (seconds < 0 || total <= 0) {
				hide();
				return;
			}
			const time = Math.min(
				Math.round(seconds * TICKS_PER_SECOND),
				editor.timeline.getLastFrameTime(),
			) as MediaTime;
			line.style.display = "block";
			line.style.transform = `translateX(${Math.round(x)}px)`;
			editor.playback.setHoverTime({ time });
		};

		surface.addEventListener("mousemove", onMove);
		surface.addEventListener("mouseleave", hide);
		surface.addEventListener("mousedown", hide);
		return () => {
			surface.removeEventListener("mousemove", onMove);
			surface.removeEventListener("mouseleave", hide);
			surface.removeEventListener("mousedown", hide);
			hide();
		};
	}, [editor, isOn, tracksScrollRef, zoomLevel]);

	return (
		<div
			ref={lineRef}
			data-jeo="hover-line"
			aria-hidden="true"
			className="pointer-events-none absolute top-0 bottom-0 left-0 z-40 hidden w-px bg-white/45"
		/>
	);
}
