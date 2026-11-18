"use client";

/**
 * JEO: point at clips in the AI chat. Select a clip on the timeline and press
 * "Reference the selected clip" (or right-click a clip → "Ask Claude about
 * this clip"). The reference shows as a chip; when the message is sent, Claude
 * gets the clip's id, kind, row and times, so it knows exactly which one you
 * mean.
 */
import { create } from "zustand";
import { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import type { TimelineElement } from "@/timeline";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";

export interface ChatRef {
	elementId: string;
	trackId: string;
	label: string;
	kind: string;
	row: string;
	start: number;
	end: number;
}

interface ChatRefsStore {
	refs: ChatRef[];
	add: (ref: ChatRef) => void;
	remove: (elementId: string) => void;
	clear: () => void;
}

export const useChatRefs = create<ChatRefsStore>((set) => ({
	refs: [],
	add: (ref) =>
		set((state) =>
			state.refs.some((item) => item.elementId === ref.elementId) ? state : { refs: [...state.refs, ref].slice(-6) },
		),
	remove: (elementId) => set((state) => ({ refs: state.refs.filter((item) => item.elementId !== elementId) })),
	clear: () => set({ refs: [] }),
}));

const TICKS = 120000;

/** Describe one clip in a few words. */
export function describeClip({ trackId, elementId }: { trackId: string; elementId: string }): ChatRef | null {
	const editor = EditorCore.getInstance();
	const tracks = editor.scenes.getActiveSceneOrNull()?.tracks;
	if (!tracks) return null;
	const all = [...tracks.overlay, tracks.main, ...tracks.audio];
	const track = all.find((item) => item.id === trackId);
	const element = track?.elements.find((item) => item.id === elementId) as TimelineElement | undefined;
	if (!track || !element) return null;
	const assets = editor.media.getAssets();
	let label = element.name;
	if (element.type === "text") label = String(element.params.content ?? element.name).replace(/\s+/g, " ").trim();
	else if ("mediaId" in element) label = assets.find((asset) => asset.id === element.mediaId)?.name ?? element.name;
	const row =
		track.id === tracks.main.id
			? "main video row"
			: tracks.audio.some((item) => item.id === track.id)
				? "sound row"
				: `overlay row ${tracks.overlay.findIndex((item) => item.id === track.id) + 1} from the top`;
	return {
		elementId,
		trackId,
		label: label.length > 40 ? `${label.slice(0, 38)}…` : label,
		kind: element.type,
		row,
		start: element.startTime / TICKS,
		end: (element.startTime + element.duration) / TICKS,
	};
}

/** The clip right-click menu: open the AI tab with this clip referenced. */
export function askClaudeAboutClip({ trackId, elementId }: { trackId: string; elementId: string }): void {
	const ref = describeClip({ trackId, elementId });
	if (!ref) return;
	useChatRefs.getState().add(ref);
	useAssetsPanelStore.getState().setActiveTab("ai");
	window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-jeo="chat-input"]')?.focus(), 150);
}

/** What Claude receives in front of the message. */
export function refsForClaude(refs: ChatRef[]): string {
	if (refs.length === 0) return "";
	const lines = refs.map(
		(ref) =>
			`- ${ref.kind} "${ref.label}" on the ${ref.row}, ${ref.start.toFixed(2)}–${ref.end.toFixed(2)} s (id ${ref.elementId})`,
	);
	return `The user is pointing at ${refs.length === 1 ? "this clip" : "these clips"} on the timeline:\n${lines.join("\n")}\n\n`;
}

/** What the chat bubble shows. */
export function refsForBubble(refs: ChatRef[]): string {
	if (refs.length === 0) return "";
	return `${refs.map((ref) => `📎 ${ref.label} (${ref.start.toFixed(1)}–${ref.end.toFixed(1)} s)`).join("\n")}\n`;
}

/** Chips above the message box, plus the "reference the selected clip" button. */
export function ChatRefsBar() {
	const refs = useChatRefs((state) => state.refs);
	const remove = useChatRefs((state) => state.remove);
	const add = useChatRefs((state) => state.add);
	const selected = useEditor((e) => e.selection.getSelectedElements());
	const addable = selected.filter((ref) => !refs.some((item) => item.elementId === ref.elementId));
	if (refs.length === 0 && addable.length === 0) return null;
	return (
		<div className="mb-1.5 flex flex-wrap items-center gap-1.5" data-jeo="chat-refs">
			{refs.map((ref) => (
				<span
					key={ref.elementId}
					data-jeo-chat-ref={ref.label}
					className="bg-primary/15 text-primary flex max-w-full items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs"
					title={`${ref.kind} on the ${ref.row}, ${ref.start.toFixed(2)}–${ref.end.toFixed(2)} s`}
				>
					<span aria-hidden>📎</span>
					<span className="truncate">{ref.label}</span>
					<span className="text-primary/70 tabular-nums">{ref.start.toFixed(1)}s</span>
					<button
						type="button"
						aria-label={`Stop referencing ${ref.label}`}
						onClick={() => remove(ref.elementId)}
						className="hover:bg-primary/20 flex size-4 cursor-pointer items-center justify-center rounded-full leading-none"
					>
						×
					</button>
				</span>
			))}
			{addable.length > 0 && (
				<button
					type="button"
					data-jeo="chat-ref-add"
					onClick={() => {
						for (const ref of addable) {
							const described = describeClip(ref);
							if (described) add(described);
						}
					}}
					className="border-primary/50 text-primary hover:bg-primary/10 cursor-pointer rounded-full border border-dashed px-2 py-0.5 text-xs"
				>
					+ Reference the selected {addable.length === 1 ? "clip" : `${addable.length} clips`}
				</button>
			)}
		</div>
	);
}
