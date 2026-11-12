"use client";

import { useState } from "react";
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
import { type CapCutExportResult, openInCapCut } from "../capcut";

/** Header button: writes the timeline as a new CapCut draft. */
export function OpenInCapCutButton() {
	const hasProject = useEditor((editor) => !!editor.project.getActiveOrNull());
	const [isBusy, setIsBusy] = useState(false);
	const [result, setResult] = useState<CapCutExportResult | null>(null);

	if (!getDesktopBridge()) return null;

	const handleClick = async () => {
		setIsBusy(true);
		try {
			const outcome = await openInCapCut();
			if (outcome.ok) setResult(outcome);
			else toast.error(outcome.error ?? "Could not write the CapCut project.");
		} catch (error) {
			console.error("[jeo] CapCut export failed:", error);
			toast.error("Could not write the CapCut project.");
		}
		setIsBusy(false);
	};

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				className="h-8"
				disabled={!hasProject || isBusy}
				onClick={handleClick}
				title="Write this timeline as a new CapCut project, to finish hard edits there"
			>
				{isBusy ? "Writing…" : "Open in CapCut"}
			</Button>
			<Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>CapCut project created</DialogTitle>
						<DialogDescription>
							{result?.capcutWasRunning
								? "CapCut is already open. Close it and open it again, then look for this project on its home screen:"
								: "CapCut is starting. On its home screen, open this project:"}
						</DialogDescription>
					</DialogHeader>
					<DialogBody className="space-y-3">
					<p className="bg-accent rounded px-3 py-2 font-mono text-sm">
						{result?.draftName}
					</p>
					{result && result.leftOut.length > 0 && (
						<div className="text-sm">
							<p className="mb-1 font-medium">Not carried over (add these in CapCut):</p>
							<ul className="text-muted-foreground list-disc space-y-0.5 pl-5">
								{result.leftOut.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						</div>
					)}
					<p className="text-muted-foreground text-xs">
						Your existing CapCut projects were not changed. A CapCut update could
						change its project format and break this button.
					</p>
					</DialogBody>
					<DialogFooter>
						<Button onClick={() => setResult(null)}>OK</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
