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
	}): Promise<{ ok: boolean; error?: string; queued?: boolean; position?: number }>;
	chatStop(args?: { projectId?: string }): Promise<void>;
	/** Claude jobs (one per project, several at once). */
	getJobs?(): Promise<JeoJobsState>;
	onJobs?(listener: (state: JeoJobsState) => void): () => void;
	jobSeen?(args: { projectId: string }): Promise<void>;
	setMaxJobs?(args: { value: number }): Promise<number>;
	/** The main window tells the app which project it shows (null = switching). */
	setActiveProject?(args: { projectId: string | null }): Promise<void>;
	releaseProject?(args: { projectId: string }): Promise<boolean>;
	/** The main window saved the project it left. */
	leftProject?(args: { projectId: string }): Promise<void>;
	claimProject?(args: { projectId: string }): Promise<boolean>;
	onProjectChangedElsewhere?(listener: (info: { projectId: string }) => void): () => void;
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
	/** The merged title bar: colour of the window buttons for the current look. */
	setTitleBar?(args: { dark: boolean }): Promise<void>;
	/** Shows the File / Edit / View / Window / Help menu (Alt key). */
	showAppMenu?(): Promise<void>;
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

export type JeoChatEvent = (
	| { type: "text"; text: string }
	| { type: "tool"; name: string; summary: string }
	| { type: "done"; sessionId: string | null; error?: string }
) & { projectId?: string };

export type JeoJobStatus = "queued" | "working" | "done" | "error" | "stopped";

export interface JeoJob {
	status: JeoJobStatus;
	startedAt: number | null;
	finishedAt: number | null;
	unread: boolean;
	/** place in the queue (1 = next), 0 when not queued */
	position: number;
	error: string | null;
}

export interface JeoJobsState {
	jobs: Record<string, JeoJob>;
	maxJobs: number;
	running: number;
}

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
