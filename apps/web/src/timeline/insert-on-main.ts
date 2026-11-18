/**
 * JEO: CapCut-style inserting on the main video row.
 *
 * Dropping media, or dragging a clip, onto the main row puts it at the nearest
 * cut and pushes everything after it along, instead of laying it on top of the
 * next clip. With the main row's magnet on, the texts, tags and sounds after
 * the cut move with the clips (the same rule as the row magnet).
 */
import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline";
import { isTrackMagnetOn } from "@/ripple";
import { type MediaTime } from "@/wasm";

/** The cut (clip start or end) nearest to `time`, ignoring `exclude`. */
export function nearestCut({
	main,
	time,
	exclude,
}: {
	main: TimelineElement[];
	time: number;
	exclude?: string;
}): number {
	const clips = main.filter((element) => element.id !== exclude);
	if (clips.length === 0) return 0;
	const cuts = new Set<number>([0]);
	for (const clip of clips) {
		cuts.add(clip.startTime);
		cuts.add(clip.startTime + clip.duration);
	}
	let best = 0;
	for (const cut of cuts) {
		if (Math.abs(cut - time) < Math.abs(best - time)) best = cut;
	}
	return best;
}

function shiftFrom<TTrack extends TimelineTrack>(
	track: TTrack,
	from: number,
	by: number,
	skip?: string,
): TTrack {
	if (!track.elements.some((element) => element.startTime >= from && element.id !== skip)) return track;
	return {
		...track,
		elements: track.elements.map((element) =>
			element.startTime >= from && element.id !== skip
				? ({ ...element, startTime: Math.max(0, element.startTime + by) as MediaTime } as TimelineElement)
				: element,
		),
	} as TTrack;
}

function shiftAll(tracks: SceneTracks, from: number, by: number, skip?: string): SceneTracks {
	const carry = isTrackMagnetOn({ trackId: tracks.main.id, mainTrackId: tracks.main.id });
	return {
		main: shiftFrom(tracks.main, from, by, skip),
		overlay: carry ? tracks.overlay.map((track) => shiftFrom(track, from, by, skip)) : tracks.overlay,
		audio: carry ? tracks.audio.map((track) => shiftFrom(track, from, by, skip)) : tracks.audio,
	};
}

/** New media dropped on the main row: slot it in at the nearest cut. */
export function insertOnMain({
	tracks,
	element,
	dropTime,
}: {
	tracks: SceneTracks;
	element: TimelineElement;
	dropTime: number;
}): SceneTracks {
	const at = nearestCut({ main: tracks.main.elements, time: dropTime });
	const shifted = shiftAll(tracks, at, element.duration);
	return {
		...shifted,
		main: {
			...shifted.main,
			elements: [...shifted.main.elements, { ...element, startTime: at as MediaTime }].sort(
				(a, b) => a.startTime - b.startTime,
			) as typeof shifted.main.elements,
		},
	};
}

/** A main-row clip dragged to a new place: close its old gap, slot it in. */
export function moveOnMain({
	tracks,
	elementId,
	dropTime,
}: {
	tracks: SceneTracks;
	elementId: string;
	dropTime: number;
}): SceneTracks | null {
	const clip = tracks.main.elements.find((element) => element.id === elementId);
	if (!clip) return null;
	// 1. take it out and close the hole it leaves
	const without: SceneTracks = {
		...tracks,
		main: { ...tracks.main, elements: tracks.main.elements.filter((element) => element.id !== elementId) },
	};
	const closed = shiftAll(without, clip.startTime + clip.duration, -clip.duration);
	// the drop time was measured with the clip still in place
	const adjusted = dropTime > clip.startTime + clip.duration ? dropTime - clip.duration : dropTime;
	// 2. put it back at the nearest cut and push the rest along
	return insertOnMain({ tracks: closed, element: clip, dropTime: adjusted });
}
