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

## Round 2 of your feedback (12 Nov 2026, night)

| You said | What I found | Now |
|---|---|---|
| CapCut takes too long and sometimes doesn't open | Three of the six JEO drafts in CapCut were the old broken ones (made before the fix). CapCut tries to load those and never finishes. A good draft opens in about 8 seconds (timed: click to timeline ready). | The three broken drafts were **moved** (not deleted) to `output\_capcut-broken-drafts\`. New exports also carry a cover picture, so they are no longer black tiles in CapCut's list. Text size in CapCut is now right. |
| The AI should be a tab that switches with Media, not a floating box | — | **AI** is the first tab in the top row; the chat fills the left panel. A small dot shows on the tab while Claude is still working and you are on another tab. |
| Selecting a text should give me more options for that part | — | Quick options at the top of the text's settings: **Place** (Centre / On the head / By the speaker), **Style** (▼ Triangle, Pop-up, Follow the head), **This moment** (Fit to its scene, Flash here, Freeze here). |
| Timeline pictures only show the start of the video | The original editor repeats the video's first frame on every clip. | Each clip shows pictures from its own part of the video, following its trim and speed. |
| I can't hear the video's sound | The cut tool muted the clip's own sound by default (your finished videos replace it with music). With no music, that was silence. | Clips keep their sound. Projects that were muted this way are fixed once, automatically, when opened. The speaker icon on the track still mutes it when you want. |
| I need a projects section; new project should open empty | The list page existed but was hidden in the logo menu. | **Projects** button at the top left: saves, shows all projects, click one to open it, **New project** starts an empty one. |

Tested in a test window: sound plays (real signal), 57 filmstrip tiles with 35 different pictures,
AI tab has the chat box and no floating box, all nine quick options show on a selected text,
Projects button present. Picture: `output\round2-proof\`.

**Not checked by clicking:** the nine quick options (only that they appear), the Projects list
flow, and typing in the AI tab. The CapCut timing is one measurement of one draft.
## Fixes after your first try (12 Nov 2026, late)

**Restart JEO Editor to see these.** From now on the app tells you itself: see "Update popup".

| You reported | What was wrong | Now |
|---|---|---|
| "Open in CapCut" made a project that would not open | CapCut 9.x keeps each project's timeline in a `Timelines` folder with an index. The draft only had the two main files, so CapCut listed it but could not load it. | The full layout is written. **Checked for real:** CapCut 9.7 opened `JEO New project (2)` with the cuts, speeds, freeze, texts in LEMON MILK, the 😂 overlay and 21:29 length (`output\phase4-proof\draft_open_in_capcut.jpg`). Text came out about 30% too big; the size conversion is corrected but that correction is not re-checked in CapCut yet. |
| Text clips on the timeline only coloured under their label | A layout quirk of this app's engine shrank the colour to the label. | Clips are coloured along their whole length. |
| "The script is not following the script I did" | In the test I gave Claude only a storyline, so it wrote its own lines, added one, and used its own cuts and speeds. | New project **HIDING MONEY - your script**: your cuts and per-shot speeds, your 16 texts at your times and places, `?!`, both colour flashes, pop-up, the 😂 ending, 21:29. Side-by-side with your `after.mp4`: `output\script-proof\`. And the in-app Claude now has a rule: when you give a script, use exactly your words, order and notes, add nothing, and list where each line went. |
| "Use the skills from my animator for the UI" | The animator used the **impeccable** design skill. | Polish pass done with it (below). |
| "Show when an update is available, like my animator" | — | **Update popup:** when a new version has been built while the app is open, a card appears bottom-right with what's new. "Update now" saves your project and restarts on it; "Later" leaves a small "Update ready" button. |

### UI polish (impeccable, "polish" for a tool-type app)
- Small hint text is brighter, so it is comfortably readable on the dark panels.
- Dark surfaces carry a little of your accent colour. The colour dot (top right) now also has **Panel colour: Grey / Soft / Deep**.
- Effect buttons use real icons instead of symbols; every category shows a tip when the mouse rests on it.
- Buttons respond on hover and press; keyboard focus shows an accent ring.
- Number box, drop-down, scrollbars, text cursor and selection follow the app's colours.
- The Export button is a plain accent button, the same shape as the others.
- Chat: Claude's step lines are quieter.

**Not done / to know**
- The three earlier broken CapCut drafts (`JEO New project`, `JEO HIDING MONEY - Claude edit`, `… (2)`) are still in CapCut. They are safe to delete there.
- The update popup was checked with a forced test, not by a real rebuild while your window was open.
- The in-app Claude's new script rule is written but has not been run on a script yet.
- On a narrow window the last categories (Subtitles, Settings) scroll out behind the project name.

**Rule for every future change (Claude):** add one plain line to the top of
`apps/web/public/whats-new.json`, then run `bun run build` in `apps/web`.
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

**Status: fixed and opened in CapCut 9.7 (see "Fixes after your first try" above).** The paragraph below describes the first, broken attempt. In the test it wrote
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

## Round 3 of your feedback

- **Graphify**: was not set up here. It is now: a map of the editor's code lives in `app\graphify-out\` (open `graph.html` to look at it). It was free to build.
- **Layouts**: a **Layout** button at the top right with six ready-made layouts (JEO, CapCut style, Big preview, Tall timeline, Preview on the left, Wide AI chat). You can still drag the edges.
- **Timeline clips** show their speed ("Speed 1.4X"), name and length (hours:minutes:seconds:frames). Drag the thin line on a video clip up or down to change its volume.
- **Right-click a text** on the timeline: "Use on this part" gives other wordings (from Claude), place, ▼, pop-up, follow the head, fit to its scene, flash, freeze. The same choices are in the text's **Options** tab.
- **Other wordings**: "Ask Claude for options from the storyline" sends the request to the AI chat; Claude's options come back as one-click choices on that text.
- **Text settings** look like CapCut's: Font size slider, Pattern (B U I), Case, Alignment, 14 preset styles, then Transform (Scale, Uniform scale, Position, Rotate, align buttons) and Blend.
- **Your standard text is now "font size 12, scale 120%"**, the same numbers CapCut shows. New texts use it. Texts in projects made before this keep their old size and show as about 9.2.
- **Video settings** look like CapCut's: tabs Video / Audio / Speed / Masks / Effects, with Scale shown in percent.
- **The app's own text is Poppins.** Your caption font is still LEMON MILK.

Dev notes: text numbers are display-only conversions (see `apps/web/src/jeo/text-units.ts`); layouts are in `apps/web/src/panels/layout.ts`.
- **Older projects**: when you open one, its texts are resized once to the new standard (each grows by the same amount, about 30%). Ctrl+Z puts them back. Copies of the project files from before are in `output\_backup-before-text-resize\`.

## Round 4 of your feedback

- **Video clips on the timeline** have CapCut's three bands: a coloured band on top with the speed, name and length; the pictures; and a coloured sound band at the bottom showing the clip's sound wave. Drag the line in the sound band up or down to change the volume in dB.
- **Timeline toolbar** in CapCut's order: undo, redo, split, delete left, delete right, delete, marker, freeze (2 s), mirror, then snapping, main track magnet, fit, and the zoom bar. Freeze and mirror are new and working.
- **New layout "CapCut tall preview"**: the preview runs down the whole right side, with options, settings and the timeline to its left.
- **Preview zoom bar**: minus, slider, plus, next to the Fit menu.
- Not done: CapCut's own program was not taken apart with REA. The toolbar was built from your picture and CapCut's visible buttons. CapCut's record-voice, crop, linkage and preview-axis buttons have no equivalent here yet.
- **Crop button** (timeline toolbar): puts a box on the selected clip and opens its Masks tab. Drag the box in the preview; what is outside it is hidden.
- **Record voice** (microphone on the timeline toolbar): click to start (the video plays), click again to stop. The recording is saved as a WAV and lands on a sound track where the playhead was.
- **Text clips on the timeline are orange.**
- **Several clips at once**: select more than one clip (Ctrl+click, or drag a box) and the settings panel shows what they share. Texts: font size, bold, outline, ▼, ALL CAPITALS, preset style. Anything you can see: scale, position, rotate, opacity. Video and sound clips: volume and mute. A box says "Mixed" when the clips differ. Each change is one Ctrl+Z.

## Round 5 of your feedback

- **Hover preview**: move the mouse over the timeline without clicking and the preview shows that moment, with a faint top-to-bottom line under the mouse. The playhead does not move. The eye button on the timeline toolbar turns it off.
- **Colours** work the way My Animator's do: pick an **Accent** and a **Base**. The accent is used exactly as picked (it is only nudged if it would be unreadable). You can also type a colour code. The old picker closed itself when the system colour window opened, so the colour you chose was lost; that is fixed.
- **Audio tab** rebuilt: Music / Sound effects / In this video. Search, listen before adding, "Add file" for a one-off sound, record voice. "In this video" lists every sound with its own volume, mute and remove, and one switch for all the clips' own sound.
- **More effects**: zoom punch, slow zoom in, shake, glitch, blur, and looks (black and white, old film, vivid, cold, darker, dark edges). **Transitions** for the cut nearest the playhead: dip to black, dip to white, glare, blur, zoom, shake.
- **Open in CapCut carries more**: pop-ups, tags that follow a person, the growing and fading emoji (as CapCut keyframes), text colour / outline / box, mirror, clip volume, colour split (as CapCut's "RGB Distort"), blur shake (as "Shake") and the Glare transition (as "Glare II"). Those three CapCut effects are copied from your own CapCut projects, because CapCut can only use effects already downloaded on this computer.
- **Import from CapCut** (Projects page): pick a CapCut project and it becomes a new JEO project with its cuts, speed, framing, mirror, volume, texts, sounds and keyframes. CapCut's own effects, transitions, stickers and text animations stay in CapCut, and the import says which. CapCut's files are only read.
- How CapCut keeps a project is written at the top of `apps/jeo-desktop/tools/capcut_import.py`.
- Not done: CapCut's program was not taken apart with REA. Everything needed was in CapCut's project files.
- **Checked in CapCut 9.7** (draft "JEO HIDING MONEY - your script (3)"): it opens; the pop-up text has its keyframes; the emoji grows and stays see-through; "RGB Distort" and "Shake" are real, editable CapCut effects; the "Glare II" transition sits on the cut at 0.4 s. Pictures in `output\round5-proof\`.
- **REA and CapCut**: REA opened CapCut's program file but its deeper search needs Ghidra, which is not installed on this laptop (a large download). Reading the program files directly gave CapCut's full list of keyframe names; it is saved in `apps/jeo-desktop/tools/capcut-keyframe-names.md`.
- **REA with Ghidra ran on CapCut** (Ghidra was already on this laptop, installed by Craft Anything). It confirmed the keyframe names the export uses, including the opacity one. Notes are in `apps/jeo-desktop/tools/capcut-keyframe-names.md`.
- **Other wordings travel with the project**: the options Claude offers for a text are now saved on the text itself, so they show on any computer profile that opens the project.
- **First real edit made with the editor**: BLIND MAN PRANK (project in `projects\`, export `output\BLIND MAN PRANK_v4.mp4`, 23:29).

## Round 6 of your feedback

- **Loading feedback**: "Open in CapCut" shows a spinner and the step it is on (saving, cover picture, writing), then tells you when CapCut's window is really open, with a seconds count. "Ask Claude for options" shows a spinner, a seconds count and placeholder rows where the options will land, then "4 options are ready". Freeze, ending and follow say what they are doing if they take more than a moment.
- **Small motion that means something**: buttons dip when pressed, menus grow out of their button, new options rise in, a finished action gives one soft pulse. Numbers keep their width so counters don't jiggle. All of it is switched off for people who turn motion off in Windows.
- **Live link**: when you ask Claude in a chat to change a video, it changes in your open JEO Editor straight away. The open editor writes where it can be reached into `live\control.json`; Claude sends commands with `app\apps\jeo-desktop\tools\jeo-live.cjs`. Claude can also list, open and create projects and bring a media file in.
- **Follow the speaker**: a line of dialogue can stay under a moving speaker's mouth (Options tab, or right-click the text). It writes position keyframes you can still drag by hand.
- **Options travel with the project**, and **a project moved to `projects\_trash` leaves the Projects list**.
- Removed at your request (moved, not destroyed): the JEO project "HIDING MONEY - Claude edit" (now in `projects\_trash`) and the two older JEO HIDING MONEY drafts in CapCut (now in `output\_capcut-removed-drafts`).

Dev notes: the live token in `live\control.json` is a local secret; never print it. Use `node apps/jeo-desktop/tools/jeo-live.cjs --status`, `--list`, or `<tool> @args.json`.
- **Typing in a text no longer hangs.** Before, every keystroke redrew the timeline and the preview (about 180 ms each on this laptop, more on a full project). Now the box keeps up with the keyboard, the preview catches up about a fifth of a second after you pause, and the change is saved as one undo step when you click away. The same goes for typing directly on a text in the preview.
- **Live link checked on the real editor** (13 Nov 2026): a text was added and undone in the open window from a Claude chat.

## Round 7 of your feedback

- **Media panel like CapCut's**: a short list on the left (All, Videos, Pictures, Sounds, Added, Not used, each with a count), then Import, Record and a search box, then the files as cards. A file already in the timeline carries an "Added" badge; the length is on the top right; upright clips are shown whole on a dark tile instead of cropped.
- **Fits more screens**: on a small laptop the category bar shows icons only (rest the mouse on one for its name). At phone width the editor becomes one column: the video, then an Add / Settings switch, then the timeline. The old "desktop only" wall is gone and the window can be made narrow.
- **Design review** (impeccable skill): two findings fixed, the preview's zoom controls running off the edge at phone width and category buttons too small to tap comfortably.
## Round 8: on GitHub, installable by a friend (13 Nov 2026)

- **The repo**: `https://github.com/izzylogo/jeo-video-editor` (branch `main`). On this PC the local branch is still called `jeo-editor`; it follows `origin/main`, so a plain `git push` sends your changes. OpenCut's repo is kept as the remote `upstream`.
- **For a friend**: `git clone`, then `setup.cmd` (checks the PC, installs packages, downloads Electron, builds, makes the Desktop shortcut, writes `JEO-REPORT.md`). `start.cmd`, `update.cmd` and `report.cmd` do what their names say. The README explains every step, sizes and warnings.
- **Updates**: the open editor looks at GitHub about 25 seconds after it opens, then every 2 hours, and shows "An update is on GitHub" with a **Get update** button. `update.cmd` does the same from a window.
- **Their data** lives in `data\` inside their folder (ignored by git). On this PC the old folders next to `app\` are still used.
- **Tested**: a fresh copy in `C:\jt\` went through the whole setup and its report said "Everything checked out". Two problems found and fixed on the way: a very long folder path breaks the package install (setup now checks and says so), and the package list file was out of date.
- **Not tested**: the Electron download itself (the test copied Electron from this PC), the `winget` installs of Git/Node/Bun, and a PC that is not this one.

- Not done: touch gestures on the timeline (dragging clips with a finger) are untested, so phone width is for looking and light changes, not full editing.
