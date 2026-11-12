"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getDesktopBridge } from "@/services/desktop/bridge";

/**
 * "Update ready": appears when a newer build of JEO Editor has been made
 * while this window is open. Shows the latest whats-new lines; "Update now"
 * saves the project and restarts on the new version, "Later" tucks it into a
 * small button that stays until you update.
 */
export function UpdateNotice() {
	const [items, setItems] = useState<string[] | null>(null);
	const [isTucked, setIsTucked] = useState(false);
	const [isRestarting, setIsRestarting] = useState(false);

	useEffect(() => {
		const desktop = getDesktopBridge();
		if (!desktop) return;
		return desktop.onUpdateReady((next) => {
			setItems(next.length > 0 ? next.slice(0, 4) : ["Improvements and fixes"]);
			setIsTucked(false);
		});
	}, []);

	if (!items) return null;

	const updateNow = async () => {
		const desktop = getDesktopBridge();
		if (!desktop) return;
		setIsRestarting(true);
		// read through the window hook, so this small notice does not pull the
		// whole editor into every page
		const editor = (
			window as unknown as {
				__jeoEditor?: {
					project: {
						getActiveOrNull(): { metadata: { id: string } } | null;
						saveCurrentProject(): Promise<void>;
					};
				};
			}
		).__jeoEditor;
		const projectId = editor?.project.getActiveOrNull()?.metadata.id ?? null;
		try {
			if (editor && projectId) await editor.project.saveCurrentProject();
		} catch (error) {
			console.error("[jeo] save before update failed:", error);
		}
		await desktop.updateNow({ projectId });
	};

	if (isTucked) {
		return (
			<button
				type="button"
				onClick={() => setIsTucked(false)}
				className="bg-primary text-primary-foreground hover:bg-primary/90 fixed right-4 bottom-4 z-100 cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium shadow-lg transition-colors duration-150"
			>
				Update ready
			</button>
		);
	}

	return (
		<div
			role="status"
			className="panel bg-background fixed right-4 bottom-4 z-100 w-80 rounded-lg border p-4 shadow-2xl"
		>
			<p className="text-sm font-semibold">A new version is ready</p>
			<ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-4 text-xs">
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
			<p className="text-muted-foreground mt-3 text-xs">
				Your project is saved first and opens again after the restart.
			</p>
			<div className="mt-3 flex justify-end gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => setIsTucked(true)}
					disabled={isRestarting}
				>
					Later
				</Button>
				<Button
					size="sm"
					className="bg-primary text-primary-foreground hover:bg-primary/90"
					onClick={updateNow}
					disabled={isRestarting}
				>
					{isRestarting ? "Restarting…" : "Update now"}
				</Button>
			</div>
		</div>
	);
}
