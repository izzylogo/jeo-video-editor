"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEditor } from "@/editor/use-editor";

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
				await editor.project.loadAllProjects();
				const projects = editor.project.getFilteredAndSortedProjects({
					searchQuery: "",
					sortOption: "updatedAt-desc",
				});
				const id =
					projects[0]?.id ??
					(await editor.project.createNewProject({ name: "New project" }));
				router.replace(`/editor/${id}`);
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
