/**
 * JEO desktop bridge. Present only when the editor runs inside the JEO Editor
 * desktop app (Electron). It mirrors projects and media into real folders:
 * `JEO Video Editor\projects\<name> [id]\project.json` + `media\`.
 */
export interface JeoDesktopBridge {
	isDesktop: true;
	writeProject(args: { id: string; name: string; json: string }): Promise<void>;
	listProjects(): Promise<Array<{ json: string }>>;
	trashProject(args: { id: string }): Promise<void>;
	writeMedia(args: {
		projectId: string;
		mediaId: string;
		fileName: string;
		metaJson: string;
		data: ArrayBuffer;
	}): Promise<void>;
	listMedia(args: {
		projectId: string;
	}): Promise<Array<{ mediaId: string; metaJson: string }>>;
	readMedia(args: {
		projectId: string;
		mediaId: string;
	}): Promise<{ data: ArrayBuffer } | null>;
	deleteMedia(args: { projectId: string; mediaId: string }): Promise<void>;
	showProjectFolder(args: { id: string }): Promise<void>;
}

export function getDesktopBridge(): JeoDesktopBridge | null {
	if (typeof window === "undefined") return null;
	const bridge = (window as unknown as { jeoDesktop?: JeoDesktopBridge })
		.jeoDesktop;
	return bridge?.isDesktop ? bridge : null;
}
