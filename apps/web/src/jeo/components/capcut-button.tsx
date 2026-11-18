"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEditor } from "@/editor/use-editor";
import { getDesktopBridge } from "@/services/desktop/bridge";
import { EditorCore } from "@/core";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { type CapCutExportResult, openInCapCut } from "../capcut";
import { Spinner, useElapsedSeconds } from "./feedback";

/** how long to keep looking for CapCut's window before giving up waiting */
const CAPCUT_START_LIMIT_SECONDS = 60;

/**
 * Header button: writes the timeline as a new CapCut draft.
 *
 * Feedback, start to finish:
 *  1. the button shows a spinner and the step it is on;
 *  2. the result box opens as soon as the project is written;
 *  3. if this started CapCut, the box says so with a spinner and a seconds
 *     count until CapCut's window is really on screen, then says "is open".
 */
export function OpenInCapCutButton() {
	const hasProject = useEditor((editor) => !!editor.project.getActiveOrNull());
	const [stage, setStage] = useState<string | null>(null);
	const [result, setResult] = useState<CapCutExportResult | null>(null);
	const [capcut, setCapcut] = useState<"starting" | "open" | "slow" | "was-open">("was-open");
	// a JEO draft with this name is already in CapCut: ask what to do
	const [choice, setChoice] = useState<{
		folderName: string;
		nextName: string;
		modified: number | null;
		capcutRunning: boolean;
	} | null>(null);
	const desktop = getDesktopBridge();
	const isBusy = stage !== null;
	const isStarting = result !== null && capcut === "starting";
	const waited = useElapsedSeconds(isStarting);

	// after a successful export that started CapCut: watch for its window
	useEffect(() => {
		if (!isStarting || !desktop) return;
		let isCancelled = false;
		const startedAt = Date.now();
		const check = async () => {
			if (isCancelled) return;
			const isOpen = await desktop.capcutWindowOpen().catch(() => false);
			if (isCancelled) return;
			if (isOpen) {
				setCapcut("open");
				return;
			}
			if (Date.now() - startedAt > CAPCUT_START_LIMIT_SECONDS * 1000) {
				setCapcut("slow");
				return;
			}
			window.setTimeout(check, 1500);
		};
		window.setTimeout(check, 2000);
		return () => {
			isCancelled = true;
		};
	}, [isStarting, desktop]);

	if (!desktop) return null;

	const handleClick = async () => {
		const name = EditorCore.getInstance().project.getActiveOrNull()?.metadata.name ?? "";
		const found = await desktop.capcutDraftCheck?.({ name }).catch(() => null);
		if (found?.exists) {
			setChoice(found);
			return;
		}
		await runExport("new");
	};

	const runExport = async (mode: "replace" | "new") => {
		setChoice(null);
		setStage("Starting");
		try {
			const outcome = await openInCapCut({ onStage: setStage, mode });
			if (outcome.ok) {
				setCapcut(outcome.capcutWasRunning ? "was-open" : "starting");
				setResult(outcome);
			} else {
				toast.error(outcome.error ?? "Could not write the CapCut project.");
			}
		} catch (error) {
			console.error("[jeo] CapCut export failed:", error);
			toast.error("Could not write the CapCut project. Nothing was changed.");
		}
		setStage(null);
	};

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				className="h-8 min-w-[8.2rem]"
				disabled={!hasProject || isBusy}
				aria-busy={isBusy}
				data-jeo="open-in-capcut"
				onClick={handleClick}
				title="Write this timeline as a new CapCut project, to finish hard edits there"
			>
				{isBusy ? (
					<>
						<Spinner />
						<span className="max-w-[11rem] truncate">{stage}…</span>
					</>
				) : (
					"Open in CapCut"
				)}
			</Button>
			<Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>
							{result?.replacedBackup ? "CapCut project replaced" : "CapCut project created"}
						</DialogTitle>
						<DialogDescription>
							On CapCut's home screen, open this project:
						</DialogDescription>
					</DialogHeader>
					<DialogBody className="space-y-3">
						<p className="bg-accent rounded px-3 py-2 font-mono text-sm">
							{result?.draftName}
						</p>
						<div
							className="bg-accent/50 flex items-start gap-2.5 rounded-md px-3 py-2.5 text-sm"
							role="status"
							data-jeo="capcut-status"
							data-state={capcut}
						>
							{capcut === "starting" && (
								<>
									<Spinner className="text-primary mt-0.5" />
									<span>
										CapCut is starting…{" "}
										<span className="text-muted-foreground tabular-nums">
											{waited} s
										</span>
										<span className="text-muted-foreground block text-xs">
											It usually takes 10 to 20 seconds on this laptop.
										</span>
									</span>
								</>
							)}
							{capcut === "open" && (
								<>
									<span className="jeo-confirm bg-primary mt-1.5 size-2.5 shrink-0 rounded-full" />
									<span>
										CapCut is open.
										<span className="text-muted-foreground block text-xs">
											The project is first in its list. It takes about 8 seconds to
											load once you click it.
										</span>
									</span>
								</>
							)}
							{capcut === "slow" && (
								<span>
									CapCut has not shown up yet.
									<span className="text-muted-foreground block text-xs">
										Open it from your desktop; the project is already saved there.
									</span>
								</span>
							)}
							{capcut === "was-open" && (
								<span>
									CapCut was already open.
									<span className="text-muted-foreground block text-xs">
										Close CapCut and open it again; it only reads new projects when
										it starts.
									</span>
								</span>
							)}
						</div>
						{result && result.leftOut.length > 0 && (
							<div className="text-sm">
								<p className="mb-1 font-medium">
									Not carried over (add these in CapCut):
								</p>
								<ul className="text-muted-foreground list-disc space-y-0.5 pl-5">
									{result.leftOut.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</div>
						)}
						{result?.replacedBackup && (
							<p className="text-muted-foreground text-xs">
								The old version is kept in{" "}
								<span className="font-mono">output\_capcut-replaced</span>, in case you
								want it back.
							</p>
						)}
						<p className="text-muted-foreground text-xs">
							Your own CapCut projects were not changed. A CapCut update could
							change its project format and break this button.
						</p>
					</DialogBody>
					<DialogFooter>
						<Button onClick={() => setResult(null)}>OK</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* the name is taken: replace the JEO draft, or add a numbered one */}
			<Dialog open={choice !== null} onOpenChange={(open) => !open && setChoice(null)}>
				<DialogContent className="max-w-md" data-jeo="capcut-replace-choice">
					<DialogHeader>
						<DialogTitle>Already in CapCut</DialogTitle>
						<DialogDescription>
							CapCut already has a project called{" "}
							<span className="text-foreground font-medium">{choice?.folderName}</span>
							{choice?.modified ? ` (last changed ${timeAgo(choice.modified)})` : ""}. What
							should this export do?
						</DialogDescription>
					</DialogHeader>
					<DialogBody className="space-y-2.5">
						<div className="grid gap-2">
							<ChoiceButton
								title="Replace it"
								detail="Puts this edit in its place. The old one is kept in output\_capcut-replaced, so nothing is lost."
								primary
								onClick={() => void runExport("replace")}
							/>
							<ChoiceButton
								title={`Add as "${choice?.nextName ?? ""}"`}
								detail="Keeps the old one and adds this edit next to it."
								onClick={() => void runExport("new")}
							/>
						</div>
						{choice?.capcutRunning && (
							<p className="bg-accent/60 flex items-start gap-2 rounded-md px-3 py-2 text-xs">
								<HugeiconsIcon icon={Alert02Icon} className="text-primary mt-px size-3.5 shrink-0" aria-hidden />
								<span>
									CapCut is open. If that project is open inside CapCut, go back to
									CapCut's home screen before replacing it.
								</span>
							</p>
						)}
						<p className="text-muted-foreground text-xs">
							Changes you made to the old one inside CapCut are not copied into the new one.
						</p>
					</DialogBody>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setChoice(null)}>
							Cancel
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

/** One big choice: a title in bold and a line saying what it does. */
function ChoiceButton({
	title,
	detail,
	primary = false,
	onClick,
}: {
	title: string;
	detail: string;
	primary?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={
				primary
					? "border-primary bg-primary/10 hover:bg-primary/15 focus-visible:ring-ring w-full cursor-pointer rounded-lg border px-3.5 py-2.5 text-left outline-none transition-[background-color,transform] duration-150 focus-visible:ring-2 motion-safe:active:scale-[0.98]"
					: "hover:bg-accent focus-visible:ring-ring w-full cursor-pointer rounded-lg border px-3.5 py-2.5 text-left outline-none transition-[background-color,transform] duration-150 focus-visible:ring-2 motion-safe:active:scale-[0.98]"
			}
		>
			<span className="block text-sm font-medium">{title}</span>
			<span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{detail}</span>
		</button>
	);
}

function timeAgo(ms: number): string {
	const minutes = Math.round((Date.now() - ms) / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	const days = Math.round(hours / 24);
	return `${days} day${days === 1 ? "" : "s"} ago`;
}
