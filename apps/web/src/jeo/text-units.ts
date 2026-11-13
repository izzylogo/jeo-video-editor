/**
 * JEO text numbers, shown the way CapCut shows them.
 *
 * Your standard text is CapCut "font size 12, scale 120%". Inside the editor
 * that is stored as fontSize 5.478 at scale 1 (pop-up and other animations
 * count from scale 1). The panels multiply for display only:
 *   shown font size = fontSize × FONT_SIZE_DISPLAY   (5.478 → 12)
 *   shown scale     = scale × TEXT_SCALE_DISPLAY     (1 → 120%)
 */
export const STANDARD_TEXT_FONT_SIZE = 5.478;
export const FONT_SIZE_DISPLAY = 12 / STANDARD_TEXT_FONT_SIZE;
export const TEXT_SCALE_DISPLAY = 120;
/** older projects used 4.2 as the standard size */
export const OLD_STANDARD_TEXT_FONT_SIZE = 4.2;
export const SIZE_UP = STANDARD_TEXT_FONT_SIZE / OLD_STANDARD_TEXT_FONT_SIZE;
