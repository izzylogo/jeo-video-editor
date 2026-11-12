/**
 * JEO: small pictures for the timeline, taken from inside each clip.
 *
 * OpenCut shows the video's first frame on every clip. Here each clip shows
 * frames from its own part of the video (its trim and speed), so the timeline
 * reads like a filmstrip of what is actually in that clip.
 *
 * One hidden <video> per media file does the seeking, one frame at a time,
 * and every frame is cached, so it stays light on a slow laptop.
 */
import { useEffect, useState } from "react";
import type { MediaAsset } from "@/media/types";

const FRAME_HEIGHT = 96;
/** frames are taken on a 0.5 s grid so nearby requests share a picture */
const TIME_STEP = 0.5;

const cache = new Map<string, string>();
const waiting = new Map<string, Array<(url: string | null) => void>>();

interface Grabber {
	video: HTMLVideoElement;
	ready: Promise<boolean>;
	queue: Promise<void>;
}
const grabbers = new Map<string, Grabber>();

function keyOf({ assetId, time }: { assetId: string; time: number }): string {
	return `${assetId}@${time.toFixed(1)}`;
}

export function snapThumbnailTime({ time }: { time: number }): number {
	return Math.max(0, Math.round(time / TIME_STEP) * TIME_STEP);
}

function getGrabber({ asset }: { asset: MediaAsset }): Grabber | null {
	const existing = grabbers.get(asset.id);
	if (existing) return existing;
	const url = asset.url;
	if (!url || typeof document === "undefined") return null;

	const video = document.createElement("video");
	video.muted = true;
	video.preload = "auto";
	video.playsInline = true;
	video.src = url;
	const ready = new Promise<boolean>((resolve) => {
		video.addEventListener("loadeddata", () => resolve(true), { once: true });
		video.addEventListener("error", () => resolve(false), { once: true });
	});
	const grabber: Grabber = { video, ready, queue: Promise.resolve() };
	grabbers.set(asset.id, grabber);
	return grabber;
}

async function grab({
	grabber,
	time,
}: {
	grabber: Grabber;
	time: number;
}): Promise<string | null> {
	if (!(await grabber.ready)) return null;
	const { video } = grabber;
	const target = Math.min(time, Math.max(0, (video.duration || time) - 0.05));
	if (Math.abs(video.currentTime - target) > 0.01) {
		await new Promise<void>((resolve) => {
			const done = () => {
				video.removeEventListener("seeked", done);
				video.removeEventListener("error", done);
				resolve();
			};
			video.addEventListener("seeked", done);
			video.addEventListener("error", done);
			video.currentTime = target;
		});
	}
	if (!video.videoWidth || !video.videoHeight) return null;
	const canvas = document.createElement("canvas");
	canvas.height = FRAME_HEIGHT;
	canvas.width = Math.round((video.videoWidth / video.videoHeight) * FRAME_HEIGHT);
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
	return canvas.toDataURL("image/jpeg", 0.6);
}

function request({
	asset,
	time,
	onDone,
}: {
	asset: MediaAsset;
	time: number;
	onDone: (url: string | null) => void;
}): void {
	const key = keyOf({ assetId: asset.id, time });
	const cached = cache.get(key);
	if (cached) {
		onDone(cached);
		return;
	}
	const listeners = waiting.get(key);
	if (listeners) {
		listeners.push(onDone);
		return;
	}
	const grabber = getGrabber({ asset });
	if (!grabber) {
		onDone(null);
		return;
	}
	waiting.set(key, [onDone]);
	grabber.queue = grabber.queue
		.then(() => grab({ grabber, time }))
		.catch(() => null)
		.then((url) => {
			if (url) cache.set(key, url);
			for (const listener of waiting.get(key) ?? []) listener(url);
			waiting.delete(key);
		});
}

/**
 * Pictures for the given source times (seconds) of a video. Entries are null
 * until their frame has been read.
 */
export function useClipFrames({
	asset,
	times,
}: {
	asset: MediaAsset | undefined;
	times: number[];
}): Array<string | null> {
	const signature = times.map((time) => time.toFixed(1)).join(",");
	const [, bump] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `signature` stands for `times`
	useEffect(() => {
		if (!asset || asset.type !== "video") return;
		let alive = true;
		for (const time of times) {
			if (cache.has(keyOf({ assetId: asset.id, time }))) continue;
			request({
				asset,
				time,
				onDone: () => {
					if (alive) bump((count) => count + 1);
				},
			});
		}
		return () => {
			alive = false;
		};
	}, [asset, signature]);

	if (!asset) return times.map(() => null);
	return times.map(
		(time) => cache.get(keyOf({ assetId: asset.id, time })) ?? null,
	);
}
