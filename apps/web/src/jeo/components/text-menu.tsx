"use client";

/**
 * The top of the right-click menu on a text in the timeline: what to use on
 * this part of the video. Same choices as the "Options" tab of the text.
 */
import { toast } from "sonner";
import {
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useEditor } from "@/editor/use-editor";
import type { TextElement } from "@/timeline";
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
import { useTextOptions } from "../text-options";
import { askForTextOptions } from "./text-quick";

function report(result: ActionResult): void {
	if (result.ok) {
		if (result.message) toast.success(result.message);
	} else {
		toast.error(result.message);
	}
}

export function TextMenuItems({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const editor = useEditor();
	const id = element.id;
	const offered = useTextOptions((state) => state.options[id]) ?? [];
	const animated = Object.keys(element.animations ?? {});
	const hasPopUp = animated.some((path) => path.startsWith("transform.scale"));
	const hasTriangle = element.params["tag.triangle"] === true;

	const select = () =>
		editor.selection.setSelectedElements({
			elements: [{ trackId, elementId: id }],
		});
	const run = (work: () => void) => (event: React.MouseEvent) => {
		event.stopPropagation();
		select();
		work();
	};

	return (
		<>
			<ContextMenuLabel className="text-muted-foreground text-xs font-normal">
				Use on this part
			</ContextMenuLabel>
			<ContextMenuSub>
				<ContextMenuSubTrigger data-jeo-menu="wordings">
					Other wordings{offered.length > 0 ? ` (${offered.length})` : ""}
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-72">
					{offered.map((option) => (
						<ContextMenuItem
							key={option}
							onClick={run(() =>
								report(setTextContent({ elementId: id, content: option })),
							)}
						>
							<span className="whitespace-pre-line">{option}</span>
						</ContextMenuItem>
					))}
					{offered.length > 0 && <ContextMenuSeparator />}
					<ContextMenuItem
						onClick={run(() => void askForTextOptions({ element }))}
					>
						{offered.length > 0
							? "Ask Claude for more options"
							: "Ask Claude for options from the storyline"}
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuSub>
				<ContextMenuSubTrigger>Place</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-56">
					<ContextMenuItem
						onClick={run(() => report(placeText({ elementId: id, place: "centre" })))}
					>
						Centre (caption)
					</ContextMenuItem>
					<ContextMenuItem
						onClick={run(() => report(placeText({ elementId: id, place: "head" })))}
					>
						On the head (tag)
					</ContextMenuItem>
					<ContextMenuItem
						onClick={run(() => report(placeText({ elementId: id, place: "speaker" })))}
					>
						By the speaker (dialogue)
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuItem onClick={run(() => report(toggleTriangle({ elementId: id })))}>
				{hasTriangle ? "Remove the ▼" : "Add a ▼ under it"}
			</ContextMenuItem>
			<ContextMenuItem
				onClick={run(() =>
					report(hasPopUp ? removePopUp({ elementId: id }) : addPopUp()),
				)}
			>
				{hasPopUp ? "Remove the pop-up" : "Make it pop up"}
			</ContextMenuItem>
			<ContextMenuItem
				onClick={run(() => {
					toast.message("Following the person…");
					void followHead({ id }).then((outcome) => {
						if (outcome.ok) toast.success("The tag now follows the person.");
						else toast.error(outcome.error ?? "Could not follow.");
					});
				})}
			>
				Follow the head
			</ContextMenuItem>
			<ContextMenuItem onClick={run(() => report(fitTextToScene({ elementId: id })))}>
				Fit to its scene
			</ContextMenuItem>
			<ContextMenuItem onClick={run(() => report(addFlashAtText({ elementId: id })))}>
				Flash here
			</ContextMenuItem>
			<ContextMenuItem
				onClick={run(() => {
					editor.playback.seek({ time: element.startTime });
					void addFreeze({ holdSeconds: 2 }).then(report);
				})}
			>
				Freeze here (2 s)
			</ContextMenuItem>
			<ContextMenuSeparator />
		</>
	);
}
