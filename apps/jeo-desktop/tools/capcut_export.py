"""Write a JEO Editor timeline as a NEW CapCut draft ("Open in CapCut").

  py capcut_export.py < timeline.json      (JSON on stdin, JSON result on stdout)

Safety rules:
  * Existing CapCut drafts are only READ, to learn the shape of CapCut's own
    entries (one of them is used as the pattern). They are never changed.
  * The new draft goes into its own new folder. Nothing is ever overwritten.
  * CapCut's shared index file (root_meta_info.json) is not touched; CapCut
    finds the new folder by itself the next time it starts.

CapCut can change this format in any update, which would break this export.
Tested against CapCut 9.7.
"""
import copy
import json
import os
import shutil
import sys
import time
import uuid

DRAFTS = os.path.join(os.environ.get("LOCALAPPDATA", ""), "CapCut", "User Data", "Projects", "com.lveditor.draft")
LEMON_MILK = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts", "LEMONMILK-Bold.otf")
US = 1_000_000  # CapCut counts time in microseconds


def new_id():
    return str(uuid.uuid4()).upper()


def us(seconds):
    return int(round(float(seconds) * US))


def read_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def find_pattern():
    """Newest existing draft that has a video clip and a text: (content, meta)."""
    candidates = []
    for name in os.listdir(DRAFTS):
        folder = os.path.join(DRAFTS, name)
        content = os.path.join(folder, "draft_content.json")
        meta = os.path.join(folder, "draft_meta_info.json")
        if os.path.isfile(content) and os.path.isfile(meta):
            candidates.append((os.path.getmtime(content), content, meta))
    for _, content_path, meta_path in sorted(candidates, reverse=True):
        try:
            content = read_json(content_path)
            tracks = content.get("tracks") or []
            has_video = any(t.get("type") == "video" and t.get("segments") for t in tracks)
            has_text = any(t.get("type") == "text" and t.get("segments") for t in tracks)
            if has_video and has_text and content["materials"].get("videos") and content["materials"].get("texts"):
                return content, read_json(meta_path)
        except (OSError, ValueError, KeyError):
            continue
    return None, None


def first(materials, kind, type_name=None):
    for item in materials.get(kind) or []:
        if type_name is None or item.get("type") == type_name:
            return item
    return None


def segment_pattern(content, track_type, want_clip):
    for track in content["tracks"]:
        if track.get("type") != track_type:
            continue
        for segment in track["segments"]:
            if (segment.get("clip") is not None) == want_clip:
                return track, segment
    return None, None


class Draft:
    def __init__(self, pattern, data):
        self.pattern = pattern
        self.data = data
        self.width = int(data["width"])
        self.height = int(data["height"])
        self.materials = {key: [] for key, value in pattern["materials"].items() if isinstance(value, list)}
        for key, value in pattern["materials"].items():
            if not isinstance(value, list):
                self.materials[key] = copy.deepcopy(value)
        self.tracks = []
        self.media_cache = {}
        self.warnings = []

    # ----- small helper materials every clip points at -----
    def helper(self, kind, type_name=None, fallback=None):
        source = first(self.pattern["materials"], kind, type_name) or fallback
        if source is None:
            return None
        item = copy.deepcopy(source)
        item["id"] = new_id()
        self.materials.setdefault(kind, []).append(item)
        return item

    def speed(self, value):
        item = self.helper("speeds", fallback={"type": "speed", "mode": 0, "speed": 1.0, "curve_speed": None})
        item["speed"] = float(value)
        item["mode"] = 0
        item["curve_speed"] = None
        return item["id"]

    def clip_refs(self, speed_value, with_canvas):
        refs = [self.speed(speed_value)]
        for kind, type_name in (("placeholder_infos", None),) + ((("canvases", None),) if with_canvas else ()) + (
            ("material_animations", None),
            ("sound_channel_mappings", None),
            ("vocal_separations", None),
        ):
            item = self.helper(kind, type_name)
            if item is None:
                continue
            if kind == "material_animations":
                item["animations"] = []
            refs.append(item["id"])
        return refs

    def clip_box(self, item):
        scale = float(item.get("scale", 1))
        return {
            "scale": {"x": scale, "y": scale},
            "rotation": 0.0,
            "rotation3d": [],
            # CapCut: 0,0 is the centre; 1 = half the frame; up is positive
            "transform": {
                "x": float(item.get("x", 0)) / (self.width / 2),
                "y": -float(item.get("y", 0)) / (self.height / 2),
            },
            "flip": {"vertical": False, "horizontal": False},
            "alpha": float(item.get("opacity", 1)),
        }

    def track(self, track_type, segments, overlay=False):
        source, _ = segment_pattern(self.pattern, track_type, track_type != "audio")
        track = {k: copy.deepcopy(v) for k, v in (source or {}).items() if k != "segments"}
        track.update({"id": new_id(), "type": track_type, "segments": segments, "attribute": 0, "name": "", "is_default_name": True})
        track["flag"] = 2 if overlay and track_type == "video" else 0
        index = len(self.tracks)
        for segment in segments:
            segment["track_render_index"] = index
        self.tracks.append(track)

    # ----- pictures and video -----
    def video_material(self, item):
        key = (item["path"], item["kind"])
        if key in self.media_cache:
            return self.media_cache[key]
        material = copy.deepcopy(first(self.pattern["materials"], "videos"))
        is_photo = item["kind"] == "image"
        material.update(
            {
                "id": new_id(),
                "unique_id": "",
                "type": "photo" if is_photo else "video",
                "path": item["path"].replace("\\", "/"),
                "material_name": item.get("name", os.path.basename(item["path"])),
                "duration": 10_800_000_000 if is_photo else us(item.get("mediaDuration", 0)),
                "width": int(item.get("mediaWidth") or self.width),
                "height": int(item.get("mediaHeight") or self.height),
                "has_audio": not is_photo,
                "local_material_id": "",
                "origin_material_id": "",
                "freeze": None,
            }
        )
        material["crop"] = {
            "upper_left_x": 0.0, "upper_left_y": 0.0, "upper_right_x": 1.0, "upper_right_y": 0.0,
            "lower_left_x": 0.0, "lower_left_y": 1.0, "lower_right_x": 1.0, "lower_right_y": 1.0,
        }
        self.materials["videos"].append(material)
        self.media_cache[key] = material["id"]
        return material["id"]

    def video_segment(self, item, render_index):
        _, pattern = segment_pattern(self.pattern, "video", True)
        segment = copy.deepcopy(pattern)
        speed = float(item.get("speed", 1))
        duration = us(item["duration"])
        volume = 0.0 if item.get("muted") or item["kind"] == "image" else 1.0
        segment.update(
            {
                "id": new_id(),
                "material_id": self.video_material(item),
                "source_timerange": {"start": us(item.get("sourceIn", 0)), "duration": int(round(duration * speed))},
                "target_timerange": {"start": us(item["start"]), "duration": duration},
                "speed": speed,
                "volume": volume,
                "last_nonzero_volume": 1.0,
                "clip": self.clip_box(item),
                "extra_material_refs": self.clip_refs(speed, with_canvas=True),
                "render_index": render_index,
                "keyframe_refs": [],
                "common_keyframes": [],
                "group_id": "",
                "visible": True,
            }
        )
        return segment

    # ----- texts -----
    def text_segment(self, item):
        _, pattern = segment_pattern(self.pattern, "text", True)
        material = copy.deepcopy(first(self.pattern["materials"], "texts"))
        words = item["text"] + ("\n▼" if item.get("triangle") else "")
        try:
            style = json.loads(material["content"])["styles"][0]
        except (ValueError, KeyError, IndexError):
            style = {
                "fill": {"content": {"render_type": "solid", "solid": {"color": [1, 1, 1]}}},
                "strokes": [{"content": {"render_type": "solid", "solid": {"color": [0, 0, 0]}}, "width": 0.08, "mode": 0}],
            }
        style["size"] = 12
        style["range"] = [0, len(words.encode("utf-16-le")) // 2]
        style["fill"] = {"content": {"render_type": "solid", "solid": {"color": [1, 1, 1]}}}
        if os.path.isfile(LEMON_MILK):
            style["font"] = {"path": LEMON_MILK.replace("\\", "/"), "id": ""}
        material.update(
            {
                "id": new_id(),
                "content": json.dumps({"text": words, "styles": [style]}, ensure_ascii=False),
                "recognize_text": "",
                "base_content": "",
                "text_color": "#FFFFFF",
                "font_size": 12.0,
            }
        )
        self.materials["texts"].append(material)

        refs = []
        animation = self.helper("material_animations")
        if animation is not None:
            animation["animations"] = []
            refs.append(animation["id"])
        segment = copy.deepcopy(pattern)
        # JEO size 4.2 (about 67 px on 1080 wide) matches CapCut size 12 at 120 %
        box = self.clip_box({**item, "scale": 1.2 * float(item.get("size", 4.2)) / 4.2 * float(item.get("scale", 1))})
        segment.update(
            {
                "id": new_id(),
                "material_id": material["id"],
                "source_timerange": None,
                "target_timerange": {"start": us(item["start"]), "duration": us(item["duration"])},
                "clip": box,
                "extra_material_refs": refs,
                "render_index": 14000,
                "keyframe_refs": [],
                "common_keyframes": [],
                "group_id": "",
                "visible": True,
            }
        )
        return segment

    # ----- sound -----
    def audio_segment(self, item):
        _, pattern = segment_pattern(self.pattern, "audio", False)
        source_material = first(self.pattern["materials"], "audios")
        if pattern is None or source_material is None:
            self.warnings.append("Sounds were left out (the pattern draft has no sound to copy the shape from).")
            return None
        material = copy.deepcopy(source_material)
        material.update(
            {
                "id": new_id(),
                "unique_id": "",
                "type": "extract_music",
                "name": item.get("name", os.path.basename(item["path"])),
                "path": item["path"].replace("\\", "/"),
                "duration": us(item.get("mediaDuration", item["duration"])),
                "category_name": "local",
                "wave_points": [],
                "local_material_id": "",
            }
        )
        self.materials["audios"].append(material)
        speed = float(item.get("speed", 1))
        duration = us(item["duration"])
        refs = [self.speed(speed)]
        for kind in ("placeholder_infos", "sound_channel_mappings", "vocal_separations"):
            helper = self.helper(kind)
            if helper is not None:
                refs.append(helper["id"])
        segment = copy.deepcopy(pattern)
        segment.update(
            {
                "id": new_id(),
                "material_id": material["id"],
                "source_timerange": {"start": us(item.get("sourceIn", 0)), "duration": int(round(duration * speed))},
                "target_timerange": {"start": us(item["start"]), "duration": duration},
                "speed": speed,
                "is_tone_modify": False,
                "volume": float(item.get("volume", 1)),
                "last_nonzero_volume": 1.0,
                "extra_material_refs": refs,
                "render_index": 0,
                "keyframe_refs": [],
                "common_keyframes": [],
            }
        )
        return segment


def lay_out_rows(items):
    """Things that overlap in time need separate tracks."""
    rows = []
    for item in sorted(items, key=lambda entry: entry["start"]):
        for row in rows:
            if row[-1]["start"] + row[-1]["duration"] <= item["start"] + 1e-6:
                row.append(item)
                break
        else:
            rows.append([item])
    return rows


def unique_folder(name):
    safe = "".join(ch for ch in name if ch not in '<>:"/\\|?*').strip() or "JEO export"
    candidate = f"JEO {safe}"
    number = 2
    while os.path.exists(os.path.join(DRAFTS, candidate)):
        candidate = f"JEO {safe} ({number})"
        number += 1
    return candidate


def main():
    data = json.load(sys.stdin)
    if not os.path.isdir(DRAFTS):
        return {"ok": False, "error": "CapCut's project folder was not found on this computer."}
    pattern, pattern_meta = find_pattern()
    if pattern is None:
        return {"ok": False, "error": "No existing CapCut project with a video and a text was found to use as the pattern."}

    missing = [entry["path"] for entry in data["clips"] + data.get("audio", []) if not os.path.isfile(entry["path"])]
    if missing:
        return {"ok": False, "error": f"A media file is missing: {missing[0]}"}

    draft = Draft(pattern, data)
    main_clips = [clip for clip in data["clips"] if not clip.get("overlay")]
    overlay_clips = [clip for clip in data["clips"] if clip.get("overlay")]
    draft.track("video", [draft.video_segment(clip, 0) for clip in sorted(main_clips, key=lambda c: c["start"])])
    for row in lay_out_rows(data.get("texts", [])):
        draft.track("text", [draft.text_segment(item) for item in row])
    for number, row in enumerate(lay_out_rows(overlay_clips)):
        draft.track("video", [draft.video_segment(clip, 1 + number) for clip in row], overlay=True)
    for row in lay_out_rows(data.get("audio", [])):
        segments = [segment for segment in (draft.audio_segment(item) for item in row) if segment]
        if segments:
            draft.track("audio", segments)

    duration = us(data["duration"])
    content = copy.deepcopy({key: value for key, value in pattern.items() if key not in ("materials", "tracks")})
    content.update(
        {
            "id": new_id(),
            "name": "",
            "duration": duration,
            "fps": float(data.get("fps", 30)),
            "canvas_config": {"ratio": "original", "width": draft.width, "height": draft.height, "background": None},
            "materials": draft.materials,
            "tracks": draft.tracks,
            "keyframes": {key: [] for key in (pattern.get("keyframes") or {})},
            "keyframe_graph_list": [],
            "relationships": [],
            "time_marks": None,
            "cover": None,
            "retouch_cover": None,
            "extra_info": None,
            "group_container": None,
            "lyrics_effects": [],
            "static_cover_image_path": "",
            "create_time": 0,
            "update_time": 0,
        }
    )

    folder_name = unique_folder(data.get("name", "export"))
    folder = os.path.join(DRAFTS, folder_name)
    now = int(time.time() * US)
    meta = copy.deepcopy(pattern_meta)
    meta.update(
        {
            "draft_id": new_id(),
            "draft_name": folder_name,
            "draft_fold_path": folder.replace("\\", "/"),
            "draft_root_path": DRAFTS.replace("\\", "/"),
            "draft_cover": "",
            "draft_materials": [{**entry, "value": []} for entry in pattern_meta.get("draft_materials", []) if isinstance(entry, dict)],
            "draft_materials_copied_info": [],
            "draft_segment_extra_info": [],
            "draft_removable_storage_device": "",
            "draft_timeline_materials_size_": sum(os.path.getsize(p) for p in {entry["path"] for entry in data["clips"] + data.get("audio", [])}),
            "tm_draft_create": now,
            "tm_draft_modified": now,
            "tm_draft_removed": 0,
            "tm_duration": duration,
            "cloud_draft_cover": False,
            "cloud_draft_sync": False,
            "cloud_package_completed_time": "",
            "draft_cloud_last_action_download": False,
            "draft_cloud_template_id": "",
            "tm_draft_cloud_completed": "",
            "tm_draft_cloud_entry_id": -1,
            "tm_draft_cloud_modified": 0,
            "tm_draft_cloud_parent_entry_id": -1,
            "tm_draft_cloud_space_id": -1,
            "tm_draft_cloud_user_id": -1,
        }
    )

    os.makedirs(folder)  # fails if it exists: never overwrite
    with open(os.path.join(folder, "draft_content.json"), "w", encoding="utf-8") as handle:
        json.dump(content, handle, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(folder, "draft_meta_info.json"), "w", encoding="utf-8") as handle:
        json.dump(meta, handle, ensure_ascii=False, separators=(",", ":"))
    cover = data.get("cover")
    if cover and os.path.isfile(cover):
        shutil.copyfile(cover, os.path.join(folder, "draft_cover.jpg"))

    return {
        "ok": True,
        "draftName": folder_name,
        "draftPath": folder,
        "counts": {"clips": len(data["clips"]), "texts": len(data.get("texts", [])), "audio": len(data.get("audio", []))},
        "warnings": draft.warnings,
    }


if __name__ == "__main__":
    try:
        print(json.dumps(main()))
    except Exception as error:  # noqa: BLE001 - always answer with JSON
        print(json.dumps({"ok": False, "error": f"{type(error).__name__}: {error}"}))
