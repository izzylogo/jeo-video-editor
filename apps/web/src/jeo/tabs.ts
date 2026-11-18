"use client";

/**
 * JEO: project tabs.
 *
 * - The tab list (id + name) is remembered between sessions.
 * - Only one project is open in the window at a time. Switching tabs saves the
 *   current project, keeps its undo steps and playhead in memory, and opens
 *   the other one. Coming back brings those undo steps back.
 * - Claude can keep working on a tab that is not showing: the desktop app runs
 *   its edits in a hidden background editor (apps/jeo-desktop/jobs.cjs).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EditorCore } from "@/core";
import type { CommandHistorySnapshot } from "@/core/managers/commands";
import type { MediaTime } from "@/wasm";
import {
	getDesktopBridge,
	type JeoJobsState,
} from "@/services/desktop/bridge";

export interface ProjectTab {
	id: string;
	name: string;
}

interface TabsStore {
	tabs: ProjectTab[];
	/** the tab being opened right now (shows a spinner on it) */
	switchingTo: string | null;
	addTab: (tab: ProjectTab) => void;
	renameTab: (tab: ProjectTab) => void;
	removeTab: (id: string) => void;
	moveTab: (args: { id: string; toIndex: number }) => void;
	setSwitchingTo: (id: string | null) => void;
}

export const useProjectTabs = create<TabsStore>()(
	persist(
		(set) => ({
			tabs: [],
			switchingTo: null,
			addTab: (tab) =>
				set((state) =>
					state.tabs.some((existing) => existing.id === tab.id)
						? state
						: { tabs: [...state.tabs, tab] },
				),
			renameTab: (tab) =>
				set((state) => ({
					tabs: state.tabs.map((existing) =>
						existing.id === tab.id && existing.name !== tab.name
							? { ...existing, name: tab.name }
							: existing,
					),
				})),
			removeTab: (id) =>
				set((state) => ({ tabs: state.tabs.filter((tab) => tab.id !== id) })),
			moveTab: ({ id, toIndex }) =>
				set((state) => {
					const from = state.tabs.findIndex((tab) => tab.id === id);
					if (from < 0) return state;
					const tabs = [...state.tabs];
					const [tab] = tabs.splice(from, 1);
					tabs.splice(Math.max(0, Math.min(tabs.length, toIndex)), 0, tab);
					return { tabs };
				}),
			setSwitchingTo: (id) => set({ switchingTo: id }),
		}),
		{
			name: "jeo-project-tabs",
			partialize: (state) => ({ tabs: state.tabs }),
		},
	),
);

// ---------- Claude jobs (from the desktop app) ----------

interface JobsStore {
	state: JeoJobsState;
	set: (state: JeoJobsState) => void;
}

export const useJobs = create<JobsStore>((set) => ({
	state: { jobs: {}, maxJobs: 2, running: 0 },
	set: (state) => set({ state }),
}));

/** Is Claude working on (or waiting to work on) this project? */
export function isProjectBusy(state: JeoJobsState, projectId: string | null): boolean {
	if (!projectId) return false;
	const status = state.jobs[projectId]?.status;
	return status === "working" || status === "queued";
}

/** This window is a hidden editor Claude uses for a tab that is not showing. */
export function isBackgroundEditor(): boolean {
	if (typeof window === "undefined") return false;
	return new URLSearchParams(window.location.search).has("bg");
}

// ---------- remembered state per tab (memory only) ----------

interface TabMemory {
	history: CommandHistorySnapshot;
	time: MediaTime;
}

const memory = new Map<string, TabMemory>();

/** Undo steps no longer fit when the project changed somewhere else. */
export function forgetTabMemory(projectId: string): void {
	memory.delete(projectId);
}

/** After a tab's project has loaded: bring its undo steps and playhead back. */
export function restoreTabMemory(projectId: string): void {
	const saved = memory.get(projectId);
	if (!saved) return;
	memory.delete(projectId);
	const editor = EditorCore.getInstance();
	editor.command.importHistory(saved.history);
	try {
		editor.playback.seek({ time: saved.time });
	} catch {
		// the project got shorter: stay where the load put the playhead
	}
}

/**
 * Saves the open project and lets go of it, so the desktop app may hand it to
 * a background editor. Keeps its undo steps for when the user comes back.
 */
export async function leaveCurrentProject(): Promise<string | null> {
	const editor = EditorCore.getInstance();
	const current = editor.project.getActiveOrNull()?.metadata.id ?? null;
	if (!current) return null;
	const desktop = getDesktopBridge();
	// stop sending Claude's edits here; wait for the ones already running
	await desktop?.releaseProject?.({ projectId: current }).catch(() => false);
	try {
		// the playhead is saved with the project, so it comes back on reopen
		const time = editor.playback.getCurrentTime();
		editor.project.setTimelineViewState({
			viewState: { ...editor.project.getTimelineViewState(), playheadTime: time },
		});
		await editor.project.prepareExit();
		await editor.save.flush();
	} catch (error) {
		console.error("Could not save before leaving the project:", error);
	}
	memory.set(current, {
		history: editor.command.exportHistory(),
		time: editor.playback.getCurrentTime(),
	});
	await desktop?.leftProject?.({ projectId: current }).catch(() => {});
	return current;
}

type Navigate = (href: string) => void;

/** Shows another project's tab (opens the project in this window). */
export async function openProjectTab({
	id,
	name,
	navigate,
}: {
	id: string;
	name?: string;
	navigate: Navigate;
}): Promise<void> {
	const tabs = useProjectTabs.getState();
	const editor = EditorCore.getInstance();
	const current = editor.project.getActiveOrNull()?.metadata.id ?? null;
	if (name) tabs.addTab({ id, name });
	if (current === id || tabs.switchingTo) return;
	tabs.setSwitchingTo(id);
	try {
		await leaveCurrentProject();
		// take the project back from a background editor (it saves first)
		await getDesktopBridge()?.claimProject?.({ projectId: id }).catch(() => false);
		navigate(`/editor/${id}`);
	} catch (error) {
		console.error("Could not switch project:", error);
		tabs.setSwitchingTo(null);
	}
}

/** Starts a new empty project in its own tab. */
export async function newProjectTab({ navigate }: { navigate: Navigate }): Promise<void> {
	const tabs = useProjectTabs.getState();
	if (tabs.switchingTo) return;
	tabs.setSwitchingTo("new");
	try {
		await leaveCurrentProject();
		const editor = EditorCore.getInstance();
		const name = nextNewName(useProjectTabs.getState().tabs);
		const id = await editor.project.createNewProject({ name });
		useProjectTabs.getState().addTab({ id, name });
		useProjectTabs.getState().setSwitchingTo(id);
		navigate(`/editor/${id}`);
	} catch (error) {
		console.error("Could not start a new project:", error);
		useProjectTabs.getState().setSwitchingTo(null);
	}
}

function nextNewName(tabs: ProjectTab[]): string {
	const used = new Set(tabs.map((tab) => tab.name));
	if (!used.has("New project")) return "New project";
	for (let n = 2; ; n++) if (!used.has(`New project ${n}`)) return `New project ${n}`;
}

/**
 * Closes a tab (the project itself stays in Projects). Closing the tab that
 * is showing opens its neighbour, or the projects page if it was the last.
 */
export async function closeProjectTab({
	id,
	navigate,
}: {
	id: string;
	navigate: Navigate;
}): Promise<void> {
	const tabs = useProjectTabs.getState();
	const editor = EditorCore.getInstance();
	const current = editor.project.getActiveOrNull()?.metadata.id ?? null;
	const index = tabs.tabs.findIndex((tab) => tab.id === id);
	if (index < 0) return;
	if (current !== id) {
		tabs.removeTab(id);
		memory.delete(id);
		return;
	}
	const neighbour = tabs.tabs[index + 1] ?? tabs.tabs[index - 1] ?? null;
	if (neighbour) {
		await openProjectTab({ id: neighbour.id, navigate });
		useProjectTabs.getState().removeTab(id);
		memory.delete(id);
		return;
	}
	await leaveCurrentProject();
	memory.delete(id);
	useProjectTabs.getState().removeTab(id);
	editor.project.closeProject();
	navigate("/projects");
}
