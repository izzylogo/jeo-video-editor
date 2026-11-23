"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEditor } from "@/editor/use-editor";
import { useProjectTabs } from "@/jeo/tabs";

// JEO: no landing page. Open the most recent project, or start a new one.
export default function Home() {
	const router = useRouter();
	const editor = useEditor();
	const started = useRef(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;

		(async () => {
			try {
				// JEO: open the tabs you had open (the last one showing). No tabs:
				// go to the projects page and pick one there; never make a new
				// project by itself. If the list cannot be read, this throws and
				// the projects page says so.
				await editor.project.loadAllProjects();
				const known = new Set(editor.project.getSavedProjects().map((project) => project.id));
				const { tabs, lastActiveId, removeTab } = useProjectTabs.getState();
				// a tab whose project was deleted goes away
				for (const tab of tabs) if (!known.has(tab.id)) removeTab(tab.id);
				const open = useProjectTabs.getState().tabs;
				const id = open.find((tab) => tab.id === lastActiveId)?.id ?? open[0]?.id ?? null;
				router.replace(id ? `/editor/${id}` : "/projects");
			} catch (error) {
				console.error("Failed to open a project:", error);
				router.replace("/projects");
			}
		})();
	}, [editor, router]);

	return (
		<div className="bg-background text-muted-foreground flex h-screen w-screen items-center justify-center text-sm">
			Opening JEO Editor…
		</div>
	);
}
