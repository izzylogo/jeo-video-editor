# CapCut reference for JEO Editor

What CapCut (desktop 9.7 / 9.8, Windows) can do, how it stores each thing in a
project, and how JEO Editor can export it. Written 18 Nov 2026 to come back to
later. Everything here was read from CapCut's own files on this PC; nothing in
CapCut was changed.

> Status words used below: **verified** = checked against a real project or by
> drawing/exporting and comparing; **seen** = present in the user's CapCut
> projects; **binary only** = found in CapCut's program but not in any project
> yet (needs a test before relying on it).

---

## 0. How this was found

| Source | What it gave | Tool |
|---|---|---|
| `videoeditor.dll` export table (33,521 C++ functions) | ~600 project-format classes and all their fields (e.g. `lvve::MaterialText` 141 fields, `lvve::SegmentVideo` 123) | REA `inspect_native_exports`, then name parsing |
| Defaults schema embedded in `videoeditor.dll` (130 KB JSON) | Each field's type, default value and the effect-resource key behind it, for 88 material kinds | string extraction |
| `VECreator.dll`, `cccreator.dll`, `lyra_cli_client.dll` | Text rich-content keys, blend modes, adjust names, mask resource types | string extraction |
| Downloaded effect packages `User Data\Cache\effect\<id>\<hash>\` (~600) | The real drawing code: Lua scripts and GLSL shaders for masks, transitions, animations, effects; `extra.json` with the tunable settings | read directly |
| The user's projects `User Data\Projects\com.lveditor.draft\` (281 `draft_content.json`, incl. cloud copies and timelines) | How each feature is actually stored, with real values | read directly |
| The user's finished videos (`examples\...\after.mp4`) | Ground truth to check formulas against | frame comparison |

Ghidra: a full analysis of `videoeditor.dll` (70 MB) stalled on this laptop's
memory and was stopped. Disassembly was done by hand where needed (see 6).
The raw survey files are listed in section 9.

---

## 1. Project anatomy (verified)

- A project is a folder in `...\com.lveditor.draft\<name>\` with
  `draft_content.json` (the edit), `draft_meta_info.json` (name, id, cover,
  duration), `draft_cover.jpg`, `draft_virtual_store.json`, `key_value.json`,
  `attachment_*.json`. Newer versions also keep `Timelines\project.json` and
  `Timelines\<uuid>\draft_content.json` (one per timeline). Cloud projects live
  in `.cloud_cache_<id>\<name>\` and use a `##_draftpath_placeholder_<UUID>_##`
  token instead of absolute media paths.
- Plain JSON, not encrypted. **All times are microseconds.** `fps` 30.0,
  `version` 360000, `new_version` up to 191.0.0 in 9.6–9.7 projects (9.8 likely
  writes 193.0.0: binary only). `canvas_config {ratio, width, height}`.
- `materials{}`: about 60 kinds (videos, audios, texts, stickers, shapes,
  video_effects, effects, transitions, material_animations, speeds, canvases,
  common_mask, chromas, beats, audio_fades, placeholder_infos,
  sound_channel_mappings, material_colors, vocal_separations, loudnesses,
  text_templates, drafts, ...). Each item has a UUID `id`.
- `tracks[]`: `{id, type (video/audio/text/sticker/effect/filter/adjust), flag,
  attribute, segments[]}`. The first video track is the main track; overlay video
  tracks have `flag 2`.
- Every segment has the same 52 keys. Key ones: `material_id`,
  `extra_material_refs[]`, `source_timerange` (media µs, null on text, sticker,
  effect), `target_timerange` (timeline µs), `speed`, `volume`, `clip {scale{x,y},
  rotation, transform{x,y}, flip{horizontal,vertical}, alpha}`, `uniform_scale`,
  `common_keyframes[]`, `render_index`, `visible`, `enable_video_mask`.
- `render_index` bands: video 0–14, filter 10000+, effect 11000+, text and
  sticker 14000+, audio 0.
- A video segment points (in this order) at helper materials: `speeds`,
  `placeholder_infos`, `canvases`, `sound_channel_mappings`, `material_colors`,
  `vocal_separations`, then optional animations, transition, masks, chroma,
  filters, fades, loudness. A text segment always points at a
  `material_animations` item, even an empty one.
- `clip.transform` is in half-frame units (1 = half the frame, **up is
  positive**); `clip.scale` is relative to "fit inside the frame".
- C++ field names differ from JSON keys in a few places:
  `target_time_range`→`target_timerange`, `source_time_range`→`source_timerange`,
  `material`→`material_id`, `keyframes`→`keyframe_refs`.

---

## 2. Feature by feature

| Feature | How CapCut stores it | JEO today | How to export / next step |
|---|---|---|---|
| Cuts, trims | `source_timerange` + `target_timerange`; with speed, target = source / speed | **exported** | done |
| Constant speed | `segment.speed` + `speeds {mode 0, speed}` | **exported** | done |
| Curve speed | `speeds.curve_speed {speed_points}` (class `CurveSpeed`) — binary only | not in JEO | needs a test project with a curve to copy the point format |
| Freeze frame | no special field seen; a photo of the frame on the main track (that is what JEO writes and what the user's projects contain, named "Freeze") | **exported** as photo | done |
| Position, scale, rotation, opacity, mirror | `clip{}` | **exported** | done |
| Crop | `videos.crop` 4 corner points 0..1; `crop_ratio`, `crop_scale` | not exported | map JEO crop box to the 4 corners |
| Keyframes | `common_keyframes[] {property_type, keyframe_list[{time_offset, values[], curveType, left_control, right_control, graphID}]}`. 192 property names (`KFTypePositionX/Y`, `KFTypeScaleX/Y`, `KFTypeRotation`, `KFTypeAlpha`, `KFTypeGlobalAlpha`, `KFTypeChroma*`, mask, filter, adjust, volume ...). Curves: `Line`, `CurveIn`, `CurveOut`, `CurveInOut`, `FreeCurveIn/Out/InOut`; presets via root `keyframe_graph_list` | **exported** (position, scale, rotation, opacity; Line) | **verified rule:** on video/photo segments `time_offset` is in **source** time (from the start of the media file); on text and stickers from the segment start. Fixed in the exporter 18 Nov. Next: ease curves (`CurveInOut`), mask keyframes |
| Masks | see section 3 | **exported** (Circle, Rectangle, several per clip) | Heart, Star ("pentagram"), Line, Mirror, Text, custom need their packages |
| Clip animations (in/out/combo) | `material_animations.animations[] {id=resource_id, type in/out/loop/caption, start, duration, path, resource_id, name, category_id, material_type "video", panel "video", platform "all"}` referenced by the clip | not exported | reusable on this PC: Zoom 1, Zoom In, Fade Out (video) |
| Text animations | same container on the text segment, `material_type "sticker"`; out animations start at segment duration − anim duration | JEO's pop-up goes as scale keyframes | reusable: Fade In/Out, Slide Up/Down, Bounce In, Sunrise, Typewriter, Wobble 2, Tiny Bounce, Color Fade-In, Rising Blur-In, Slide To Type, Sudden Pop-In |
| Transitions | `transitions {name, effect_id, resource_id, path, duration µs, is_overlap}` referenced from the **outgoing** clip (never the last clip) | **exported** (Glare → Glare II) | also on this PC: Mix, Fade Up, White Flash (map JEO white/black transitions) |
| Full-frame video effects | `video_effects {name, effect_id, path, value, adjust_params[{name, value, default_value}]}` on an `effect` track segment, render_index 11000+ | **exported**: colour split → RGB Distort, blur shake → Shake | also on this PC: Diamond Zoom (Pro), Zoom Lens. JEO colour flash goes as an "(ADD C.F)" text |
| Filters | `effects` item `type "filter"` referenced by the clip, or a `filter` track; strength `effects_adjust_filter` 0..1 | JEO looks not exported | on this PC: Berlin, Enhance, 4K |
| Colour adjust | each setting is an `effects` item whose `type` is the setting (brightness, contrast, saturation, ...), value -1..1 or 0..1 (UI ÷50 or ÷100: inferred) | not exported | map JEO looks to these |
| Blend modes | `effects` item `type "mix_mode"` (13 modes: multiply, overlay, screen, darken, lighten, soft light, hard light, colour burn/dodge, linear burn, difference, colour filter, normal); ids in the app's `Resources\MixMode\MixMode.json` | not in JEO | needs a JEO blend setting first |
| Chroma key | `chromas {color, intensity_value, shadow_value, edge_smooth_value, spill_value, version "v2", path → Resources\Chroma2}` | not in JEO | straightforward once JEO has it |
| Background | `canvases {type canvas_color / canvas_blur (blur 0.0625 or 0.375) / canvas_image}` | colour exported | blur background is one field |
| Text | `texts.content` is a JSON string `{text, styles[{range, fill, font{path,id}, size, bold, italic, underline, strokes[], shadows[], inner_shadows, background, bloom, effectStyle, useLetterColor}]}` plus flat copies (`font_path`, `font_size`, `text_color`, `border_color/width`, `alignment` 1 = centre, `background_*`, `line_max_width` ...) | **exported** (words, font LEMON MILK, colour, outline, box, bold/italic, alignment, size, position) | shadows and glow not yet |
| Text templates | `text_templates` + inner texts + effects; best copied whole | not exported | 7 on this PC (several Pro) |
| Shapes (triangle, arrow, ellipse) | `shapes {name polycon_item / ellipse_item, shape_type, custom_points [x,y,...] in pixels around the centre, custom_points_in/out (curves), shape_size, border_width/color, fill_render_style}` on a **sticker** track | ▼ goes as a text character; JEO arrow is **not carried over** | **best next win:** write the ▼ and the curved arrow as native CapCut shapes (editable in CapCut) |
| Stickers / emoji | `stickers {sticker_id, resource_id, path}`; custom PNGs go as photos on an overlay track | **exported** as photos | done |
| Audio | `audios {type music/sound/extract_music, path, duration}`; fades `audio_fades {fade_in_duration, fade_out_duration}`; volume on the segment | **exported** (clips, volume) | fades not yet |
| Beats, loudness, voice effects, vocal separation | `beats`, `loudnesses`, `audio_effects`, `vocal_separations` | not in JEO | later |
| Tracking | `video_trackings`, mask `track_segment` (`MaskTrackingService`) | JEO follow-head goes as position keyframes | fine as is |
| Compound clips | `drafts {type "combination", draft{...nested project}}` + `subdraft\` | not needed | avoid |

---

## 3. Masks in detail (verified)

- `materials.common_mask[]`, one item per mask; the clip lists the ids in
  `extra_material_refs` (Mask1, Mask2, ... in order) and has
  `enable_video_mask: true`. A clip can hold several masks (the user's GIRLFRIEND
  EXPOSED freeze frame has a Rectangle and a Circle).
- Item: `name` ("Rectangle"/"Circle"), `resource_type` (`rectangle`, `circle`,
  `heart`, `pentagram`, `line`, `mirror`, `custom`, `contour`, `text`),
  `resource_id` (Rectangle 7374021450748924432, Circle 7374021188315517456),
  `path` (the shape package on the PC), `config`.
- `config`: `centerX, centerY` in half-sizes of the clip (−1..1, **up is
  positive**); `width, height` as a part of the clip; `rotation` (degrees);
  `feather`, `roundCorner` 0..1; `invert`; `expansion`; `aspectRatio`.
- CapCut's panel shows X = centerX × clipWidth/2 and Y = centerY × clipHeight/2
  (cut, not rounded), Size = width × clipWidth by height × clipHeight, Feather and
  Round corners × 100.
- **How it is drawn** (from `lumi_rectangle_mask` / `lumi_circle_mask`
  `picture.frag` and `Process.lua`): each mask paints a grey "how visible"
  picture, 1 inside and 0 outside, with a smoothstep fade. The script stretches
  feather a lot: × 6 for the rectangle, × 15 for the circle. Several masks are
  **added together** (capped at 1). A last step (`featureMask` `blend.frag`)
  multiplies the clip by the result.
- Why the user's spotlight is dim and not black: with feather 0.58 the
  rectangle's fade is so wide that even its middle is only ~70 % visible and it
  reaches far outside the shape. The circle adds on top and brings the object to
  100 %. There is no separate darkness setting.
- Matching the user's finished video works best with two-thirds of the script's
  feather numbers (× 4 and × 10; median difference 7/255). The two-thirds was not
  found in the compiled code (open question 1). Since 18 Nov 2026 JEO uses the
  script's own × 6 and × 15, because the user wanted a stronger feather.
- In JEO: `apps/web/src/masks/builtin/definitions/capcut.ts` (drawing),
  `apps/web/src/masks/components/capcut-mask-panel.tsx` (CapCut-style panel),
  export in `apps/web/src/jeo/capcut.ts` → `apps/jeo-desktop/tools/capcut_export.py`.

---

## 4. Effect packages (how CapCut effects really work)

- About 600 downloaded packages: 176 makeup, 96 fonts, 67 animations, 52 text
  templates, 51 retouch, 37 masks, 10 video effects, 7 transitions, 4 filters.
- Each is a small "Amazing" engine scene: `config.json`, `content.json`,
  `extra.json` (tunable settings with key, default, min, max; animation
  duration; a transition's default duration and whether it overlaps),
  `main.scene`, prefabs, Lua scripts (`Process.lua`, `setEffectAttr`) and GLSL
  shaders.
- **A project can only use a package that is on the PC.** JEO copies the
  material from the user's own projects (`library()` in `capcut_export.py`).
- The folder id is often **not** the resource id (Typewriter 7210980292243231233
  lives in folder 18041325; the masks in 794455087 and 794455095), and the
  folder's second part is a content hash that changes when CapCut updates the
  package. Look the path up at export time; never hard-code it.
- Some packages are Pro (VIP): Diamond Zoom and several text templates. CapCut
  may refuse to export a video that uses them without a subscription.
- Names for ids are in CapCut's cache database `Cache\ressdk_db\*\rp.db`
  (14,591 id → name entries with a Pro flag).

---

## 5. What JEO exports today (18 Nov 2026)

Cuts, trims, speed, framing, mirror, clip volume, freeze frames (as photos),
texts (words, LEMON MILK, colour, outline, box, bold/italic, alignment, size,
position, ▼ as a character), keyframes (position, scale, rotation, opacity;
video ones in source time), pop-up and emoji growth, tags that follow a person,
RGB Distort and Shake effects, the Glare II transition, sounds, masks (Circle
and Rectangle, several per clip, hidden ones left out), spotlights (one freeze
clip with Rectangle + Circle), colour flash as an "(ADD C.F)" note.
Not carried over and listed to the user: the curved arrow, other JEO effects and
transitions, crop.

## 6. Suggested next exports, most useful first

1. **Arrow and ▼ as native CapCut shapes** (`shapes`, polycon with
   `custom_points` and curve handles) so they are editable in CapCut.
2. **Text in/out animations** using the packages already on the PC (Fade, Slide,
   Bounce, Typewriter ...) instead of keyframes, when the user picks one.
3. **More transitions and effects**: white flash → White Flash, fade → Mix /
   Fade Up, zoom → Zoom Lens; JEO looks → filters or colour-adjust `effects`.
4. **Ease curves** on keyframes (`CurveInOut`), and keyframes on masks.
5. **Crop**, audio fades, blur background.

## 7. Open questions (need a test project or decompiling)

1. Why the user's video matches feather × 2/3 of the scripts (CapCut passes
   "feather" through a generic name → value list in `VECreator.dll`; no constant
   next to it).
2. Exact maths of keyframe curve handles and `keyframe_graph_list` presets.
3. Number values behind enums (`LVVE*`, `fade_type`, `align_type`).
4. Curve-speed point format.
5. Text size and stroke units (JEO uses size 12 at ~92 % measured in 9.7).
6. What a `mix_mode` effect's `value` means (probably opacity).
7. Whether CapCut 9.8 writes `new_version` 193.0.0 (save one project in 9.8 to
   check). JEO's export still opens in 9.8? Check after each CapCut update.

## 8. Ground rules (from the user)

Never modify the user's real CapCut projects; JEO only adds new "JEO …"
projects. Test projects JEO made are moved to `output\_capcut-test-drafts`.

## 9. Raw material (not in git: contains project names and PC paths)

`C:\Users\Admin\Documents\JEO Video Editor\capcut-research\`:
- `drafts-and-packages.md` — every material kind and field with examples from
  the 281 project files, all animations, every package with its settings, how
  transitions/animations/effects work, and a per-feature export table.
- `binary-vocabulary.md` — the program's vocabulary: all classes and fields,
  defaults, keyframe names, blend modes, adjust names, text keys, mask types,
  and 12 open questions.
- `videoeditor-material-fields.md`, `videoeditor-exports.txt`,
  `videoeditor-classes.json` — the REA export-table read of `videoeditor.dll`.
- `masks-section.md` — the mask notes this section is built from.
