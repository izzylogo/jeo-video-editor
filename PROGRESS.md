# JEO Editor: progress

Written in simple words. Updated after every working step.

## Where we are
- **Phase 0 (test OpenCut Classic on this laptop): done.**
- **Phase 1 (make it mine): done.**
- **Phase 2 (my style tools): done.**
- **Phase 3 (Claude inside): done.**
- **Phase 4 (extras + polish): "Open in CapCut" built; needs your check in CapCut.**

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

## Phase 3: Claude inside (12 Nov 2026) — built and tested, waiting for your OK

**Restart JEO Editor to see this** (close the window, open it again from the Desktop).

| Part | What it does |
|---|---|
| **AI chat** | Click **AI** (top left): a floating chat opens; click again to hide it. Type what you want. Claude edits the timeline and each step shows as a small line ("Cutting the clip", "Adding a text: HUSBAND"…). "Stop" cancels, "New chat" starts fresh. The chat is saved in the project folder (`chat.json`) and comes back when you reopen the project. |
| **Uses your Claude subscription** | The chat runs Claude Code in the background (no API key, no extra cost beyond your normal usage). It is only allowed to use the editor's tools: no files, no internet, no commands. |
| **Knows your style** | It is given `style\your-style.md` plus a short rule sheet (`apps\jeo-desktop\ai-instructions.md`) every time. |
| **Claude can see** | It looks at frames of the raw clip and of the edit before placing things, and checks afterwards. |
| **Undo** | Everything Claude does is a normal edit: Ctrl+Z works, or tell Claude "undo that". |
| **Auto-follow tags** | Tags → "Make selected tag follow the head": put the tag on the head at its first frame, select it, click. It tracks what is under the tag through that clip (OpenCV) and writes position keyframes you can still drag. Claude can do the same. Not on a freeze. |

### The HIDING MONEY test
A fresh project with only `before.mp4`. In the chat: the storyline in a few sentences and "build the
whole edit in my style, about 22 seconds, intro freeze with HUSBAND, the texts, a colour flash on the
scare, and the funny ending". Result after about 3 minutes, with no help:
- 21.967 s, 659 frames, ends on :29 — the same length as your `after.mp4`.
- 1.33 s intro → 2.0 s freeze with ▼ HUSBAND on his head + `*HIDING MONEY FROM WIFE*`.
- Texts: `SHE'LL NEVER KNOW...`, `"DOOR SLAMS"` + colour flash, `*HIDES THE EVIDENCE*` (pop-up),
  `LET'S GO CHECK`, `*SNEAKS OUT TO CHECK*`, `PLEASE, NOT HER` + `*SCARED*` (follows him),
  ▼ `HIS SON`, `*RELIEVED*` (follows him), `*HAPPY DANCE*`, `UNTIL...`, `"WIFE FOUND IT"`, `OHH NO` + 😂 ending.
- Files: `output\PHASE3_claude_built_HIDING_MONEY.mp4`, side-by-side pictures in `output\phase3-proof\`.

Differences from your edit:
- Claude kept more of the first room and cut less tightly there, so `LET'S GO CHECK` comes about 1.5 s later than in yours.
- It added one line of its own (`WHILE HIS SON PLAYS THE VIOLIN`) and said so.
- It used 1.03× speed everywhere; yours varies per shot (1.05× to 1.42×).
- No `?!` icon and only one colour flash (you have two).
- No music (the music folder is empty).
- Fair warning: your style file already describes HIDING MONEY in detail, so this test was easier than a brand-new clip will be.

## Phase 4: extras (12 Nov 2026)

**Restart JEO Editor to see this.**

### "Open in CapCut" (button at the top right, next to Export)
Writes the current timeline as a **new** CapCut project called `JEO <project name>` and tells you
what to do next. Your existing CapCut projects are only read (one is used as the pattern for
CapCut's format); none is changed, and CapCut's own index file is not touched.

| Carried over | Not carried over (the button lists these each time) |
|---|---|
| Cuts, clip speed, zoom and position per shot | Pop-up animation on texts |
| Freeze frames (as still pictures) | Tags that follow a person (placed where they start) |
| Every text: words, time, position, size, LEMON MILK, outline | Colour flash, blur shake, colour split |
| ▼ identity tags (as the label with a ▼ line under it) | The growing/fading of the ending emoji (placed as a still) |
| The ending emoji (as a see-through still on top) | Arrows and spotlights |
| Music and sound effects, with speed and volume | |

**Status: written and checked on paper, NOT yet opened in CapCut.** In the test it wrote
`JEO New project` (9 clips, 16 texts, emoji overlay; all internal links valid) into CapCut's
project folder. CapCut was open with one of your projects at the time, so it was not restarted.
**To check:** close CapCut, open it again, and open `JEO New project` from its home screen.
If it does not appear or looks wrong, tell Claude what you see.

**Warning:** CapCut can change its project format in any update (tested with 9.7). If the button
stops working after a CapCut update, that is why.

### FilmCraft export path
Not built. It was only meant as a fallback if exporting in the app was too slow, and it is not:
a 22–34 s video exports in about 30 seconds here (FilmCraft needed about 2 minutes for 18 s).
## Known problems / gaps
- **Only tested on one storyline.** A new clip whose story is not in the style file is the real test.
- **Head-follow tracks the picture under the tag, not faces as such.** If the tag is not on the head when you click, it follows whatever is there. It stops at the end of the clip.
- **The 😂 size was wrong in the first run** (too small, because the picture file has an empty border). Fixed and re-checked; the proof video has the corrected ending.
- **Each chat message takes a while** (a full edit about 3 minutes; a small change less). The first reply needs a few seconds to start.
- **If Claude Code is logged out** the chat shows an error. Open a terminal, run `claude`, log in, try again.
- **Your `assets\music` and `assets\sound-effects` folders are empty.** The Audio panel and the freeze sound work, but were not tested with real files. Drop your music and your "FAHHHH" in and press Refresh.
- **Not clicked by hand:** I tested the actions directly, and the panels only by screenshot. Please click through each category once.
- **Flash, blur shake and colour split** are done by a light extra step on the finished frame, because the engine only ships a blur effect. They show in preview and export. Strength and length can be changed on the right.
- **Colour flash starts at the playhead** and fades out over 6 frames (it is not centred on the cut).
- **▼ tag position** from the Tags panel is a starting point (upper middle). Drag it onto the head, or ask Claude to place it.
- **Freeze** makes a still picture file per freeze (stored with the project).
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
- Control tools for Claude: `apps/web/src/jeo/control.ts` (`window.__jeoControl`). Desktop: local control channel + `mcp-server.cjs` + chat runner in `main.cjs`; tracker `tools/track_point.py`.
- CapCut export: `apps/web/src/jeo/capcut.ts` → `apps/jeo-desktop/tools/capcut_export.py`. Set `JEO_NO_CAPCUT_LAUNCH=1` in tests.
- Tests must use `JEO_PORT=3299` (or any free port) so they don't attach to the user's running app on 3210. Disk bridge: `window.jeoDesktop`.
- Test mode: `runtime\electron.exe . --capture=<png> --eval-file=<js> [--capture-delay=ms] [--visible] --user-data-dir=<dir>`, with `JEO_PROJECTS_DIR` / `JEO_OUTPUT_DIR` to keep tests away from real data.
- Time unit in the timeline: 120000 ticks per second.

## Next
- You: check "Open in CapCut" as described above; click through each category once; try the AI chat on a brand-new clip.
- Then: fixes from what you find, and speed tuning where it feels slow.

## Credit
Based on OpenCut Classic (MIT licence). The `LICENSE` file stays in this folder.
