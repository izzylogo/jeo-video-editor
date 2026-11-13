"use client";

import { useEffect, useRef, useState } from "react";
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
	setTextContent,
	toggleTriangle,
} from "../actions";
import { followHead } from "../control";
import { optionsOnElement, useTextOptions } from "../text-options";
import { sendChatText, useChatStore } from "./ai-chat";
import { SkeletonLines, Spinner, useElapsedSeconds, withWorkingNotice } from "./feedback";

/** Ask Claude for other wordings for one text; they come back as choices. */
export async function askForTextOptions({
	element,
}: {
	element: TextElement;
}): Promise<void> {
	const words = String(element.params.content ?? "").replace(/\n/g, " / ");
	const at = (element.startTime / 120000).toFixed(2);
	useTextOptions.getState().setAsking({ elementId: element.id, isAsking: true });
	const sent = await sendChatText({
		text: `Give me other options for this part: the text "${words}" (id ${element.id}, at ${at} s). Follow my storyline and my style, and look at what is on screen there. Do NOT change the edit. Call offer_text_options with 4 options so I can pick one, then tell me in one line what each option is going for.`,
	});
	if (!sent) {
		useTextOptions.getState().setAsking({ elementId: element.id, isAsking: false });
		toast.error(
			useChatStore.getState().isBusy
				? "Claude is still busy with the last request."
				: "Claude can only be reached in the JEO Editor desktop app.",
		);
	}
}

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
	const stored = useTextOptions((state) => state.options[id]);
	const offered = stored && stored.length > 0 ? stored : optionsOnElement(element);
	const wasAsked = useTextOptions((state) => state.asking[id] === true);
	const isChatBusy = useChatStore((state) => state.isBusy);
	const isAsking = wasAsked && isChatBusy;
	const askedFor = useElapsedSeconds(isAsking);
	const current = String(element.params.content ?? "");

	// say so when the wait ends: options arrived, or Claude stopped without any
	const wasAskingRef = useRef(false);
	const countWhenAskedRef = useRef(0);
	const [justArrived, setJustArrived] = useState(false);
	useEffect(() => {
		if (isAsking && !wasAskingRef.current) countWhenAskedRef.current = offered.length;
		if (!isAsking && wasAskingRef.current) {
			if (offered.length > 0 && (stored?.length ?? 0) > 0) {
				setJustArrived(true);
				toast.success(`${offered.length} options are ready. Click one to use it.`);
				window.setTimeout(() => setJustArrived(false), 900);
			} else if (wasAsked) {
				toast.message("Claude finished without new options. You can ask again.");
			}
			useTextOptions.getState().setAsking({ elementId: id, isAsking: false });
		}
		wasAskingRef.current = isAsking;
	}, [isAsking, offered.length, stored, wasAsked, id]);

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
		<div className="space-y-3 border-b px-3 py-3" data-jeo="text-options">
			<div>
				<p className="text-muted-foreground mb-1.5 text-xs">
					Other wordings for this part
				</p>
				<div className="flex flex-col gap-1.5">
					{offered.map((option) => (
						<button
							key={option}
							type="button"
							data-jeo-option
							onClick={() =>
								report(setTextContent({ elementId: id, content: option }))
							}
							className={cn(
								"cursor-pointer rounded-md px-2.5 py-1.5 text-left text-xs whitespace-pre-line transition-colors duration-150 active:scale-[0.98]",
								justArrived && "jeo-rise",
								option === current
									? "bg-secondary text-secondary-foreground"
									: "bg-accent hover:bg-accent/70",
							)}
						>
							{option}
						</button>
					))}
					{isAsking && (
						<div data-jeo="options-loading" role="status" className="jeo-rise">
							<div className="text-muted-foreground mb-1.5 flex items-center gap-2 text-xs">
								<Spinner className="text-primary size-3.5" />
								<span>
									Claude is writing options…{" "}
									<span className="tabular-nums">{askedFor} s</span>
								</span>
							</div>
							<SkeletonLines count={3} />
							<p className="text-muted-foreground mt-1.5 text-[0.68rem]">
								Usually 15 to 40 seconds. You can keep editing; they will appear
								here.
							</p>
						</div>
					)}
					<button
						type="button"
						data-jeo="ask-options"
						disabled={isAsking}
						aria-busy={isAsking}
						onClick={() => void askForTextOptions({ element })}
						className="border-primary/60 text-primary hover:bg-primary/10 cursor-pointer rounded-md border border-dashed px-2.5 py-1.5 text-left text-xs transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
					>
						{isAsking
							? "Asked. Waiting for Claude…"
							: offered.length > 0
								? "Ask Claude for more options"
								: "Ask Claude for options from the storyline"}
					</button>
				</div>
			</div>
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
				<Chip
					isOn={false}
					disabled={isBusy}
					title="For dialogue: the text stays under the speaker's mouth as they move (position keyframes)"
					onClick={() =>
						busy(async () => {
							const outcome = await withWorkingNotice({
								label: "Following the speaker through the clip. About 10 to 20 seconds.",
								// the face is ABOVE a line of dialogue, so follow the point above the text
								work: () => followHead({ id, offsetBelow: -110 }),
							});
							if (outcome.ok) toast.success("The text now follows the speaker. Ctrl+Z undoes it.");
							else toast.error(outcome.error ?? "Could not follow.");
						})
					}
				>
					Follow the speaker
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
