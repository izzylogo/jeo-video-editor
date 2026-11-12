"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import type { TextElement } from "@/timeline";
import { cn } from "@/utils/ui";
import {
	type ActionResult,
	addFlashAtText,
	addFreeze,
	addPopUp,
	fitTextToScene,
	placeText,
	removePopUp,
	toggleTriangle,
} from "../actions";
import { followHead } from "../control";

function report(result: ActionResult): void {
	if (result.ok) {
		if (result.message) toast.success(result.message);
	} else {
		toast.error(result.message);
	}
}

function Chip({
	children,
	onClick,
	isOn,
	disabled,
	title,
}: {
	children: React.ReactNode;
	onClick: () => void;
	isOn?: boolean;
	disabled?: boolean;
	title?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			aria-pressed={isOn}
			className={cn(
				"cursor-pointer rounded-md px-2.5 py-1.5 text-xs transition-colors duration-150",
				"disabled:cursor-not-allowed disabled:opacity-50",
				isOn
					? "bg-secondary text-secondary-foreground"
					: "bg-accent hover:bg-accent/70",
			)}
		>
			{children}
		</button>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<p className="text-muted-foreground mb-1.5 text-xs">{label}</p>
			<div className="flex flex-wrap gap-1.5">{children}</div>
		</div>
	);
}

/**
 * Shown at the top of the properties when a text is selected: the things you
 * do to a caption or tag in your style, one click each.
 */
export function TextQuickActions({ element }: { element: TextElement }) {
	const editor = useEditor();
	const [isBusy, setIsBusy] = useState(false);
	const id = element.id;
	const hasTriangle = element.params["tag.triangle"] === true;
	const animated = Object.keys(element.animations ?? {});
	const hasPopUp = animated.some((path) => path.startsWith("transform.scale"));
	const follows = animated.some((path) => path.startsWith("transform.position"));

	const busy = async (work: () => Promise<void>) => {
		setIsBusy(true);
		try {
			await work();
		} catch (error) {
			console.error("[jeo] quick action failed:", error);
			toast.error("That didn't work. Nothing was changed.");
		}
		setIsBusy(false);
	};

	return (
		<div className="space-y-3 border-b px-3 py-3">
			<Row label="Place">
				<Chip
					title="Captions sit in the centre"
					onClick={() => report(placeText({ elementId: id, place: "centre" }))}
				>
					Centre
				</Chip>
				<Chip
					title="Tags sit on or above the head"
					onClick={() => report(placeText({ elementId: id, place: "head" }))}
				>
					On the head
				</Chip>
				<Chip
					title="Dialogue sits next to the speaker"
					onClick={() => report(placeText({ elementId: id, place: "speaker" }))}
				>
					By the speaker
				</Chip>
			</Row>
			<Row label="Style">
				<Chip
					isOn={hasTriangle}
					title="▼ under the label, for an identity tag"
					onClick={() => report(toggleTriangle({ elementId: id }))}
				>
					▼ Triangle
				</Chip>
				<Chip
					isOn={hasPopUp}
					title="(POP UP): 30% → 115% → 100% in 0.2 s"
					onClick={() =>
						report(hasPopUp ? removePopUp({ elementId: id }) : addPopUp())
					}
				>
					Pop-up
				</Chip>
				<Chip
					isOn={follows}
					disabled={isBusy}
					title="Follows the person under the tag through this clip"
					onClick={() =>
						busy(async () => {
							const outcome = await followHead({ id });
							if (outcome.ok) toast.success("The tag now follows the person.");
							else toast.error(outcome.error ?? "Could not follow.");
						})
					}
				>
					{isBusy ? "Working…" : "Follow the head"}
				</Chip>
			</Row>
			<Row label="This moment">
				<Chip
					title="Start exactly on the cut and stay until the next cut"
					onClick={() => report(fitTextToScene({ elementId: id }))}
				>
					Fit to its scene
				</Chip>
				<Chip
					title="C.F: a colour flash where this text starts"
					onClick={() => report(addFlashAtText({ elementId: id }))}
				>
					Flash here
				</Chip>
				<Chip
					disabled={isBusy}
					title="A 2-second freeze where this text starts"
					onClick={() =>
						busy(async () => {
							editor.playback.seek({ time: element.startTime });
							report(await addFreeze({ holdSeconds: 2 }));
						})
					}
				>
					Freeze here
				</Chip>
			</Row>
		</div>
	);
}
