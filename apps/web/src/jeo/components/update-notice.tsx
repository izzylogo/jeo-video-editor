"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDesktopBridge } from "@/services/desktop/bridge";
import { Spinner } from "./feedback";

type WindowEditor = {
	project: {
		getActiveOrNull(): { metadata: { id: string } } | null;
		saveCurrentProject(): Promise<void>;
	};
};

/** read through the window hook, so this small notice does not pull the whole editor into every page */
function windowEditor(): WindowEditor | undefined {
	return (window as unknown as { __jeoEditor?: WindowEditor }).__jeoEditor;
}

/**
 * Two kinds of "there is something newer":
 *
 *  - "A new version is ready": a newer build was made on THIS computer while
 *    the window was open. "Update now" saves the project and restarts.
 *  - "An update is on GitHub": the code was changed on GitHub (someone pushed).
 *    "Get update" downloads it, installs anything new, rebuilds and restarts.
 *    It shows each step, because it takes a few minutes.
 *
 * "Later" tucks either one into a small button that stays until you update.
 */
export function UpdateNotice() {
	const [local, setLocal] = useState<string[] | null>(null);
	const [remote, setRemote] = useState<{ count: number; items: string[] } | null>(null);
	const [isTucked, setIsTucked] = useState(false);
	const [isRestarting, setIsRestarting] = useState(false);
	const [pullStage, setPullStage] = useState<string | null>(null);

	useEffect(() => {
		const desktop = getDesktopBridge();
		if (!desktop) return;
		const stopLocal = desktop.onUpdateReady((next) => {
			setLocal(next.length > 0 ? next.slice(0, 4) : ["Improvements and fixes"]);
			setIsTucked(false);
		});
		const stopRemote = desktop.onRemoteUpdate?.((info) => {
			setRemote({ count: info.count, items: info.items.slice(0, 4) });
			setIsTucked(false);
		});
		const stopProgress = desktop.onPullProgress?.(setPullStage);
		return () => {
			stopLocal();
			stopRemote?.();
			stopProgress?.();
		};
	}, []);

	// a build made here already contains whatever was pulled, so it wins
	const kind = local ? "local" : remote ? "remote" : null;
	if (!kind) return null;

	const saveAndRestart = async () => {
		const desktop = getDesktopBridge();
		if (!desktop) return;
		setIsRestarting(true);
		const editor = windowEditor();
		const projectId = editor?.project.getActiveOrNull()?.metadata.id ?? null;
		try {
			if (editor && projectId) await editor.project.saveCurrentProject();
		} catch (error) {
			console.error("[jeo] save before update failed:", error);
		}
		await desktop.updateNow({ projectId });
	};

	const getFromGitHub = async () => {
		const desktop = getDesktopBridge();
		if (!desktop) return;
		setPullStage("Saving your project");
		const editor = windowEditor();
		try {
			if (editor?.project.getActiveOrNull()) await editor.project.saveCurrentProject();
		} catch (error) {
			console.error("[jeo] save before update failed:", error);
		}
		const outcome = await desktop.pullUpdate();
		if (!outcome.ok) {
			setPullStage(null);
			toast.error(outcome.error ?? "The update did not work. Nothing was changed.", {
				duration: 12000,
			});
			return;
		}
		await saveAndRestart();
	};

	const isWorking = isRestarting || pullStage !== null;

	if (isTucked && !isWorking) {
		return (
			<button
				type="button"
				onClick={() => setIsTucked(false)}
				className="bg-primary text-primary-foreground hover:bg-primary/90 fixed right-4 bottom-4 z-100 cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium shadow-lg transition-colors duration-150"
			>
				{kind === "local" ? "Update ready" : "Update on GitHub"}
			</button>
		);
	}

	const items = kind === "local" ? (local ?? []) : (remote?.items ?? []);

	return (
		<div
			role="status"
			data-jeo="update-notice"
			data-kind={kind}
			className="jeo-rise panel bg-background fixed right-4 bottom-4 z-100 w-80 rounded-lg border p-4 shadow-2xl"
		>
			<p className="text-sm font-semibold">
				{kind === "local"
					? "A new version is ready"
					: `An update is on GitHub (${remote?.count} change${remote?.count === 1 ? "" : "s"})`}
			</p>
			<ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-4 text-xs">
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
			{pullStage ? (
				<div className="mt-3 flex items-start gap-2 text-xs" data-jeo="pull-progress">
					<Spinner className="text-primary mt-0.5 size-3.5" />
					<span>
						{pullStage}…
						<span className="text-muted-foreground block">
							Keep this window open. Your projects are not touched.
						</span>
					</span>
				</div>
			) : (
				<p className="text-muted-foreground mt-3 text-xs">
					{kind === "local"
						? "Your project is saved first and opens again after the restart."
						: "It downloads, installs and rebuilds (about 3 to 8 minutes), then restarts. Your projects are not touched."}
				</p>
			)}
			<div className="mt-3 flex justify-end gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => setIsTucked(true)}
					disabled={isWorking}
				>
					Later
				</Button>
				<Button
					size="sm"
					className="bg-primary text-primary-foreground hover:bg-primary/90"
					onClick={kind === "local" ? saveAndRestart : getFromGitHub}
					disabled={isWorking}
				>
					{isWorking ? "Working…" : kind === "local" ? "Update now" : "Get update"}
				</Button>
			</div>
		</div>
	);
}
