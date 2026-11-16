/**
 * "Options for this part": other wordings Claude offers for one text, kept
 * per text so they are one click away in the text's menu and settings.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TextOptionsStore {
	/** element id → offered wordings */
	options: Record<string, string[]>;
	/** element id → wordings from earlier asks, newest first (shown in a dropdown) */
	earlier: Record<string, string[]>;
	/** element ids Claude is currently being asked about */
	asking: Record<string, boolean>;
	setOptions: (args: {
		elementId: string;
		options: string[];
		earlier?: string[];
	}) => void;
	setAsking: (args: { elementId: string; isAsking: boolean }) => void;
}

export const useTextOptions = create<TextOptionsStore>()(
	persist(
		(set) => ({
			options: {},
			earlier: {},
			asking: {},
			setOptions: ({ elementId, options, earlier }) =>
				set((state) => ({
					options: { ...state.options, [elementId]: options.slice(0, 8) },
					earlier: earlier
						? { ...state.earlier, [elementId]: earlier }
						: state.earlier,
					asking: { ...state.asking, [elementId]: false },
				})),
			setAsking: ({ elementId, isAsking }) =>
				set((state) => ({
					asking: { ...state.asking, [elementId]: isAsking },
				})),
		}),
		{
			name: "jeo-text-options",
			partialize: (state) => ({
				options: state.options,
				earlier: state.earlier,
			}),
		},
	),
);

/** The options are also kept on the text itself, so they travel with the project. */
export const OPTIONS_PARAM = "jeo.options";

/** Options from earlier asks, kept so nothing Claude offered is lost. */
export const EARLIER_PARAM = "jeo.optionsEarlier";
const EARLIER_LIMIT = 40;

/**
 * New options replace the visible ones; the ones that were visible move to
 * the front of the "earlier" list. Nothing is listed twice.
 */
export function mergeEarlier({
	previous,
	earlier,
	next,
}: {
	previous: string[];
	earlier: string[];
	next: string[];
}): string[] {
	const fresh = new Set(next);
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const option of [...previous, ...earlier]) {
		if (fresh.has(option) || seen.has(option)) continue;
		seen.add(option);
		merged.push(option);
	}
	return merged.slice(0, EARLIER_LIMIT);
}

export function earlierOnElement(element: { params?: Record<string, unknown> }): string[] {
	return readList(element.params?.[EARLIER_PARAM]);
}

export function optionsOnElement(element: { params?: Record<string, unknown> }): string[] {
	return readList(element.params?.[OPTIONS_PARAM]);
}

function readList(raw: unknown): string[] {
	if (typeof raw !== "string" || raw === "") return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
	} catch {
		return [];
	}
}
