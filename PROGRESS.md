# JEO Editor: progress

Written in simple words. Updated after every working step.

## Where we are
- **Phase 0 (test OpenCut Classic on this laptop): done.**
- **Phase 1 (make it mine): done.**
- **Phase 2 (my style tools): built and tested, waiting for your OK.**

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
- Preview sound: plays. Clips with HE-AAC v2 sound (common on Douyin/TikTok downloads) use a backup decoder; the first play of such a clip may start a moment late.

## Phase 2: my style tools (12 Nov 2026) — built and tested, waiting for your OK

**Restart JEO Editor to see these** (close the window, open it again from the Desktop).

| Category | What it does |
|---|---|
| **Captions** | Click a preset to add it at the playhead, then type: Scene text `*ACTION*`, Narrative (2 lines), Quoted beat `"BEAT"`, Dialogue, Speaker + action (`NAME:` small over `*ACTION*`), Twist line (`BUT THEN...` / `UNTIL...`). Button: **Snap texts to cuts**. |
| **Tags** | ▼ Identity tag (label with a see-through triangle, part of the text so it moves with it), Feeling tag, ↗ Arrow, ↗ Arrow + phrase, ↗ Arrow + dark spotlight. Triangle-vs-arrow rule is written in the panel. |
| **Freeze** | "Add freeze": holds the picture under the playhead (default 2.0 s), moves everything after it later, keeps the clip's framing. One undo. Optional sound from `assets\sound-effects`. |
| **Effects** | Pop-up on the selected text (30% → 115% → 100% in 0.2 s), Colour flash, Red colour flash, Blur shake, Colour split. They are normal timeline pieces: move, trim, delete, undo. |
| **Endings** | 😂 Funny / ❤️ Sweet: playhead on the last cut, one click → 0.3 s blurry shake → emoji fades in 45% see-through and grows 1/3 → 2/3 → 5/6 of the width → colour split from 0.6 s. Uses `assets\emoji\laugh_yours.png` / `heart.png`. |
| **:29 end** | In Endings: shows the length in seconds:frames, with "Trim to …" and "Extend to …" buttons. |
| **Audio** | Lists `assets\music` and `assets\sound-effects`. Music starts at 0:00, is cut to the video, with a speed choice (1× / 0.9× / 0.8× / 0.7×). Sound effects land on the playhead. |
| **Every text** | A line that is too long is shrunk automatically so it never runs off the screen. |

### Tested in the desktop app
One run on the HIDING MONEY clip: freeze at 1.33 s (2.0 s), ▼ HUSBAND + scene text with pop-up,
colour flash, speaker + action, arrow + spotlight, 😂 ending, trim to :29 (34:24 → 33:29), snap.
All steps succeeded and the export shows them. Export: 33.97 s in about 30 seconds.
Files: `output\PHASE2_style_test.mp4`, pictures in `output\phase2-proof\`.

## Known problems / gaps
- **Your `assets\music` and `assets\sound-effects` folders are empty.** The Audio panel and the freeze sound work, but were not tested with real files. Drop your music and your "FAHHHH" in and press Refresh.
- **Not clicked by hand:** I tested the actions directly, and the panels only by screenshot. Please click through each category once.
- **Flash, blur shake and colour split** are done by a light extra step on the finished frame, because the engine only ships a blur effect. They show in preview and export. Strength and length can be changed on the right.
- **Colour flash starts at the playhead** and fades out over 6 frames (it is not centred on the cut).
- **▼ tag position** is a starting point (upper middle). Drag it onto the head, and move the frozen picture so the head sits under it. Automatic head tracking comes in Phase 3.
- **Freeze** makes a still picture file per freeze (stored with the project).
- **The AI button** is still a placeholder (Phase 3).
- The old "Subtitles" (automatic speech-to-text) and "Stickers" tabs are still OpenCut's originals and untested.
- If JEO Editor is open while Claude rebuilds it, the open window keeps the old version until restarted.
- Clips are stored three times (your original, the app's working copy, the project folder).
- Deleting a project in the app moves its folder to `projects\_trash` (nothing is erased from disk).
- Jumping far along the timeline: the preview can show the old picture for a moment before it catches up.
- A few old type errors remain in original OpenCut files we don't use.
## For developers / future Claude sessions
- Web app: `apps/web` (Next.js). Production build: `bun run build` in `apps/web`. The desktop app runs `next start` on port 3210; if there is no build it falls back to dev mode.
- Desktop shell: `apps/jeo-desktop/main.cjs` + `preload.cjs`. Electron program files live in `apps/jeo-desktop/runtime/` (not in git). It is Electron 33.2.0, copied from the my-animator project because a fresh download was too slow.
- After changing web code, run `bun run build` again or the desktop app shows the old version.
- Control hook: `window.__jeoEditor` (EditorCore). Style actions: `window.__jeoActions` (source: `apps/web/src/jeo/actions.ts`). Post effects: `apps/web/src/jeo/post-fx.ts`.
- Tests must use `JEO_PORT=3299` (or any free port) so they don't attach to the user's running app on 3210. Disk bridge: `window.jeoDesktop`.
- Test mode: `runtime\electron.exe . --capture=<png> --eval-file=<js> [--capture-delay=ms] [--visible] --user-data-dir=<dir>`, with `JEO_PROJECTS_DIR` / `JEO_OUTPUT_DIR` to keep tests away from real data.
- Time unit in the timeline: 120000 ticks per second.

## Next: Phase 3 (Claude inside), after your OK
Control channel / MCP server over the editor's commands and the style actions, the floating AI chat
(Claude Code headless with your style file), auto-follow tags (head tracking), and the HIDING MONEY
storyline test compared against your `after.mp4`.

## Credit
Based on OpenCut Classic (MIT licence). The `LICENSE` file stays in this folder.
