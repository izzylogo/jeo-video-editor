"""Read a CapCut project so JEO Editor can rebuild it. READ-ONLY: nothing in
CapCut's folders is ever changed.

  py capcut_import.py --list            -> every CapCut project, newest first
  py capcut_import.py --draft "<name>"  -> that project as a plain plan

How CapCut keeps a project (CapCut 9.x on Windows):
  %LOCALAPPDATA%/CapCut/User Data/Projects/com.lveditor.draft/<project name>/
      draft_content.json    the whole edit: "materials" (files, texts, effects)
                            and "tracks" of "segments" that point at materials
      draft_meta_info.json  name, length, when it was changed
      draft_cover.jpg       the picture shown in CapCut's project list
Times are in microseconds. A position is from the centre of the frame, where
1 is half the frame and up is positive.

The plan uses JEO's units: seconds, and pixels from the centre (down is positive).
"""
import json
import os
import sys

DRAFTS = os.path.join(os.environ.get("LOCALAPPDATA", ""), "CapCut", "User Data", "Projects", "com.lveditor.draft")
US = 1_000_000


def read_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def list_drafts():
    found = []
    if not os.path.isdir(DRAFTS):
        return {"ok": False, "error": "CapCut's project folder was not found on this computer."}
    for name in os.listdir(DRAFTS):
        folder = os.path.join(DRAFTS, name)
        content = os.path.join(folder, "draft_content.json")
        if not os.path.isfile(content):
            continue
        duration = 0
        try:
            duration = read_json(os.path.join(folder, "draft_meta_info.json")).get("tm_duration", 0) / US
        except (OSError, ValueError):
            pass
        cover = os.path.join(folder, "draft_cover.jpg")
        found.append(
            {
                "name": name,
                "modified": os.path.getmtime(content),
                "duration": round(duration, 2),
                "cover": cover if os.path.isfile(cover) else "",
                "fromJeo": name.startswith("JEO "),
            }
        )
    found.sort(key=lambda item: item["modified"], reverse=True)
    return {"ok": True, "drafts": found}


def hex_colour(rgb, fallback):
    try:
        return "#" + "".join(f"{max(0, min(255, round(float(c) * 255))):02x}" for c in rgb[:3])
    except (TypeError, ValueError):
        return fallback


def resolve_path(raw, folder):
    """Media paths are usually absolute; some point inside the project folder."""
    if not raw:
        return ""
    path = raw
    if "##" in path:  # "##_draftpath_placeholder_...##/file"
        path = os.path.join(folder, path.split("##")[-1].lstrip("/\\"))
    path = os.path.normpath(path)
    return path if os.path.isfile(path) else ""


def keyframes_of(segment, width, height, scale_factor=1.0, speed=1.0):
    kinds = {
        "KFTypeScaleX": ("scale", lambda v: v * scale_factor),
        "KFTypePositionX": ("x", lambda v: v * (width / 2)),
        "KFTypePositionY": ("y", lambda v: -v * (height / 2)),
        "KFTypeRotation": ("rotation", float),
        "KFTypeAlpha": ("opacity", float),
    }
    out = {}
    for group in segment.get("common_keyframes") or []:
        kind = kinds.get(group.get("property_type"))
        if not kind:
            continue
        name, convert = kind
        points = []
        for key in group.get("keyframe_list") or []:
            values = key.get("values") or []
            if values:
                points.append([key.get("time_offset", 0) / US / (speed or 1), convert(float(values[0]))])
        if len(points) >= 2:
            out[name] = sorted(points)
    return out


def box(segment, width, height):
    clip = segment.get("clip") or {}
    scale = clip.get("scale") or {}
    transform = clip.get("transform") or {}
    flip = clip.get("flip") or {}
    return {
        "scale": float(scale.get("x", 1)),
        "scaleY": float(scale.get("y", scale.get("x", 1))),
        "x": float(transform.get("x", 0)) * (width / 2),
        "y": -float(transform.get("y", 0)) * (height / 2),
        "rotation": float(clip.get("rotation", 0)),
        "opacity": float(clip.get("alpha", 1)),
        "mirror": bool(flip.get("horizontal")),
    }


def read_draft(name):
    folder = os.path.join(DRAFTS, name)
    path = os.path.join(folder, "draft_content.json")
    if os.path.dirname(os.path.abspath(path)) != os.path.abspath(folder) or not os.path.isfile(path):
        return {"ok": False, "error": "That CapCut project was not found."}
    try:
        content = read_json(path)
    except (OSError, ValueError):
        return {"ok": False, "error": "That CapCut project could not be read (it may be from a newer CapCut that locks its files)."}

    canvas = content.get("canvas_config") or {}
    width = int(canvas.get("width") or 1080)
    height = int(canvas.get("height") or 1920)
    materials = content.get("materials") or {}
    by_id = {}
    for kind, items in materials.items():
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict) and item.get("id"):
                    by_id[item["id"]] = (kind, item)

    clips, texts, audio, notes = [], [], [], set()
    missing = set()
    video_track_number = 0
    for track in content.get("tracks") or []:
        kind = track.get("type")
        segments = track.get("segments") or []
        if kind == "video":
            overlay = video_track_number > 0
            video_track_number += 1
            for segment in segments:
                _, material = by_id.get(segment.get("material_id"), (None, None))
                if not material:
                    continue
                file_path = resolve_path(material.get("path"), folder)
                if not file_path:
                    missing.add(material.get("material_name") or os.path.basename(material.get("path") or "a clip"))
                    continue
                target = segment.get("target_timerange") or {}
                source = segment.get("source_timerange") or {}
                speed = float(segment.get("speed") or 1) or 1.0
                is_photo = material.get("type") == "photo"
                clips.append(
                    {
                        "path": file_path,
                        "name": material.get("material_name") or os.path.basename(file_path),
                        "kind": "image" if is_photo else "video",
                        "overlay": overlay,
                        "start": target.get("start", 0) / US,
                        "duration": target.get("duration", 0) / US,
                        "sourceIn": source.get("start", 0) / US,
                        "speed": 1.0 if is_photo else speed,
                        "volume": float(segment.get("volume", 1)),
                        "mediaWidth": material.get("width") or 0,
                        "mediaHeight": material.get("height") or 0,
                        "keyframes": keyframes_of(segment, width, height, speed=speed),
                        **box(segment, width, height),
                    }
                )
                refs = {by_id.get(ref, (None, None))[0] for ref in segment.get("extra_material_refs") or []}
                if "transitions" in refs:
                    notes.add("transitions between clips")
                animation = next((by_id[ref][1] for ref in segment.get("extra_material_refs") or [] if by_id.get(ref, (None,))[0] == "material_animations"), None)
                if animation and animation.get("animations"):
                    notes.add("in/out animations on clips")
        elif kind == "text":
            for segment in segments:
                _, material = by_id.get(segment.get("material_id"), (None, None))
                if not material:
                    continue
                words, style = material.get("content") or "", {}
                try:
                    parsed = json.loads(words)
                    words = parsed.get("text", "")
                    style = (parsed.get("styles") or [{}])[0]
                except (ValueError, AttributeError):
                    pass
                if not str(words).strip():
                    continue
                triangle = False
                lines = str(words).split("\n")
                if len(lines) > 1 and lines[-1].strip() in ("▼", "▾", "🔻"):
                    triangle = True
                    words = "\n".join(lines[:-1])
                target = segment.get("target_timerange") or {}
                frame = box(segment, width, height)
                size = float(style.get("size") or material.get("font_size") or 12)
                fill = ((style.get("fill") or {}).get("content") or {}).get("solid", {}).get("color")
                strokes = style.get("strokes") or []
                stroke_colour = (((strokes[0].get("content") or {}).get("solid") or {}).get("color")) if strokes else None
                # CapCut "size 12 at 120%" is JEO's standard text (5.478 at scale 1)
                texts.append(
                    {
                        "text": words,
                        "start": target.get("start", 0) / US,
                        "duration": target.get("duration", 0) / US,
                        "x": frame["x"],
                        "y": frame["y"],
                        "rotation": frame["rotation"],
                        "opacity": frame["opacity"],
                        "fontSize": 5.478 * size / 12,
                        "scale": frame["scale"] / 1.2,
                        "triangle": triangle,
                        "color": hex_colour(fill, material.get("text_color") or "#ffffff") if fill else (material.get("text_color") or "#ffffff").lower(),
                        "stroke": bool(strokes),
                        "strokeColor": hex_colour(stroke_colour, "#000000") if stroke_colour else "#000000",
                        "bold": bool(style.get("bold")),
                        "italic": bool(style.get("italic")),
                        "keyframes": keyframes_of(segment, width, height, scale_factor=1 / 1.2),
                    }
                )
                animation = next((by_id[ref][1] for ref in segment.get("extra_material_refs") or [] if by_id.get(ref, (None,))[0] == "material_animations"), None)
                if animation and animation.get("animations"):
                    notes.add("text animations (fade, typewriter and so on)")
        elif kind == "audio":
            for segment in segments:
                _, material = by_id.get(segment.get("material_id"), (None, None))
                if not material:
                    continue
                file_path = resolve_path(material.get("path"), folder)
                if not file_path:
                    missing.add(material.get("name") or "a sound")
                    continue
                target = segment.get("target_timerange") or {}
                source = segment.get("source_timerange") or {}
                audio.append(
                    {
                        "path": file_path,
                        "name": material.get("name") or os.path.basename(file_path),
                        "start": target.get("start", 0) / US,
                        "duration": target.get("duration", 0) / US,
                        "sourceIn": source.get("start", 0) / US,
                        "speed": float(segment.get("speed") or 1) or 1.0,
                        "volume": float(segment.get("volume", 1)),
                    }
                )
        elif kind == "effect" and segments:
            notes.add("CapCut effects")
        elif kind == "sticker" and segments:
            notes.add("stickers")
        elif kind == "filter" and segments:
            notes.add("filters")
        elif kind == "adjust" and segments:
            notes.add("adjustment layers")

    files = sorted({item["path"] for item in clips + audio})
    return {
        "ok": True,
        "plan": {
            "name": name,
            "width": width,
            "height": height,
            "fps": float(content.get("fps") or 30),
            "duration": (content.get("duration") or 0) / US,
            "clips": clips,
            "texts": texts,
            "audio": audio,
            "files": [{"path": item, "size": os.path.getsize(item)} for item in files],
            "leftOut": sorted(notes),
            "missing": sorted(missing),
        },
    }


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--draft":
        result = read_draft(sys.argv[2])
    else:
        result = list_drafts()
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
