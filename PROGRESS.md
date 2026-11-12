# JEO Editor: progress

Written in simple words. Updated after every working step.

## Where we are
- **Phase 0 (test OpenCut Classic on this laptop): done.**
- **Phase 1 (make it mine): built and tested, waiting for your OK.**

## How to start the editor
Double-click **JEO Editor** on your Desktop (there is a copy of the shortcut in
`C:\Users\Admin\Documents\JEO Video Editor\`). The first start takes about 15 seconds.

## Phase 1: what was done (12 Nov 2026)

| Item | Result |
|---|---|
| Website pages, login, database, analytics | Removed. The app opens straight into your last project (or a new one). |
| Desktop app | Works. Electron window with its own icon and a Desktop shortcut. |
| Defaults | New projects are 1080×1440, 30 fps. They no longer copy the first clip's size or frame rate. |
| Clip framing | A clip put on the main track is zoomed to fill the frame automatically (1.333× for a 9:16 clip). |
| Default text | LEMON MILK Bold, white, black outline, centred, size 4.2 (about 67 px on 1080 wide). |
| Text outline | New settings: Outline on/off, Outline Color, Outline Thickness (in % of the text size, default 14). |
| LEMON MILK | In the font list, and shipped inside the app so it works even if the font is not installed. |
| Name, logo, colours | "JEO Editor", own logo (▼ tag above a caption bar), dark theme, violet accent. |
| Accent colour picker | The round colour dot at the top right: 8 presets or any colour. Your choice is remembered. |
| Layout | Top toolbar: AI · Media · Audio · Captions · Tags · Freeze · Effects · Endings · Stickers · Subtitles · Settings. Below: options (left), properties (middle), phone preview (right), timeline (bottom). |
| Save / open projects | Every project is also saved as a real folder: `JEO Video Editor\projects\<name> [id]\` with `project.json` and a `media` folder holding the clips. If the app's own storage is ever lost, projects come back from these folders. Menu (logo, top left) → "Show project folder". |
| Export | Saves straight into `JEO Video Editor\output\` and never overwrites (adds `_v2`, `_v3`…). A message shows the file name. |

### Tests run in the desktop app
- Import clip → timeline → add default caption: correct defaults, screenshot in `output\phase1-proof\`.
- Close and reopen: project and clip are still there.
- Brand-new app profile: the project was restored from its folder on disk.
- Playback: about 58 screen frames per second, real time (Phase 0 developer mode: about 20).
- Export 32 s, 1080×1440, 30 fps: about 28 seconds, with picture and sound.

## Known problems / gaps
- **Tags, Freeze and Endings** buttons only show a "Coming in Phase 2" note. The **AI** button only shows a note (Phase 3).
- **Audio** category still tries to search an online sound library that was removed. Phase 2 replaces it with your own `assets\music` and `assets\sound-effects`.
- **Captions** category shows only one preset ("Default text"). Phase 2 adds your presets.
- Clips are stored three times (your original, the app's working copy, the project folder). Fine for short clips; worth watching with 38 GB free.
- Deleting a project in the app moves its folder to `projects\_trash` (nothing is erased from disk).
- Jumping around the timeline: the preview can stay black for a moment before the picture appears.
- A few old type errors remain in original OpenCut files we don't use (tests, migrations). They don't affect the app.
- Old unused packages (login, database) are still installed in `node_modules`. Harmless; can be cleaned later.
- Dragging a clip from the media panel onto the timeline was not tested by hand (only the "+" button). Please try it.

## For developers / future Claude sessions
- Web app: `apps/web` (Next.js). Production build: `bun run build` in `apps/web`. The desktop app runs `next start` on port 3210; if there is no build it falls back to dev mode.
- Desktop shell: `apps/jeo-desktop/main.cjs` + `preload.cjs`. Electron program files live in `apps/jeo-desktop/runtime/` (not in git).
- After changing web code, run `bun run build` again or the desktop app shows the old version.
- Control hook: `window.__jeoEditor` (EditorCore). Disk bridge: `window.jeoDesktop`.
- Test mode: `runtime\electron.exe . --capture=<png> --eval-file=<js> [--capture-delay=ms] [--visible] --user-data-dir=<dir>`, with `JEO_PROJECTS_DIR` / `JEO_OUTPUT_DIR` to keep tests away from real data.
- Time unit in the timeline: 120000 ticks per second.

## Next: Phase 2 (my style tools), after your OK
Captions presets, Tags (▼ / ↗), Freeze button, pop-up / colour flash / blur-shake / colour split
effects, 😂 and ❤️ endings, music & SFX library from `assets`, snap texts to cuts, ":29 end" helper.

## Credit
Based on OpenCut Classic (MIT licence). The `LICENSE` file stays in this folder.
