/** JEO: the size the preview opens at (real video size, in %) */
export const PREVIEW_DEFAULT_PERCENT = 50;

export const PREVIEW_ZOOM_PRESETS = [25, 50, 75, 100, 150, 200];

export const PREVIEW_ZOOM = {
	min: 0.25,
	max: 16,
	step: 1.25,
} as const;
