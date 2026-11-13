export const PANEL_CONFIG = {
	panels: {
		tools: 26,
		preview: 44,
		properties: 30,
		mainContent: 56,
		timeline: 44,
	},
} as const;

/** JEO: ready-made ways to arrange the editor. `order` is left to right. */
export type TopPanelId = "tools" | "properties" | "preview";

export interface LayoutPreset {
	id: string;
	name: string;
	hint: string;
	order: readonly TopPanelId[];
	/**
	 * "rows": three panels on top, the timeline across the bottom.
	 * "tall-preview": the preview is a full-height column on the right, with
	 * the other two panels and the timeline stacked to its left (CapCut's
	 * layout for upright videos). `order` then lists the two left panels.
	 */
	shape?: "rows" | "tall-preview";
	sizes: {
		tools: number;
		preview: number;
		properties: number;
		mainContent: number;
		timeline: number;
	};
}

export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
	{
		id: "jeo",
		name: "JEO",
		hint: "Options · settings · preview",
		order: ["tools", "properties", "preview"],
		sizes: { ...PANEL_CONFIG.panels },
	},
	{
		id: "capcut",
		name: "CapCut style",
		hint: "Options · preview · settings",
		order: ["tools", "preview", "properties"],
		sizes: { tools: 26, preview: 46, properties: 28, mainContent: 58, timeline: 42 },
	},
	{
		id: "capcut-tall",
		name: "CapCut tall preview",
		hint: "Preview down the whole right side",
		shape: "tall-preview",
		order: ["tools", "properties"],
		sizes: { tools: 51, preview: 39, properties: 49, mainContent: 47, timeline: 53 },
	},
	{
		id: "big-preview",
		name: "Big preview",
		hint: "The video takes most of the space",
		order: ["tools", "preview", "properties"],
		sizes: { tools: 18, preview: 62, properties: 20, mainContent: 70, timeline: 30 },
	},
	{
		id: "tall-timeline",
		name: "Tall timeline",
		hint: "More room for clips and texts",
		order: ["tools", "preview", "properties"],
		sizes: { tools: 24, preview: 48, properties: 28, mainContent: 42, timeline: 58 },
	},
	{
		id: "preview-left",
		name: "Preview on the left",
		hint: "Preview · options · settings",
		order: ["preview", "tools", "properties"],
		sizes: { tools: 28, preview: 42, properties: 30, mainContent: 56, timeline: 44 },
	},
	{
		id: "ai-wide",
		name: "Wide AI chat",
		hint: "A wide left panel for talking to Claude",
		order: ["tools", "preview", "properties"],
		sizes: { tools: 38, preview: 40, properties: 22, mainContent: 62, timeline: 38 },
	},
];

export function getLayoutPreset(id: string | undefined): LayoutPreset {
	return LAYOUT_PRESETS.find((preset) => preset.id === id) ?? LAYOUT_PRESETS[0];
}
