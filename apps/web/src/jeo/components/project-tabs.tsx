"use client";

/**
 * JEO: project tabs in the title bar.
 *
 * Each open project is a tab. Click a tab to switch; the other project stays
 * open in the background (its undo steps are kept, and Claude can keep
 * editing it). A small icon on each tab says what Claude is doing there:
 * a spinning ring = working, a clock = waiting its turn, a tick = finished
 * (not looked at yet), a warning sign = stopped with a problem.
 */

import {
	Add01Icon,
	Alert02Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	Cancel01Icon,
	Clock01Icon,
	FolderOpenIcon,
	Tick02Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import type { TProjectMetadata } from "@/project/types";
import {
	getDesktopBridge,
	type JeoJob,
} from "@/services/desktop/bridge";
import { cn } from "@/utils/ui";
import {
	closeProjectTab,
	forgetTabMemory,
	isBackgroundEditor,
	isProjectBusy,
	leaveCurrentProject,
	newProjectTab,
	openProjectTab,
	type ProjectTab,
	restoreTabMemory,
	useJobs,
	useProjectTabs,
} from "../tabs";
import { Spinner } from "./feedback";

// ---------- runtime: keeps tabs, jobs and the open project in step ----------

/**
 * Mounted once on the editor page (main window only). Adds the open project
 * as a tab, brings back its undo steps, follows Claude's jobs and the
 * Ctrl+Tab shortcut.
 */
export function ProjectTabsRuntime() {
	const router = useRouter();
	// two plain values (a new object each time would re-render forever)
	const projectId = useEditor((editor) => editor.project.getActiveOrNull()?.metadata.id ?? null);
	const projectName = useEditor((editor) => editor.project.getActiveOrNull()?.metadata.name ?? null);

	// the open project is always a tab, with its current name
	useEffect(() => {
		if (!projectId || !projectName) return;
		const tabs = useProjectTabs.getState();
		tabs.addTab({ id: projectId, name: projectName });
		tabs.renameTab({ id: projectId, name: projectName });
	}, [projectId, projectName]);

	// once a project has opened: its undo steps and playhead come back
	useEffect(() => {
		if (!projectId) return;
		restoreTabMemory(projectId);
		const tabs = useProjectTabs.getState();
		if (tabs.switchingTo) tabs.setSwitchingTo(null);
	}, [projectId]);

	useEffect(() => {
		const desktop = getDesktopBridge();
		if (!desktop?.getJobs) return;
		let alive = true;
		void desktop.getJobs().then((state) => {
			if (alive) useJobs.getState().set(state);
		});
		const stopJobs = desktop.onJobs?.((state) => useJobs.getState().set(state));
		const stopChanged = desktop.onProjectChangedElsewhere?.(({ projectId: id }) =>
			forgetTabMemory(id),
		);
		return () => {
			alive = false;
			stopJobs?.();
			stopChanged?.();
		};
	}, []);

	// Ctrl+Tab / Ctrl+Shift+Tab = next / previous tab
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!event.ctrlKey || event.key !== "Tab") return;
			const { tabs } = useProjectTabs.getState();
			const current = EditorCore.getInstance().project.getActiveOrNull()?.metadata.id;
			const at = tabs.findIndex((tab) => tab.id === current);
			if (tabs.length < 2 || at < 0) return;
			event.preventDefault();
			const next = tabs[(at + (event.shiftKey ? -1 : 1) + tabs.length) % tabs.length];
			void openProjectTab({ id: next.id, navigate: router.push });
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [router]);

	return null;
}

// ---------- one tab ----------

function statusOf(job: JeoJob | undefined, isActive: boolean) {
	if (!job) return null;
	if (job.status === "working") return { kind: "working" as const, text: "Claude is working on this project" };
	if (job.status === "queued") {
		return {
			kind: "queued" as const,
			text: `Waiting for a free Claude (number ${job.position} in line)`,
		};
	}
	if (job.status === "error" && job.unread && !isActive) {
		return { kind: "error" as const, text: "Claude stopped with a problem. Open the tab to read it." };
	}
	if (job.status === "done" && job.unread && !isActive) {
		return { kind: "done" as const, text: "Claude finished. Open the tab to see the changes." };
	}
	return null;
}

function TabStatusIcon({ status, isSwitching }: { status: ReturnType<typeof statusOf>; isSwitching: boolean }) {
	if (isSwitching) return <Spinner className="text-muted-foreground size-3.5" />;
	if (!status) {
		return <HugeiconsIcon icon={Video01Icon} className="size-3.5 shrink-0 opacity-60" aria-hidden />;
	}
	if (status.kind === "working") return <Spinner className="text-primary size-3.5" />;
	if (status.kind === "queued") {
		return <HugeiconsIcon icon={Clock01Icon} className="text-primary size-3.5 shrink-0" aria-hidden />;
	}
	if (status.kind === "error") {
		return <HugeiconsIcon icon={Alert02Icon} className="text-destructive size-3.5 shrink-0" aria-hidden />;
	}
	return (
		<span className="bg-primary text-primary-foreground grid size-3.5 shrink-0 place-items-center rounded-full" aria-hidden>
			<HugeiconsIcon icon={Tick02Icon} className="size-2.5" strokeWidth={3} />
		</span>
	);
}

function Tab({
	tab,
	isActive,
	onOpen,
	onClose,
}: {
	tab: ProjectTab;
	isActive: boolean;
	onOpen: () => void;
	onClose: () => void;
}) {
	const job = useJobs((store) => store.state.jobs[tab.id]);
	const switchingTo = useProjectTabs((state) => state.switchingTo);
	const isSwitching = switchingTo === tab.id;
	const status = statusOf(job, isActive);
	const isBusy = job?.status === "working" || job?.status === "queued";
	const label = status ? `${tab.name}: ${status.text}` : tab.name;

	return (
		<div
			data-jeo-tab={tab.id}
			className={cn(
				"group/tab relative flex h-7 max-w-[13rem] min-w-[6.5rem] shrink-0 items-center rounded-md transition-colors duration-150",
				isActive
					? "bg-accent text-foreground"
					: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
			)}
		>
			<button
				type="button"
				role="tab"
				aria-selected={isActive}
				aria-label={label}
				title={label}
				tabIndex={isActive ? 0 : -1}
				onClick={onOpen}
				onAuxClick={(event) => {
					// middle-click closes, like a browser tab
					if (event.button === 1 && !isBusy) onClose();
				}}
				className={cn(
					"flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md pr-1 pl-2 text-xs outline-none",
					"focus-visible:ring-ring focus-visible:ring-2",
					"motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.96]",
					isActive && "font-medium",
				)}
			>
				<TabStatusIcon status={status} isSwitching={isSwitching} />
				<span className="min-w-0 truncate">{tab.name}</span>
				{status?.kind === "queued" && job && (
					<span className="text-muted-foreground shrink-0 text-[0.65rem] tabular-nums">
						#{job.position}
					</span>
				)}
			</button>
			<button
				type="button"
				onClick={onClose}
				disabled={isBusy}
				aria-label={`Close the ${tab.name} tab`}
				title={
					isBusy
						? "Claude is working on this project. Wait for it to finish, or press Stop in the AI chat."
						: "Close this tab (the project stays in Projects)"
				}
				className={cn(
					"mr-1 grid size-5 shrink-0 cursor-pointer place-items-center rounded outline-none",
					"hover:bg-foreground/10 focus-visible:ring-ring focus-visible:ring-2 focus-visible:opacity-100",
					"transition-[opacity,background-color] duration-150",
					"disabled:cursor-not-allowed disabled:opacity-0",
					isActive ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover/tab:opacity-70",
				)}
			>
				<HugeiconsIcon icon={Cancel01Icon} className="size-3" />
			</button>
		</div>
	);
}

// ---------- the tab row ----------

/** The row of project tabs, the "+" menu and the Claude counter. */
export function ProjectTabs() {
	const router = useRouter();
	const tabs = useProjectTabs((state) => state.tabs);
	const switchingTo = useProjectTabs((state) => state.switchingTo);
	const activeId = useEditor((editor) => editor.project.getActiveOrNull()?.metadata.id ?? null);
	// while a tab opens, it already looks chosen
	const shownId = switchingTo && switchingTo !== "new" ? switchingTo : activeId;
	const rowRef = useRef<HTMLDivElement>(null);
	const [canLeft, setCanLeft] = useState(false);
	const [canRight, setCanRight] = useState(false);

	const measure = useCallback(() => {
		const row = rowRef.current;
		if (!row) return;
		setCanLeft(row.scrollLeft > 2);
		setCanRight(row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
	}, []);

	useEffect(() => {
		const row = rowRef.current;
		if (!row) return;
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(row);
		row.addEventListener("scroll", measure, { passive: true });
		const onWheel = (event: WheelEvent) => {
			if (row.scrollWidth <= row.clientWidth) return;
			if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
			event.preventDefault();
			row.scrollLeft += event.deltaY;
		};
		row.addEventListener("wheel", onWheel, { passive: false });
		return () => {
			observer.disconnect();
			row.removeEventListener("scroll", measure);
			row.removeEventListener("wheel", onWheel);
		};
	}, [measure]);

	// the chosen tab is always in view
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run when tabs change
	useEffect(() => {
		const row = rowRef.current;
		const chosen = row?.querySelector<HTMLElement>(`[data-jeo-tab="${shownId}"]`);
		if (!row || !chosen) return;
		const left = chosen.offsetLeft - 24;
		const right = chosen.offsetLeft + chosen.offsetWidth + 24;
		if (left < row.scrollLeft) row.scrollTo({ left, behavior: "smooth" });
		else if (right > row.scrollLeft + row.clientWidth) {
			row.scrollTo({ left: right - row.clientWidth, behavior: "smooth" });
		}
		measure();
	}, [shownId, tabs.length, measure]);

	const navigate = useCallback((href: string) => router.push(href), [router]);

	const open = (tab: ProjectTab) => {
		if (tab.id === activeId) return;
		void openProjectTab({ id: tab.id, navigate });
	};

	const close = (tab: ProjectTab) => {
		if (isProjectBusy(useJobs.getState().state, tab.id)) return;
		void closeProjectTab({ id: tab.id, navigate });
	};

	// arrow keys move between tabs (one tab stop for the whole row)
	const onKeyDown = (event: React.KeyboardEvent) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		const buttons = [...(rowRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
		const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (at < 0) return;
		event.preventDefault();
		buttons[(at + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
	};

	const slide = (direction: -1 | 1) => {
		const row = rowRef.current;
		if (row) row.scrollBy({ left: direction * row.clientWidth * 0.6, behavior: "smooth" });
	};

	return (
		<div className="flex min-w-0 flex-1 items-center gap-1" data-jeo="project-tabs">
			<div className="relative flex min-w-0 items-center">
				{canLeft && (
					<ScrollArrow side="left" onClick={() => slide(-1)} />
				)}
				<div
					ref={rowRef}
					role="tablist"
					aria-label="Open projects"
					onKeyDown={onKeyDown}
					className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				>
					{tabs.map((tab) => (
						<Tab
							key={tab.id}
							tab={tab}
							isActive={tab.id === shownId}
							onOpen={() => open(tab)}
							onClose={() => close(tab)}
						/>
					))}
				</div>
				{canRight && (
					<ScrollArrow side="right" onClick={() => slide(1)} />
				)}
			</div>
			<AddTabMenu navigate={navigate} />
			<ClaudeCounter />
		</div>
	);
}

function ScrollArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={side === "left" ? "Show earlier tabs" : "Show more tabs"}
			title={side === "left" ? "Show earlier tabs" : "Show more tabs"}
			className={cn(
				"bg-background/95 text-muted-foreground hover:text-foreground absolute top-1/2 z-10 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md shadow-sm",
				"focus-visible:ring-ring outline-none focus-visible:ring-2 transition-colors duration-150",
				side === "left" ? "left-0" : "right-0",
			)}
		>
			<HugeiconsIcon icon={side === "left" ? ArrowLeft01Icon : ArrowRight01Icon} className="size-3.5" />
		</button>
	);
}

/** "+": start a new project, or open one you already have in a new tab. */
function AddTabMenu({ navigate }: { navigate: (href: string) => void }) {
	const tabs = useProjectTabs((state) => state.tabs);
	const switchingTo = useProjectTabs((state) => state.switchingTo);
	const [projects, setProjects] = useState<TProjectMetadata[] | null>(null);

	const loadProjects = async () => {
		try {
			const editor = EditorCore.getInstance();
			await editor.project.loadAllProjects();
			setProjects([...editor.project.getSavedProjects()]);
		} catch {
			setProjects([]);
		}
	};

	const inTabs = new Set(tabs.map((tab) => tab.id));
	const others = (projects ?? [])
		.filter((project) => !inTabs.has(project.id))
		.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
		.slice(0, 8);

	return (
		<DropdownMenu onOpenChange={(isOpen) => isOpen && void loadProjects()}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={Boolean(switchingTo)}
					aria-label="Open another project in a new tab"
					title="New tab: start a new project or open another one"
					className={cn(
						"text-muted-foreground hover:bg-accent hover:text-foreground grid size-7 shrink-0 cursor-pointer place-items-center rounded-md outline-none",
						"focus-visible:ring-ring focus-visible:ring-2 transition-colors duration-150",
						"motion-safe:transition-transform motion-safe:active:scale-[0.96] disabled:cursor-default disabled:opacity-50",
					)}
				>
					<HugeiconsIcon icon={Add01Icon} className="size-4" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuItem onClick={() => void newProjectTab({ navigate })}>
					<HugeiconsIcon icon={Add01Icon} className="size-4" />
					New project
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
					Open in a new tab
				</DropdownMenuLabel>
				{projects === null && (
					<div className="space-y-1.5 px-2 py-1.5" aria-label="Loading your projects">
						<div className="bg-accent h-3 w-40 animate-pulse rounded" />
						<div className="bg-accent h-3 w-28 animate-pulse rounded" />
					</div>
				)}
				{projects !== null && others.length === 0 && (
					<p className="text-muted-foreground px-2 py-1.5 text-xs">
						Every project is already open in a tab.
					</p>
				)}
				{others.map((project) => (
					<DropdownMenuItem
						key={project.id}
						onClick={() => void openProjectTab({ id: project.id, name: project.name, navigate })}
						title={project.name}
					>
						<HugeiconsIcon icon={Video01Icon} className="size-4 opacity-70" />
						<span className="truncate">{project.name}</span>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={async () => {
						await leaveCurrentProject();
						EditorCore.getInstance().project.closeProject();
						navigate("/projects");
					}}
				>
					<HugeiconsIcon icon={FolderOpenIcon} className="size-4" />
					All projects…
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * Shows how many Claudes are working (only while one is), and lets you choose
 * how many may work at the same time.
 */
function ClaudeCounter() {
	const { running, maxJobs, jobs } = useJobs((store) => store.state);
	const waiting = Object.values(jobs).filter((job) => job.status === "queued").length;
	if (running === 0 && waiting === 0) return null;
	const text = `${running} of ${maxJobs} Claude${maxJobs === 1 ? "" : "s"} working${waiting ? `, ${waiting} waiting` : ""}`;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					title={`${text}. Click to choose how many may work at once.`}
					aria-label={`${text}. Choose how many may work at once`}
					className={cn(
						"jeo-rise text-muted-foreground hover:bg-accent hover:text-foreground flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs outline-none",
						"focus-visible:ring-ring focus-visible:ring-2 transition-colors duration-150",
					)}
				>
					<Spinner className="text-primary size-3" />
					<span className="tabular-nums">
						{running}/{maxJobs}
					</span>
					{waiting > 0 && (
						<span className="flex items-center gap-0.5 tabular-nums">
							<HugeiconsIcon icon={Clock01Icon} className="size-3" aria-hidden />
							{waiting}
						</span>
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-60">
				<ClaudeAtOnceChoices />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** Radio choices 1–4 for "Claude at the same time" (also in the Menu). */
export function ClaudeAtOnceChoices() {
	const maxJobs = useJobs((store) => store.state.maxJobs);
	const desktop = getDesktopBridge();
	return (
		<>
			<DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
				Claude working at the same time
			</DropdownMenuLabel>
			<DropdownMenuRadioGroup
				value={String(maxJobs)}
				onValueChange={async (value) => {
					const next = await desktop?.setMaxJobs?.({ value: Number(value) }).catch(() => null);
					if (next) toast.success(`Up to ${next} Claude${next === 1 ? "" : "s"} can work at once.`);
				}}
			>
				{[1, 2, 3, 4].map((count) => (
					<DropdownMenuRadioItem key={count} value={String(count)} disabled={!desktop?.setMaxJobs}>
						<span className="tabular-nums">{count}</span>
						<span className="text-muted-foreground ml-auto text-xs">
							{count === 1 ? "one at a time" : count === 2 ? "normal" : ""}
						</span>
					</DropdownMenuRadioItem>
				))}
			</DropdownMenuRadioGroup>
			<p className="text-muted-foreground px-2 pt-1 pb-1.5 text-[0.7rem] leading-snug">
				More messages wait in line and start by themselves. Each one uses your
				Claude plan and slows this laptop a little.
			</p>
		</>
	);
}

/** True in the main window (tabs and the chat run there, not in hidden editors). */
export function useIsMainEditorWindow(): boolean {
	const [isMain, setIsMain] = useState(false);
	useEffect(() => setIsMain(!isBackgroundEditor()), []);
	return isMain;
}

/**
 * What the window shows while a tab's project opens: the title bar with the
 * tabs stays put, and grey shapes stand in for the panels.
 */
export function TabSwitchScreen({ projectId }: { projectId: string }) {
	const name = useProjectTabs((state) => state.tabs.find((tab) => tab.id === projectId)?.name);
	const block = "bg-accent/45 rounded-lg motion-safe:animate-pulse";
	return (
		<div className="bg-background flex h-screen w-screen flex-col overflow-hidden">
			<header data-jeo-titlebar className="relative flex h-10 shrink-0 items-center gap-1 px-2">
				<span className="w-[7.5rem] shrink-0" aria-hidden />
				<span aria-hidden className="bg-border mx-1 h-4 w-px shrink-0" />
				<ProjectTabs />
			</header>
			<div className="flex min-h-0 flex-1 flex-col gap-1 px-3 pb-3">
				<div className="flex min-h-0 flex-[1.35] gap-1">
					<div className={cn(block, "flex-1")} />
					<div className={cn(block, "relative grid flex-[1.6] place-items-center")}>
						<p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
							<Spinner className="size-4" />
							{name ? `Opening ${name}…` : "Opening the project…"}
						</p>
					</div>
					<div className={cn(block, "flex-1")} />
				</div>
				<div className={cn(block, "min-h-0 flex-1")} />
			</div>
		</div>
	);
}
