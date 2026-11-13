/**
 * "Options for this part": other wordings Claude offers for one text, kept
 * per text so they are one click away in the text's menu and settings.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TextOptionsStore {
	/** element id → offered wordings */
	options: Record<string, string[]>;
	/** element ids Claude is currently being asked about */
	asking: Record<string, boolean>;
	setOptions: (args: { elementId: string; options: string[] }) => void;
	setAsking: (args: { elementId: string; isAsking: boolean }) => void;
}

export const useTextOptions = create<TextOptionsStore>()(
	persist(
		(set) => ({
			options: {},
			asking: {},
			setOptions: ({ elementId, options }) =>
				set((state) => ({
					options: { ...state.options, [elementId]: options.slice(0, 8) },
					asking: { ...state.asking, [elementId]: false },
				})),
			setAsking: ({ elementId, isAsking }) =>
				set((state) => ({
					asking: { ...state.asking, [elementId]: isAsking },
				})),
		}),
		{
			name: "jeo-text-options",
			partialize: (state) => ({ options: state.options }),
		},
	),
);
