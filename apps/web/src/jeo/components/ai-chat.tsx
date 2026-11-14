"use client";

import { Spinner, useElapsedSeconds } from "./feedback";
import { ChatText } from "./chat-text";
import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useEditor } from "@/editor/use-editor";
import {
	getDesktopBridge,
	type JeoChatEvent,
} from "@/services/desktop/bridge";
import { generateUUID } from "@/utils/id";
import { cn } from "@/utils/ui";

type ChatRole = "user" | "assistant" | "tool" | "error";

interface ChatMessage {
	id: string;
	role: ChatRole;
	text: string;
}

interface ChatStore {
	isOpen: boolean;
	isBusy: boolean;
	projectId: string | null;
	sessionId: string | null;
	messages: ChatMessage[];
	toggle: () => void;
	close: () => void;
	load: (args: {
		projectId: string;
		sessionId: string | null;
		messages: ChatMessage[];
	}) => void;
	add: (message: Omit<ChatMessage, "id">) => void;
	setBusy: (isBusy: boolean) => void;
	setSession: (sessionId: string | null) => void;
	clear: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
	isOpen: false,
	isBusy: false,
	projectId: null,
	sessionId: null,
	messages: [],
	toggle: () => set((state) => ({ isOpen: !state.isOpen })),
	close: () => set({ isOpen: false }),
	load: ({ projectId, sessionId, messages }) =>
		set({ projectId, sessionId, messages, isBusy: false }),
	add: (message) =>
		set((state) => {
			const last = state.messages[state.messages.length - 1];
			// Claude's text arrives in pieces; keep one bubble per reply part
			if (message.role === "tool" && last?.role === "tool") {
				return {
					messages: [
						...state.messages.slice(0, -1),
						{ ...last, text: `${last.text}\n${message.text}` },
					],
				};
			}
			return { messages: [...state.messages, { ...message, id: generateUUID() }] };
		}),
	setBusy: (isBusy) => set({ isBusy }),
	setSession: (sessionId) => set({ sessionId }),
	clear: () => set({ messages: [], sessionId: null }),
}));

function saveChat(): void {
	const { projectId, sessionId, messages } = useChatStore.getState();
	const desktop = getDesktopBridge();
	if (!desktop || !projectId) return;
	void desktop
		.writeChat({
			projectId,
			json: JSON.stringify({ sessionId, messages: messages.slice(-400) }),
		})
		.catch(() => {});
}

/**
 * Loads the project's chat and listens for Claude's replies. Mounted once for
 * the whole editor, so replies keep arriving while another tab is showing.
 */
export function AiChatRuntime() {
	const projectId = useEditor(
		(editor) => editor.project.getActiveOrNull()?.metadata.id ?? null,
	);

	useEffect(() => {
		const desktop = getDesktopBridge();
		if (!desktop || !projectId) return;
		let cancelled = false;
		void desktop
			.readChat({ projectId })
			.then((json) => {
				if (cancelled) return;
				let saved: { sessionId?: string | null; messages?: ChatMessage[] } = {};
				try {
					saved = json ? JSON.parse(json) : {};
				} catch {
					saved = {};
				}
				useChatStore.getState().load({
					projectId,
					sessionId: saved.sessionId ?? null,
					messages: Array.isArray(saved.messages) ? saved.messages : [],
				});
			})
			.catch(() => {
				if (!cancelled) {
					useChatStore.getState().load({ projectId, sessionId: null, messages: [] });
				}
			});
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	useEffect(() => {
		const desktop = getDesktopBridge();
		if (!desktop) return;
		return desktop.onChatEvent((event: JeoChatEvent) => {
			const store = useChatStore.getState();
			if (event.type === "text") {
				store.add({ role: "assistant", text: event.text });
			} else if (event.type === "tool") {
				store.add({ role: "tool", text: event.summary });
			} else {
				if (event.sessionId) store.setSession(event.sessionId);
				if (event.error) store.add({ role: "error", text: event.error });
				store.setBusy(false);
			}
			saveChat();
		});
	}, []);

	return null;
}

const EXAMPLES = [
	"Here's the storyline: … Build the edit in my style.",
	"Freeze at 1.33 with HUSBAND and *HIDING MONEY FROM WIFE*",
	"Add a funny ending on the last shot",
];

/** Send a message to Claude from anywhere in the editor. */
export async function sendChatText({ text }: { text: string }): Promise<boolean> {
	const desktop = getDesktopBridge();
	const store = useChatStore.getState();
	if (!text.trim() || store.isBusy || !desktop || !store.projectId) return false;
	store.add({ role: "user", text });
	store.setBusy(true);
	saveChat();
	const outcome = await desktop
		.chatSend({ projectId: store.projectId, text, sessionId: store.sessionId })
		.catch((error: unknown) => ({ ok: false, error: String(error) }));
	if (!outcome.ok) {
		store.add({ role: "error", text: outcome.error ?? "Could not reach Claude." });
		store.setBusy(false);
		saveChat();
		return false;
	}
	return true;
}

/** The chat itself. Lives in the left panel as the "AI" tab. */
export function AiChatView() {
	const { isBusy, messages } = useChatStore();
	const workingFor = useElapsedSeconds(isBusy);
	const [draft, setDraft] = useState("");
	const listRef = useRef<HTMLDivElement>(null);
	const desktop = getDesktopBridge();

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
	useEffect(() => {
		const list = listRef.current;
		if (list) list.scrollTop = list.scrollHeight;
	}, [messages, isBusy]);

	const send = useCallback(async () => {
		const text = draft.trim();
		const store = useChatStore.getState();
		if (!text || store.isBusy || !desktop || !store.projectId) return;
		setDraft("");
		store.add({ role: "user", text });
		store.setBusy(true);
		saveChat();
		const outcome = await desktop
			.chatSend({ projectId: store.projectId, text, sessionId: store.sessionId })
			.catch((error: unknown) => ({ ok: false, error: String(error) }));
		if (!outcome.ok) {
			store.add({ role: "error", text: outcome.error ?? "Could not reach Claude." });
			store.setBusy(false);
			saveChat();
		}
	}, [desktop, draft]);

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex h-11 shrink-0 items-center justify-between border-b pr-1 pl-3">
				<span className="text-muted-foreground text-sm">Claude</span>
				<div className="flex items-center gap-1">
					{messages.length > 0 && !isBusy && (
						<button
							type="button"
							onClick={() => {
								useChatStore.getState().clear();
								saveChat();
							}}
							className="text-muted-foreground hover:text-foreground cursor-pointer px-2 text-xs"
						>
							New chat
						</button>
					)}
				</div>
			</div>

			<div ref={listRef} className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-3">
				{!desktop && (
					<p className="text-muted-foreground text-xs">
						The AI chat works in the JEO Editor desktop app.
					</p>
				)}
				{desktop && messages.length === 0 && (
					<div className="text-muted-foreground space-y-2 text-xs">
						<p>
							Tell me the storyline, where you want the freeze, which captions
							and tags to add, or which part to change. I edit the timeline and
							you can undo anything with Ctrl+Z.
						</p>
						{EXAMPLES.map((example) => (
							<button
								key={example}
								type="button"
								onClick={() => setDraft(example)}
								className="bg-accent/60 hover:bg-accent block w-full cursor-pointer rounded p-2 text-left transition-colors duration-150"
							>
								{example}
							</button>
						))}
					</div>
				)}
				{messages.map((message, messageIndex) =>
					message.role === "tool" ? (
						<ToolSteps
							key={message.id}
							text={message.text}
							isLive={isBusy && messageIndex === messages.length - 1}
						/>
					) : (
					<div
						key={message.id}
						className={cn(
							"max-w-[92%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
							message.role === "user" &&
								"bg-primary text-primary-foreground ml-auto",
							message.role === "assistant" && "bg-accent",
							message.role === "error" &&
								"bg-destructive/15 text-destructive text-xs",
						)}
					>
						{message.role === "assistant" ? (
							<ChatText text={message.text} />
						) : (
							message.text
						)}
					</div>
					),
				)}
				{isBusy && (
					<div
						className="jeo-rise text-muted-foreground flex items-center gap-2 text-xs"
						role="status"
						data-jeo="chat-working"
					>
						<Spinner className="text-primary size-3.5" />
						Claude is working… <span className="tabular-nums">{workingFor} s</span>
					</div>
				)}
			</div>

			<div className="shrink-0 border-t p-2">
				<textarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						// keep editor shortcuts (space, S, delete…) from firing while typing
						event.stopPropagation();
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							void send();
						}
					}}
					rows={3}
					placeholder="Tell Claude what to edit…"
					disabled={!desktop}
					className="bg-input w-full resize-none rounded border p-2 text-sm outline-none"
				/>
				<div className="mt-1 flex items-center justify-between">
					<span className="text-muted-foreground text-xs">
						Enter to send · Shift+Enter for a new line
					</span>
					{isBusy ? (
						<button
							type="button"
							onClick={() => desktop?.chatStop()}
							className="bg-destructive text-destructive-foreground cursor-pointer rounded px-3 py-1 text-xs"
						>
							Stop
						</button>
					) : (
						<button
							type="button"
							onClick={() => void send()}
							disabled={!draft.trim() || !desktop}
							className="bg-primary text-primary-foreground cursor-pointer rounded px-3 py-1 text-xs disabled:opacity-50"
						>
							Send
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

/**
 * The steps Claude took ("Adjusting…", "Looking at the video…"). Shown as one
 * small line with an arrow; click it to see the whole list, click again to
 * tuck it away. Keeps the chat short.
 */
function ToolSteps({ text, isLive }: { text: string; isLive: boolean }) {
	const [isOpen, setIsOpen] = useState(false);
	const steps = text.split("\n").filter((line) => line.trim() !== "");
	if (steps.length === 0) return null;
	const latest = steps[steps.length - 1];
	const summary = isLive
		? latest
		: steps.length === 1
			? latest
			: `${steps.length} steps done`;
	return (
		<div className="text-muted-foreground max-w-full text-xs" data-jeo="chat-steps">
			<button
				type="button"
				aria-expanded={isOpen}
				onClick={() => setIsOpen((open) => !open)}
				className="hover:text-foreground flex max-w-full cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors duration-150"
			>
				<span
					aria-hidden
					className={cn(
						"inline-block text-[9px] transition-transform duration-150",
						isOpen && "rotate-90",
					)}
				>
					&#9654;
				</span>
				{isLive && <Spinner className="size-3" />}
				<span className="truncate">{summary}</span>
				{isLive && steps.length > 1 && (
					<span className="shrink-0 opacity-70">({steps.length})</span>
				)}
			</button>
			{isOpen && (
				<ol className="border-foreground/15 jeo-rise mt-1 ml-2 flex flex-col gap-0.5 border-l pl-3 leading-relaxed">
					{steps.map((step, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of lines
						<li key={index}>{step}</li>
					))}
				</ol>
			)}
		</div>
	);
}