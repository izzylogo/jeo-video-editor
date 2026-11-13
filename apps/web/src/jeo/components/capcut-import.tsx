"use client";

/**
 * "Import from CapCut" on the Projects page, and the small runner inside the
 * editor that does the rebuilding once the new project is open.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { type CapCutPlan, getDesktopBridge } from "@/services/desktop/bridge";
import { cn } from "@/utils/ui";
import {
	importCapCutProject,
	queueCapCutImport,
	takeQueuedCapCutImport,
} from "../capcut-import";

interface Draft {
	name: string;
	modified: number;
	duration: number;
	cover: string;
	fromJeo: boolean;
}

function megabytes(bytes: number): string {
	return bytes > 1048576 * 1024
		? `${(bytes / 1073741824).toFixed(1)} GB`
		: `${Math.max(1, Math.round(bytes / 1048576))} MB`;
}

export function CapCutImportButton() {
	const router = useRouter();
	const editor = useEditor();
	const desktop = getDesktopBridge();
	const [isOpen, setIsOpen] = useState(false);
	const [drafts, setDrafts] = useState<Draft[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [picked, setPicked] = useState<string | null>(null);
	const [plan, setPlan] = useState<CapCutPlan | null>(null);
	const [isStarting, setIsStarting] = useState(false);

	useEffect(() => {
		if (!isOpen || !desktop) return;
		setDrafts(null);
		setError(null);
		setPicked(null);
		setPlan(null);
		void desktop.capcutList().then((result) => {
			if (result.ok && result.drafts) setDrafts(result.drafts);
			else setError(result.error ?? "CapCut's projects could not be read.");
		});
	}, [isOpen, desktop]);

	useEffect(() => {
		if (!isOpen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setIsOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [isOpen]);

	if (!desktop) return null;

	const choose = async (name: string) => {
		setPicked(name);
		setPlan(null);
		setError(null);
		const result = await desktop.capcutPlan({ name });
		if (result.ok && result.plan) setPlan(result.plan);
		else setError(result.error ?? "That project could not be read.");
	};

	const start = async () => {
		if (!picked || isStarting) return;
		setIsStarting(true);
		try {
			const projectId = await editor.project.createNewProject({
				name: picked.replace(/^JEO /, ""),
			});
			queueCapCutImport({ name: picked });
			router.push(`/editor/${projectId}`);
		} catch {
			setIsStarting(false);
			toast.error("The new project could not be created.");
		}
	};

	const shown = (drafts ?? []).filter((draft) =>
		draft.name.toLowerCase().includes(query.trim().toLowerCase()),
	);
	const totalSize = plan?.files.reduce((sum, file) => sum + file.size, 0) ?? 0;

	return (
		<>
			<Button
				variant="outline"
				className="h-10 gap-2"
				data-jeo="capcut-import"
				onClick={() => setIsOpen(true)}
				title="Bring one of your CapCut projects into JEO Editor"
			>
				<span className="text-sm font-medium">Import from CapCut</span>
			</Button>
			{isOpen && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
					role="dialog"
					aria-modal="true"
					aria-label="Import from CapCut"
				>
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes it too */}
					<div className="absolute inset-0" onClick={() => setIsOpen(false)} />
					<div
						className="bg-background relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border shadow-2xl"
						data-jeo="capcut-dialog"
					>
						<div className="flex items-center justify-between gap-4 border-b px-5 py-3">
							<div>
								<h2 className="text-base font-medium">Import from CapCut</h2>
								<p className="text-muted-foreground text-xs">
									Makes a new JEO project. Your CapCut project is only read, never
									changed.
								</p>
							</div>
							<input
								aria-label="Search CapCut projects"
								value={query}
								onChange={(event) => setQuery(event.currentTarget.value)}
								placeholder="Search"
								className="border-input bg-accent placeholder:text-muted-foreground h-8 w-48 rounded-md border px-2.5 text-xs outline-none"
							/>
						</div>
						<div className="flex min-h-0 flex-1">
							<div className="min-h-0 flex-1 overflow-y-auto p-4">
								{error && !picked && <p className="text-sm text-red-400">{error}</p>}
								{!drafts && !error && (
									<p className="text-muted-foreground text-sm">
										Looking in CapCut's project folder…
									</p>
								)}
								{drafts && shown.length === 0 && (
									<p className="text-muted-foreground text-sm">
										No CapCut project matches.
									</p>
								)}
								<div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
									{shown.map((draft) => (
										<button
											key={draft.name}
											type="button"
											data-jeo-draft={draft.name}
											onClick={() => void choose(draft.name)}
											className={cn(
												"bg-accent/40 hover:bg-accent cursor-pointer overflow-hidden rounded-md border text-left transition-colors duration-150",
												picked === draft.name
													? "border-primary ring-primary ring-1"
													: "border-transparent",
											)}
										>
											<div className="flex aspect-video items-center justify-center overflow-hidden bg-black/50">
												{draft.cover ? (
													// biome-ignore lint/performance/noImgElement: a local data picture
													<img
														src={draft.cover}
														alt=""
														className="size-full object-contain"
													/>
												) : (
													<span className="text-muted-foreground text-xs">
														No picture
													</span>
												)}
											</div>
											<div className="p-2">
												<p className="truncate text-sm">{draft.name}</p>
												<p className="text-muted-foreground text-xs tabular-nums">
													{draft.duration.toFixed(1)} s ·{" "}
													{new Date(draft.modified * 1000).toLocaleDateString()}
													{draft.fromJeo ? " · made here" : ""}
												</p>
											</div>
										</button>
									))}
								</div>
							</div>
							<aside className="w-72 shrink-0 overflow-y-auto border-l p-4">
								{!picked && (
									<p className="text-muted-foreground text-sm">
										Pick a project to see what will come across.
									</p>
								)}
								{picked && !plan && !error && (
									<p className="text-muted-foreground text-sm">Reading it…</p>
								)}
								{picked && error && <p className="text-sm text-red-400">{error}</p>}
								{plan && (
									<div className="space-y-3 text-sm" data-jeo="capcut-plan">
										<p className="font-medium break-words">{plan.name}</p>
										<ul className="text-muted-foreground space-y-1 text-xs">
											<li>
												{plan.width} × {plan.height}, {plan.duration.toFixed(1)} s
											</li>
											<li>
												{plan.clips.length} clip{plan.clips.length === 1 ? "" : "s"},{" "}
												{plan.texts.length} text{plan.texts.length === 1 ? "" : "s"},{" "}
												{plan.audio.length} sound{plan.audio.length === 1 ? "" : "s"}
											</li>
											<li>
												Copies {plan.files.length} file
												{plan.files.length === 1 ? "" : "s"}, about{" "}
												{megabytes(totalSize * 2)} of disk space
											</li>
										</ul>
										<div>
											<p className="text-xs font-medium">Comes across</p>
											<p className="text-muted-foreground text-xs">
												Cuts, speed, framing, mirror, volume, texts with their
												colour and outline, sounds, keyframe animation.
											</p>
										</div>
										{plan.leftOut.length > 0 && (
											<div>
												<p className="text-xs font-medium">Stays in CapCut</p>
												<p className="text-muted-foreground text-xs">
													{plan.leftOut.join("; ")}.
												</p>
											</div>
										)}
										{plan.missing.length > 0 && (
											<div>
												<p className="text-xs font-medium text-amber-400">
													Files that are no longer on this computer
												</p>
												<p className="text-muted-foreground text-xs break-words">
													{plan.missing.join("; ")}
												</p>
											</div>
										)}
										<p className="text-muted-foreground text-xs">
											Texts come in as LEMON MILK, your font.
										</p>
										<Button
											className="w-full"
											disabled={isStarting || plan.clips.length === 0}
											data-jeo="capcut-start"
											onClick={() => void start()}
										>
											{isStarting ? "Opening…" : "Import as a new project"}
										</Button>
									</div>
								)}
							</aside>
						</div>
						<div className="flex justify-end border-t px-5 py-2.5">
							<Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
								Close
							</Button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

/** Mounted in the editor: runs a queued import once the project is open. */
export function CapCutImportRunner() {
	const projectId = useEditor(
		(editor) => editor.project.getActiveOrNull()?.metadata.id ?? null,
	);
	const [message, setMessage] = useState<string | null>(null);
	const busyRef = useRef(false);

	useEffect(() => {
		// also reachable for automated tests
		(window as unknown as { __jeoImportCapCut?: typeof importCapCutProject }).__jeoImportCapCut =
			importCapCutProject;
		if (!projectId) return;

		const run = () => {
			if (busyRef.current) return;
			const name = takeQueuedCapCutImport();
			if (!name) return;
			busyRef.current = true;
			setMessage("Reading the CapCut project");
			void importCapCutProject({ name, onProgress: setMessage })
				.then((result) => {
					if (!result.ok) {
						toast.error(result.error ?? "The import did not work.");
						return;
					}
					toast.success(
						`Imported from CapCut: ${result.clips} clips, ${result.texts} texts, ${result.sounds} sounds.`,
						{ duration: 8000 },
					);
					const notes = [
						result.leftOut.length > 0
							? `Stayed in CapCut: ${result.leftOut.join("; ")}.`
							: "",
						result.missing.length > 0
							? `Could not be brought in: ${result.missing.join("; ")}.`
							: "",
					].filter(Boolean);
					if (notes.length > 0) toast.message(notes.join(" "), { duration: 15000 });
				})
				.catch((error) => {
					console.error("[jeo] CapCut import failed:", error);
					toast.error("The import did not work. The new project was left empty.");
				})
				.finally(() => {
					busyRef.current = false;
					setMessage(null);
				});
		};
		run();
		window.addEventListener("jeo:capcut-import-queued", run);
		return () => window.removeEventListener("jeo:capcut-import-queued", run);
	}, [projectId]);
	if (!message) return null;
	return (
		<div
			className="bg-background fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-md border px-4 py-2.5 text-sm shadow-lg"
			role="status"
			data-jeo="capcut-progress"
		>
			<span className="text-primary mr-2 font-medium">Importing from CapCut</span>
			<span className="text-muted-foreground">{message}…</span>
		</div>
	);
}
