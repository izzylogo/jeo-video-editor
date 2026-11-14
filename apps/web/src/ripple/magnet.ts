/**
 * JEO: the row magnet.
 *
 * Each timeline row has its own magnet switch. When it is on and a clip on
 * that row gets shorter, longer, or is deleted, the clips after it on the same
 * row follow, so no hole and no overlap is left behind.
 *
 * The main video row also carries the texts, tags and sounds that start after
 * the change, so they stay over the same moment of the video.
 */
import type {
	SceneTracks,
	TimelineElement,
	TimelineTrack,
} from "@/timeline/types";
import { TICKS_PER_SECOND } from "@/wasm";
import { useTimelineStore } from "@/timeline/timeline-store";

/** Is the magnet on for this row? The main video row starts switched on. */
export function isTrackMagnetOn({
	trackId,
	mainTrackId,
}: {
	trackId: string;
	mainTrackId: string | null;
}): boolean {
	const saved = useTimelineStore.getState().magnetTracks[trackId];
	return saved ?? trackId === mainTrackId;
}

interface Shift {
	/** everything that starts at or after this time moves… */
	afterTime: number;
	/** …this much earlier (negative = later) */
	amount: number;
}

interface Interval {
	start: number;
	end: number;
}

function subtract(source: Interval[], holes: Interval[]): Interval[] {
	let left = source;
	for (const hole of holes) {
		left = left.flatMap((piece) => {
			if (hole.end <= piece.start || hole.start >= piece.end) return [piece];
			const parts: Interval[] = [];
			if (hole.start > piece.start) parts.push({ start: piece.start, end: hole.start });
			if (hole.end < piece.end) parts.push({ start: hole.end, end: piece.end });
			return parts;
		});
	}
	return left;
}

function shiftsForTrack({
	before,
	after,
	idsAfter,
}: {
	before: TimelineElement[];
	after: TimelineElement[];
	idsAfter: Set<string>;
}): Shift[] {
	const slack = Math.round(TICKS_PER_SECOND / 60); // half a frame
	const beforeById = new Map(before.map((element) => [element.id, element]));
	const afterById = new Map(after.map((element) => [element.id, element]));
	const shifts: Shift[] = [];
	const freed: Interval[] = [];

	for (const was of before) {
		const now = afterById.get(was.id);
		const wasEnd = was.startTime + was.duration;
		if (!now) {
			// deleted (not just moved to another row): its space closes up
			if (!idsAfter.has(was.id)) freed.push({ start: was.startTime, end: wasEnd });
			continue;
		}
		if (now.duration === was.duration) continue; // only moved: leave it alone
		const nowEnd = now.startTime + now.duration;
		const sameStart = Math.abs(now.startTime - was.startTime) <= slack;
		const sameEnd = Math.abs(nowEnd - wasEnd) <= slack;
		if (sameStart && nowEnd < wasEnd) {
			freed.push({ start: nowEnd, end: wasEnd }); // right edge pulled in
		} else if (sameStart && nowEnd > wasEnd) {
			// right edge pulled out: push the rest later, but only if something
			// is really in the way (some actions already make the room themselves)
			const blocked = after.some(
				(other) =>
					other.id !== was.id &&
					other.startTime >= wasEnd - slack &&
					other.startTime < nowEnd - slack,
			);
			if (blocked) shifts.push({ afterTime: wasEnd - slack, amount: wasEnd - nowEnd });
		} else if (sameEnd && !sameStart) {
			// left edge moved: the clip goes back to where it started and the
			// rest follows
			shifts.push({ afterTime: now.startTime, amount: now.startTime - was.startTime });
		}
	}

	// new pieces (a split makes one) fill space; that space is not a hole
	const joined = after
		.filter((element) => !beforeById.has(element.id))
		.map((element) => ({ start: element.startTime, end: element.startTime + element.duration }));
	for (const hole of subtract(freed, joined)) {
		if (hole.end - hole.start > 0) {
			shifts.push({ afterTime: hole.end, amount: hole.end - hole.start });
		}
	}
	return shifts;
}

function applyShifts<TTrack extends TimelineTrack>(
	track: TTrack,
	shifts: Shift[],
): TTrack {
	if (shifts.length === 0) return track;
	// latest change first, so an earlier shift does not move a later mark
	const ordered = [...shifts].sort((a, b) => b.afterTime - a.afterTime);
	let touched = false;
	const elements = track.elements.map((element) => {
		let start = element.startTime as number;
		for (const shift of ordered) {
			if (start >= shift.afterTime) start -= shift.amount;
		}
		start = Math.max(0, start);
		if (start === element.startTime) return element;
		touched = true;
		return { ...element, startTime: start } as TimelineElement;
	});
	return touched ? ({ ...track, elements } as TTrack) : track;
}

/** Returns `after` with the magnet rows tidied (or `after` itself if nothing moves). */
export function applyMagnet({
	before,
	after,
}: {
	before: SceneTracks;
	after: SceneTracks;
}): SceneTracks {
	const mainId = after.main.id;
	const beforeTracks = [...before.overlay, before.main, ...before.audio];
	const afterTracks = [...after.overlay, after.main, ...after.audio];
	const idsAfter = new Set(
		afterTracks.flatMap((track) => track.elements.map((element) => element.id)),
	);
	const beforeById = new Map(beforeTracks.map((track) => [track.id, track]));

	const shiftsByTrack = new Map<string, Shift[]>();
	for (const track of afterTracks) {
		const was = beforeById.get(track.id);
		if (!was || was.elements === track.elements) continue;
		if (!isTrackMagnetOn({ trackId: track.id, mainTrackId: mainId })) continue;
		const shifts = shiftsForTrack({
			before: was.elements,
			after: track.elements,
			idsAfter,
		});
		if (shifts.length > 0) shiftsByTrack.set(track.id, shifts);
	}
	if (shiftsByTrack.size === 0) return after;

	const mainShifts = shiftsByTrack.get(mainId) ?? [];
	const tidy = <TTrack extends TimelineTrack>(track: TTrack): TTrack =>
		applyShifts(
			track,
			track.id === mainId
				? mainShifts
				: [...(shiftsByTrack.get(track.id) ?? []), ...mainShifts],
		);
	return {
		overlay: after.overlay.map((track) => tidy(track)),
		main: tidy(after.main),
		audio: after.audio.map((track) => tidy(track)),
	};
}
