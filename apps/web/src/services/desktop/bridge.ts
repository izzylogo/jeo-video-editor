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
	/** Fires when a newer build of the editor is ready; items = what's new. */
	onUpdateReady(listener: (items: string[]) => void): () => void;
	/** Restarts the app on the new build, reopening the given project. */
	updateNow(args: { projectId: string | null }): Promise<void>;
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
	/** Is there a newer version on GitHub? (only when the code is a git clone) */
	checkGitHub(): Promise<{ ok: boolean; behind?: number; items?: string[]; reason?: string }>;
	/** Download, install and build the newer version. Restart afterwards. */
	pullUpdate(): Promise<{ ok: boolean; error?: string }>;
	appInfo(): Promise<{ dataFolder: string; codeFolder: string; commit: string }>;
	onRemoteUpdate(listener: (info: { count: number; items: string[] }) => void): () => void;
	onPullProgress(listener: (stage: string) => void): () => void;
	/** Ids of projects whose folder is in projects\\_trash. */
	listTrashedProjectIds(): Promise<string[]>;
	/** Live link: read a media file a control call asked to bring in. */
	readLiveMedia(args: { filePath: string }): Promise<{ data: ArrayBuffer }>;
	/** True once CapCut has a window on screen. */
	capcutWindowOpen(): Promise<boolean>;
	/** CapCut projects on this computer (read-only), newest first. */
	capcutList(): Promise<{
		ok: boolean;
		error?: string;
		drafts?: Array<{
			name: string;
			modified: number;
			duration: number;
			cover: string;
			fromJeo: boolean;
		}>;
	}>;
	/** One CapCut project as a plan JEO can rebuild. */
	capcutPlan(args: { name: string }): Promise<{
		ok: boolean;
		error?: string;
		plan?: CapCutPlan;
	}>;
	capcutReadFile(args: { filePath: string }): Promise<{ data: ArrayBuffer }>;
	readChat(args: { projectId: string }): Promise<string | null>;
	writeChat(args: { projectId: string; json: string }): Promise<void>;
}

type Keyframes = Record<string, Array<[number, number]>>;
export interface CapCutPlan {
	name: string;
	width: number;
	height: number;
	fps: number;
	duration: number;
	clips: Array<{
		path: string;
		name: string;
		kind: "video" | "image";
		overlay: boolean;
		start: number;
		duration: number;
		sourceIn: number;
		speed: number;
		volume: number;
		scale: number;
		scaleY: number;
		x: number;
		y: number;
		rotation: number;
		opacity: number;
		mirror: boolean;
		keyframes: Keyframes;
	}>;
	texts: Array<{
		text: string;
		start: number;
		duration: number;
		x: number;
		y: number;
		rotation: number;
		opacity: number;
		fontSize: number;
		scale: number;
		triangle: boolean;
		color: string;
		stroke: boolean;
		strokeColor: string;
		bold: boolean;
		italic: boolean;
		keyframes: Keyframes;
	}>;
	audio: Array<{
		path: string;
		name: string;
		start: number;
		duration: number;
		sourceIn: number;
		speed: number;
		volume: number;
	}>;
	files: Array<{ path: string; size: number }>;
	leftOut: string[];
	missing: string[];
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
