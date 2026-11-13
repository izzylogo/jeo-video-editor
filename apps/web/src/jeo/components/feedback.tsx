"use client";

/**
 * Feedback for things that take time.
 *
 * Rules used across the editor:
 *  - anything that can take longer than about a third of a second says what it
 *    is doing; quick things stay silent, so nothing flashes;
 *  - a spinner means "working, length unknown"; grey placeholder lines mean
 *    "content is on its way and will appear here";
 *  - waits that can be long also count the seconds, so it never looks frozen;
 *  - every wait ends in a clear "done" or "didn't work".
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/utils/ui";

export function Spinner({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			aria-hidden="true"
			className={cn("jeo-spin size-4 shrink-0", className)}
			fill="none"
		>
			<circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.22" />
			<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
		</svg>
	);
}

/** Grey lines that stand in for content that is on its way. */
export function SkeletonLines({
	count = 3,
	className,
}: {
	count?: number;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-1.5", className)} aria-hidden="true">
			{Array.from({ length: count }, (_, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders
					key={index}
					className="jeo-shimmer h-7 rounded-md"
					style={{ width: `${[92, 78, 86, 70][index % 4]}%` }}
				/>
			))}
		</div>
	);
}

/** Seconds since `isRunning` became true (0 when it is not running). */
export function useElapsedSeconds(isRunning: boolean): number {
	const [seconds, setSeconds] = useState(0);
	useEffect(() => {
		if (!isRunning) {
			setSeconds(0);
			return;
		}
		const startedAt = Date.now();
		const timer = window.setInterval(
			() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
			500,
		);
		return () => window.clearInterval(timer);
	}, [isRunning]);
	return seconds;
}

/**
 * Runs `work`. If it is still going after `quietMs`, a small "working" notice
 * appears with `label`, and goes away when the work ends. Quick work shows
 * nothing extra. The caller still reports the final result itself.
 */
export async function withWorkingNotice<T>({
	label,
	work,
	quietMs = 350,
}: {
	label: string;
	work: () => Promise<T> | T;
	quietMs?: number;
}): Promise<T> {
	let toastId: string | number | undefined;
	const timer = window.setTimeout(() => {
		toastId = toast.loading(label);
	}, quietMs);
	try {
		return await work();
	} finally {
		window.clearTimeout(timer);
		if (toastId !== undefined) toast.dismiss(toastId);
	}
}
