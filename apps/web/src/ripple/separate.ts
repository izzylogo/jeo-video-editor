/**
 * JEO: texts must never melt into each other.
 *
 * After an edit, a text (or tag, sticker, effect) can end up on top of another
 * one on the same row, for example when the video row's magnet pulls later
 * texts earlier. Two clips on one spot of one row look like a single blob.
 *
 * This moves the one that just arrived to the row above: the nearest row of
 * the same kind with room for it, or a brand-new row if there is none.
 */
import type {
	OverlayTrack,
	SceneTracks,
	TimelineElement,
} from "@/timeline/types";
import { buildEmptyTrack } from "@/timeline/placement/track-factory";
import { generateUUID } from "@/utils/id";
import { TICKS_PER_SECOND } from "@/wasm";

const SLACK = Math.round(TICKS_PER_SECOND / 60); // half a frame

function overlaps(a: TimelineElement, b: TimelineElement): boolean {
	return (
		a.startTime < b.startTime + b.duration - SLACK &&
		b.startTime < a.startTime + a.duration - SLACK
	);
}

function hasRoom(track: OverlayTrack, element: TimelineElement): boolean {
	return !track.elements.some((other) => overlaps(other, element));
}

export function separateOverlaps({
	before,
	after,
}: {
	before: SceneTracks;
	after: SceneTracks;
}): SceneTracks {
	const was = new Map<string, TimelineElement>();
	for (const track of [...before.overlay, before.main, ...before.audio]) {
		for (const element of track.elements) was.set(element.id, element);
	}
	const changed = (element: TimelineElement) => {
		const old = was.get(element.id);
		return (
			!old ||
			old.startTime !== element.startTime ||
			old.duration !== element.duration
		);
	};

	let overlay: OverlayTrack[] = after.overlay;
	let touched = false;
	// one text is lifted per pass, until no two are on the same spot
	for (let pass = 0; pass < 300; pass++) {
		let moved = false;
		for (let index = 0; index < overlay.length && !moved; index++) {
			const track = overlay[index];
			const sorted = [...track.elements].sort(
				(a, b) => a.startTime - b.startTime,
			);
			for (let i = 0; i < sorted.length - 1 && !moved; i++) {
				const first = sorted[i];
				const second = sorted[i + 1];
				if (!overlaps(first, second)) continue;
				const firstChanged = changed(first);
				const secondChanged = changed(second);
				// two texts that were already like this before the edit are left
				// alone: nothing just "entered"
				if (!firstChanged && !secondChanged) continue;
				// the one that arrived goes up; if both moved, the later one
				const mover = secondChanged ? second : first;

				const without = {
					...track,
					elements: track.elements.filter((element) => element.id !== mover.id),
				} as OverlayTrack;
				// nearest row above of the same kind with room
				let target = -1;
				for (let above = index - 1; above >= 0; above--) {
					if (overlay[above].type === track.type && hasRoom(overlay[above], mover)) {
						target = above;
						break;
					}
				}
				const next = [...overlay];
				next[index] = without;
				if (target >= 0) {
					next[target] = {
						...overlay[target],
						elements: [...overlay[target].elements, mover],
					} as OverlayTrack;
				} else {
					const fresh = buildEmptyTrack({
						id: generateUUID(),
						type: track.type,
					}) as OverlayTrack;
					next.splice(index, 0, {
						...fresh,
						elements: [mover],
					} as OverlayTrack);
				}
				overlay = next;
				moved = true;
				touched = true;
			}
		}
		if (!moved) break;
	}
	return touched ? { ...after, overlay } : after;
}
