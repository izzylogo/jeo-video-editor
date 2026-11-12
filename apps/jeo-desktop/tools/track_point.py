"""Follow a point of the picture through a video (JEO Editor auto-follow tags).

  py track_point.py <video> <start_s> <end_s> <x> <y> <box>

Prints JSON: {"ok": true, "points": [{"t": seconds, "dx": px, "dy": px}, ...]}
dx/dy = how far the point has moved from where it started, in source pixels.

Method: optical flow (Lucas-Kanade) on corner points inside a box around the
point. The box moves with the median motion; points are re-picked when too few
survive. Light enough for a 2-core laptop.
"""
import json
import sys

import cv2
import numpy as np


def main():
    video, start, end, x, y, box = sys.argv[1], *map(float, sys.argv[2:7])
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        return {"ok": False, "error": "Could not open the video file.", "points": []}
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
    height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
    cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000.0)

    ok, frame = cap.read()
    if not ok:
        return {"ok": False, "error": "Could not read the start frame.", "points": []}
    # work at reduced size for speed
    scale = min(1.0, 640.0 / max(width, height))

    def prepare(image):
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        return cv2.resize(gray, None, fx=scale, fy=scale) if scale < 1 else gray

    def pick_points(gray, cx, cy):
        half = box * scale / 2
        mask = np.zeros_like(gray)
        x0, y0 = int(max(0, cx - half)), int(max(0, cy - half))
        x1, y1 = int(min(gray.shape[1], cx + half)), int(min(gray.shape[0], cy + half))
        if x1 - x0 < 4 or y1 - y0 < 4:
            return None
        mask[y0:y1, x0:x1] = 255
        return cv2.goodFeaturesToTrack(gray, maxCorners=60, qualityLevel=0.01, minDistance=3, mask=mask)

    prev = prepare(frame)
    cx, cy = x * scale, y * scale
    origin = (cx, cy)
    points = pick_points(prev, cx, cy)
    if points is None or len(points) < 4:
        return {"ok": False, "error": "Nothing to follow under the tag (the picture is too flat there).", "points": []}

    out = [{"t": round(start, 4), "dx": 0.0, "dy": 0.0}]
    t = start
    lk = dict(winSize=(21, 21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 20, 0.03))
    while True:
        ok, frame = cap.read()
        t += 1.0 / fps
        if not ok or t > end + 1e-6:
            break
        gray = prepare(frame)
        moved, status, _ = cv2.calcOpticalFlowPyrLK(prev, gray, points, None, **lk)
        good = status.reshape(-1) == 1 if status is not None else np.array([])
        if moved is not None and good.sum() >= 4:
            delta = (moved[good] - points[good]).reshape(-1, 2)
            step = np.median(delta, axis=0)
            # drop points that disagree with the group (background, hands, ...)
            keep = np.linalg.norm(delta - step, axis=1) < max(2.0, 0.5 * np.linalg.norm(step) + 2.0)
            cx += float(step[0])
            cy += float(step[1])
            points = moved[good][keep].reshape(-1, 1, 2)
        else:
            points = None
        cx = min(max(cx, 0), gray.shape[1] - 1)
        cy = min(max(cy, 0), gray.shape[0] - 1)
        if points is None or len(points) < 12:
            fresh = pick_points(gray, cx, cy)
            if fresh is not None and len(fresh) >= 4:
                points = fresh
            elif points is None or len(points) < 4:
                break  # lost it: keep what we have so far
        prev = gray
        out.append({"t": round(t, 4), "dx": round((cx - origin[0]) / scale, 2), "dy": round((cy - origin[1]) / scale, 2)})

    return {"ok": True, "points": out}


if __name__ == "__main__":
    try:
        print(json.dumps(main()))
    except Exception as error:  # noqa: BLE001 - report any failure as JSON
        print(json.dumps({"ok": False, "error": str(error), "points": []}))
