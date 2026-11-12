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
	/** Files in `JEO Video Editor\assets\{music,sound-effects,emoji}`. */
	listAssets(): Promise<JeoAssetFile[]>;
	readAsset(args: { relPath: string }): Promise<{ data: ArrayBuffer }>;
	showAssetsFolder(args: { kind?: JeoAssetKind }): Promise<void>;
	/** Follow a point of the picture through a clip (OpenCV, source pixels). */
	trackPoint(args: {
		projectId: string;
		mediaId: string;
		start: number;
		end: number;
		x: number;
		y: number;
		box: number;
	}): Promise<{
		ok: boolean;
		error?: string;
		points: Array<{ t: number; dx: number; dy: number }>;
	}>;
	/** AI chat: runs Claude Code headless against this editor. */
	chatSend(args: {
		projectId: string;
		text: string;
		sessionId: string | null;
	}): Promise<{ ok: boolean; error?: string }>;
	chatStop(): Promise<void>;
	onChatEvent(listener: (event: JeoChatEvent) => void): () => void;
	/** Writes the timeline as a new CapCut draft and starts CapCut. */
	exportToCapCut(args: {
		projectId: string;
		data: Record<string, unknown>;
	}): Promise<{
		ok: boolean;
		error?: string;
		draftName?: string;
		warnings?: string[];
		capcutWasRunning?: boolean;
	}>;
	readChat(args: { projectId: string }): Promise<string | null>;
	writeChat(args: { projectId: string; json: string }): Promise<void>;
}

export type JeoChatEvent =
	| { type: "text"; text: string }
	| { type: "tool"; name: string; summary: string }
	| { type: "done"; sessionId: string | null; error?: string };

export type JeoAssetKind = "music" | "sound-effects" | "emoji";

export interface JeoAssetFile {
	kind: JeoAssetKind;
	name: string;
	relPath: string;
	size: number;
}

export function getDesktopBridge(): JeoDesktopBridge | null {
	if (typeof window === "undefined") return null;
	const bridge = (window as unknown as { jeoDesktop?: JeoDesktopBridge })
		.jeoDesktop;
	return bridge?.isDesktop ? bridge : null;
}
