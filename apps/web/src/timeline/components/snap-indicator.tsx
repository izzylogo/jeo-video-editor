"use client";

import { useSnapIndicatorPosition } from "@/timeline/hooks/use-snap-indicator-position";
import type { SnapPoint } from "@/timeline/snapping";
import {
	getCenteredLineLeft,
	TIMELINE_INDICATOR_LINE_WIDTH_PX,
} from "@/timeline";
import { TIMELINE_LAYERS } from "./layers";
import { useLayoutEffect, useRef, useState } from "react";
import { EditorCore } from "@/core";
interface SnapIndicatorProps {
	snapPoint: SnapPoint | null;
	zoomLevel: number;
	isVisible: boolean;
	timelineRef: React.RefObject<HTMLDivElement | null>;
	tracksScrollRef: React.RefObject<HTMLDivElement | null>;
}

export function SnapIndicator({
	snapPoint,
	zoomLevel,
	isVisible,
	timelineRef,
	tracksScrollRef,
}: SnapIndicatorProps) {
	const { leftPosition, topPosition, height } = useSnapIndicatorPosition({
		snapPoint,
		zoomLevel,
		timelineRef,
		tracksScrollRef,
	});

	// JEO: like CapCut, the line only joins the clip being dragged and the
	// clip whose side it sticks to (full height for the playhead)
	const lineRef = useRef<HTMLDivElement>(null);
	const [span, setSpan] = useState<{ top: number; height: number } | null>(null);
	const targetId = snapPoint && "elementId" in snapPoint ? (snapPoint as { elementId?: string }).elementId : undefined;
	useLayoutEffect(() => {
		const line = lineRef.current;
		const parent = line?.offsetParent as HTMLElement | null;
		if (!isVisible || !targetId || !parent) {
			if (span) setSpan(null);
			return;
		}
		const dragged = [...document.querySelectorAll("[data-jeo-dragging]")].map((node) =>
			node.getBoundingClientRect(),
		);
		// several clips can share the same cut: join the one nearest the
		// dragged item (and on screen)
		const draggedIds = new Set(
			[...document.querySelectorAll("[data-jeo-dragging]")].map((node) => node.getAttribute("data-element-id")),
		);
		const scroller = parent.getBoundingClientRect();
		const time = snapPoint?.time ?? 0;
		const sameCut = EditorCore.getInstance()
			.scenes.getActiveSceneOrNull()
			?.tracks;
		const candidates = sameCut
			? [...sameCut.overlay, sameCut.main, ...sameCut.audio]
					.flatMap((track) => track.elements as Array<{ id: string; startTime: number; duration: number }>)
					.filter(
						(element) =>
							!draggedIds.has(element.id) &&
							(element.startTime === time || element.startTime + element.duration === time),
					)
					.map((element) => document.querySelector(`[data-element-id="${element.id}"]`)?.getBoundingClientRect())
					.filter((box): box is DOMRect => Boolean(box) && box!.bottom > scroller.top && box!.top < scroller.bottom)
			: [];
		const middle = dragged.length > 0 ? (dragged[0].top + dragged[0].bottom) / 2 : 0;
		const nearest = candidates.sort(
			(a, b) => Math.abs((a.top + a.bottom) / 2 - middle) - Math.abs((b.top + b.bottom) / 2 - middle),
		)[0];
		const boxes = nearest ? [nearest, ...dragged] : [];
		if (boxes.length < 2) {
			if (span) setSpan(null);
			return;
		}
		const origin = parent.getBoundingClientRect();
		const top = Math.min(...boxes.map((box) => box.top)) - origin.top - 4;
		const bottom = Math.max(...boxes.map((box) => box.bottom)) - origin.top + 4;
		if (!span || Math.abs(span.top - top) > 0.5 || Math.abs(span.height - (bottom - top)) > 0.5) {
			setSpan({ top, height: bottom - top });
		}
	});

	if (!isVisible || !snapPoint) {
		return null;
	}

	return (
		<div
			ref={lineRef}
			className="pointer-events-none absolute"
			style={{
				left: `${getCenteredLineLeft({ centerPixel: leftPosition })}px`,
				top: span ? span.top : topPosition,
				height: `${span ? span.height : height}px`,
				width: `${TIMELINE_INDICATOR_LINE_WIDTH_PX}px`,
				zIndex: TIMELINE_LAYERS.snapIndicator,
			}}
		>
			{/* JEO: a clear line, like CapCut's, so you see what it sticks to */}
			<div
				data-jeo="snap-line"
				className="bg-primary h-full w-0.5 shadow-[0_0_6px_var(--primary)]"
			/>
		</div>
	);
}
