import { BASE_TIMELINE_PIXELS_PER_SECOND } from "@/timeline/scale";
import { TICKS_PER_SECOND } from "@/wasm";

// JEO: a little wider than OpenCut's 10 px, so items catch a nearby side easily
const DEFAULT_TIMELINE_SNAP_THRESHOLD_PX = 14;

export function getTimelineSnapThresholdInTicks({
	zoomLevel,
	snapThresholdPx = DEFAULT_TIMELINE_SNAP_THRESHOLD_PX,
}: {
	zoomLevel: number;
	snapThresholdPx?: number;
}): number {
	const pixelsPerSecond = BASE_TIMELINE_PIXELS_PER_SECOND * zoomLevel;
	return (snapThresholdPx / pixelsPerSecond) * TICKS_PER_SECOND;
}
