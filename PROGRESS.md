# JEO Editor: progress

Written in simple words. Updated after every working step.

## Where we are
**Phase 0 (test OpenCut Classic on this laptop): done, waiting for your OK.**

## Phase 0 results (12 Nov 2026)

Tested with `examples\HIDING MONEY\before.mp4` (32 s clip).

| Test | Result |
|---|---|
| Runs without Docker / database / login | Works. Nothing had to be removed to get the editor open. |
| Graphics on Intel HD 620 | Works. Both WebGPU and WebGL2 are available. |
| Import video | Works (thumbnail, length shown). |
| Playback | Keeps real time. About 20 screen frames per second, one 1-second stutter at the start. Measured in slow "developer mode". |
| Cut (split at playhead) | Works. |
| Add text | Works. Own track, content / font / size / colour editable. |
| LEMON MILK Bold | Renders correctly, but only when set by command. It is not in the font list yet. |
| Keyframes | Works. Pop-up (30% → 115% → 100% in 0.2 s) plays in preview and export. |
| Speed change | Works (1.05× on a clip). |
| Undo / redo | Works, including on edits sent by command (this is how Claude will edit). |
| Project 1080×1440, 30 fps | Works. |
| Auto-save, reopen after reload | Works (saved inside the browser's local storage). |
| Export MP4 | Works. 32 s video at 1080×1440, 30 fps took about 29 seconds. File: `output\PHASE0_test_export.mp4` (18.9 MB). |

Proof pictures: `output\phase0-proof\`.

## Known problems / gaps found
- Text has **no outline (stroke) setting**. We must add it (your style needs white text with a dark outline).
- Font list only shows built-in and Google fonts. LEMON MILK must be added to the list and made the default.
- New projects take their size and frame rate from the first clip (810×1440, 24 fps here). Needs fixed defaults of 1080×1440, 30 fps.
- Jumping around the timeline: the preview can stay black for a second or two before the picture appears.
- Small error in the log when pausing and cutting quickly (audio related). Nothing visibly broke.
- Sound in the exported file was not checked yet.
- The first `bun install` is big (about 1.6 GB on disk) and was slow to download.
- The page still loads some online extras (analytics script, Google font for the interface). To be removed in Phase 1 so the app works offline.

## Changes made to the original code so far
- `apps/web/src/app/layout.tsx`: removed the developer debugging overlay (react-scan).
- `apps/web/src/core/index.ts`: added `window.__jeoEditor`, a small hook to send commands to the editor. First brick of the Claude control channel.
- `apps/web/.env.local`: copy of `.env.example` (placeholder values, no real database).
- `apps/web/public/_jeotest/before.mp4`: temporary copy of the test clip (not in git). Can be deleted.

## How to start the editor (for now)
In a terminal:

    cd "C:\Users\Admin\Documents\JEO Video Editor\app\apps\web"
    bun run dev

Then open http://localhost:3000/projects

## Next: Phase 1 (make it mine), after your OK
- Remove website pages, login and database code. Open straight into the editor.
- Desktop app with a "JEO Editor" shortcut.
- Defaults: 1080×1440, 30 fps, LEMON MILK Bold, white, outline, centred.
- Add text outline. Add LEMON MILK to the font list.
- New name, colours, logo. Layout like your sketch.
- Save / open projects as files.

## Credit
Based on OpenCut Classic (MIT licence). The `LICENSE` file stays in this folder.
