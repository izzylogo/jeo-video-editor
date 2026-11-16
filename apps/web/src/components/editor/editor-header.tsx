"use client";

import { Button } from "../ui/button";
import { useRef, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { invokeAction } from "@/actions";
import { LAYOUT_PRESETS } from "@/panels/layout";
import { usePanelStore } from "@/editor/panel-store";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { RenameProjectDialog } from "@/project/components/rename-project-dialog";
import { DeleteProjectDialog } from "@/project/components/delete-project-dialog";
import { useRouter } from "next/navigation";
import { ExportButton } from "./export-button";
import { ThemeToggle } from "../theme-toggle";
import { AccentPicker } from "../accent-picker";
import { LayoutPicker } from "./layout-picker";
import { JeoLogo } from "../jeo-logo";
import { OpenInCapCutButton } from "@/jeo/components/capcut-button";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import {
	CommandIcon,
	FolderOpenIcon,
	Logout05Icon,
} from "@hugeicons/core-free-icons";
import { getDesktopBridge } from "@/services/desktop/bridge";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShortcutsDialog } from "@/actions/components/shortcuts-dialog";
import { cn } from "@/utils/ui";

export function EditorHeader() {
	return (
		// JEO: a thin title bar like CapCut's: logo and Projects on the left, the
		// project name in the middle, the actions on the right. The category
		// tabs (Media, Audio, Text…) are on the left panel, not up here.
		<header data-jeo-titlebar className="bg-background relative flex h-10 shrink-0 items-center justify-between gap-2 px-2 max-[899px]:gap-1 max-[899px]:px-1.5">
			<div className="flex min-w-0 items-center gap-1">
				<ProjectDropdown />
				<ProjectsButton />
			</div>
			<div className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 min-[1180px]:block">
				<EditableProjectName />
			</div>
			<nav className="flex shrink-0 items-center gap-1.5">
				<div className="hidden min-[620px]:block">
					<OpenInCapCutButton />
				</div>
				<ExportButton />
				<div className="hidden min-[900px]:block">
					<LayoutPicker />
				</div>
				<AccentPicker />
				<ThemeToggle />
			</nav>
		</header>
	);
}

/**
 * JEO: "Projects" saves the open project and goes to the list of all
 * projects, where one click opens a project and "New project" starts an
 * empty one.
 */
function ProjectsButton() {
	const router = useRouter();
	const editor = useEditor();
	const [isLeaving, setIsLeaving] = useState(false);

	const goToProjects = async () => {
		if (isLeaving) return;
		setIsLeaving(true);
		try {
			await editor.project.prepareExit();
		} catch (error) {
			console.error("Failed to save before leaving the project:", error);
		} finally {
			editor.project.closeProject();
			router.push("/projects");
		}
	};

	return (
		<Button
			variant="ghost"
			size="sm"
			className="h-8 shrink-0 gap-1.5 px-2.5 text-xs font-medium"
			onClick={goToProjects}
			disabled={isLeaving}
			title="All your projects: open one, or start a new empty project"
		>
			<HugeiconsIcon icon={FolderOpenIcon} className="size-4" />
			<span className="hidden min-[520px]:inline">{isLeaving ? "Saving…" : "Projects"}</span>
		</Button>
	);
}

function ProjectDropdown() {
	const [openDialog, setOpenDialog] = useState<
		"delete" | "rename" | "shortcuts" | null
	>(null);
	const [isExiting, setIsExiting] = useState(false);
	const router = useRouter();
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());

	const handleExit = async () => {
		if (isExiting) return;
		setIsExiting(true);

		try {
			await editor.project.prepareExit();
			editor.project.closeProject();
		} catch (error) {
			console.error("Failed to prepare project exit:", error);
		} finally {
			editor.project.closeProject();
			router.push("/projects");
		}
	};

	const layout = usePanelStore((state) => state.layout);
	const applyLayout = usePanelStore((state) => state.applyLayout);
	const setActiveTab = useAssetsPanelStore((state) => state.setActiveTab);

	const handleNewProject = async () => {
		if (isExiting) return;
		setIsExiting(true);
		try {
			await editor.project.prepareExit();
		} catch (error) {
			console.error("Failed to save before starting a new project:", error);
		}
		editor.project.closeProject();
		const projectId = await editor.project.createNewProject({ name: "New project" });
		router.push(`/editor/${projectId}`);
	};

	// save first, then close the window
	const handleQuit = async () => {
		if (isExiting) return;
		setIsExiting(true);
		try {
			await editor.project.prepareExit();
		} catch (error) {
			console.error("Failed to save before quitting:", error);
		}
		window.close();
	};

	const handleSaveProjectName = async (newName: string) => {
		if (
			activeProject &&
			newName.trim() &&
			newName !== activeProject.metadata.name
		) {
			try {
				await editor.project.renameProject({
					id: activeProject.metadata.id,
					name: newName.trim(),
				});
			} catch (error) {
				toast.error("Failed to rename project", {
					description:
						error instanceof Error ? error.message : "Please try again",
				});
			} finally {
				setOpenDialog(null);
			}
		}
	};

	const handleDeleteProject = async () => {
		if (activeProject) {
			try {
				await editor.project.deleteProjects({
					ids: [activeProject.metadata.id],
				});
				router.push("/projects");
			} catch (error) {
				toast.error("Failed to delete project", {
					description:
						error instanceof Error ? error.message : "Please try again",
				});
			} finally {
				setOpenDialog(null);
			}
		}
	};

	return (
		<>
			{/* JEO: the Menu drop-down, like CapCut's */}
			<JeoLogo className="size-5 shrink-0" />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						data-jeo="main-menu"
						className="bg-accent/60 h-7 shrink-0 gap-1 rounded-md px-2.5 text-xs font-medium"
					>
						Menu
						<span aria-hidden className="text-[8px] opacity-70">
							&#9660;
						</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="z-100 w-52">
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>File</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="z-100 w-52">
							<DropdownMenuItem onClick={handleNewProject}>
								New project
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => {
									setActiveTab("media");
									window.setTimeout(
										() => window.dispatchEvent(new Event("jeo:import-media")),
										200,
									);
								}}
							>
								Import media…
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() =>
									window.setTimeout(
										() => window.dispatchEvent(new Event("jeo:open-export")),
										120,
									)
								}
							>
								Export…
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => setOpenDialog("rename")}>
								Rename project…
							</DropdownMenuItem>
							{getDesktopBridge() && activeProject && (
								<DropdownMenuItem
									onClick={() =>
										getDesktopBridge()?.showProjectFolder({
											id: activeProject.metadata.id,
										})
									}
								>
									Show project folder
								</DropdownMenuItem>
							)}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>Edit</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="z-100 w-52">
							<DropdownMenuItem onClick={() => invokeAction("undo")}>
								Undo
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => invokeAction("redo")}>
								Redo
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => invokeAction("split")}>
								Split at the playhead
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => invokeAction("copy-selected")}>
								Copy
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => invokeAction("paste-copied")}>
								Paste
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => invokeAction("duplicate-selected")}>
								Duplicate
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => invokeAction("delete-selected")}>
								Delete
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => invokeAction("select-all")}>
								Select all
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>Layout</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="z-100 w-56">
							{LAYOUT_PRESETS.map((preset) => (
								<DropdownMenuItem
									key={preset.id}
									onClick={() => applyLayout(preset.id)}
								>
									<span className="flex-1">{preset.name}</span>
									{preset.id === layout && (
										<span aria-hidden className="text-primary text-xs">
											&#10003;
										</span>
									)}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>Help</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="z-100 w-52">
							<DropdownMenuItem onClick={() => setOpenDialog("shortcuts")}>
								Keyboard shortcuts
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setActiveTab("ai")}>
								Ask Claude
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => setActiveTab("settings")}>
						Settings
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleExit} disabled={isExiting}>
						Back to projects
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleQuit} disabled={isExiting}>
						Quit
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<RenameProjectDialog
				isOpen={openDialog === "rename"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "rename" : null)}
				onConfirm={(newName) => handleSaveProjectName(newName)}
				projectName={activeProject?.metadata.name || ""}
			/>
			<DeleteProjectDialog
				isOpen={openDialog === "delete"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "delete" : null)}
				onConfirm={handleDeleteProject}
				projectNames={[activeProject?.metadata.name || ""]}
			/>
			<ShortcutsDialog
				isOpen={openDialog === "shortcuts"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "shortcuts" : null)}
			/>
		</>
	);
}

function EditableProjectName() {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const [isEditing, setIsEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const originalNameRef = useRef("");

	const projectName = activeProject?.metadata.name || "";

	const startEditing = () => {
		if (isEditing) return;
		originalNameRef.current = projectName;
		setIsEditing(true);

		requestAnimationFrame(() => {
			inputRef.current?.select();
		});
	};

	const saveEdit = async () => {
		if (!inputRef.current || !activeProject) return;
		const newName = inputRef.current.value.trim();
		setIsEditing(false);

		if (!newName) {
			inputRef.current.value = originalNameRef.current;
			return;
		}

		if (newName !== originalNameRef.current) {
			try {
				await editor.project.renameProject({
					id: activeProject.metadata.id,
					name: newName,
				});
			} catch (error) {
				toast.error("Failed to rename project", {
					description:
						error instanceof Error ? error.message : "Please try again",
				});
			}
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault();
			inputRef.current?.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			if (inputRef.current) {
				inputRef.current.value = originalNameRef.current;
				inputRef.current.setSelectionRange(0, 0);
			}
			setIsEditing(false);
			inputRef.current?.blur();
		}
	};

	return (
		<input
			ref={inputRef}
			type="text"
			defaultValue={projectName}
			readOnly={!isEditing}
			onClick={startEditing}
			onBlur={saveEdit}
			onKeyDown={handleKeyDown}
			style={{ fieldSizing: "content" }}
			className={cn(
				"text-[0.82rem] h-7 px-2 py-1 text-center font-medium rounded-sm bg-transparent outline-none cursor-pointer hover:bg-accent hover:text-accent-foreground",
				isEditing && "ring-1 ring-ring cursor-text hover:bg-transparent",
			)}
		/>
	);
}
