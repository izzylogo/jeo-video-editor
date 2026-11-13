"use client";

/**
 * The Audio tab. Three parts:
 *  - Music and Sound effects from your assets folders: search, listen first,
 *    then add (music from 0:00 cut to the video; effects on the playhead).
 *  - "In this video": every sound on the timeline with its own volume and
 *    mute, plus one switch for all the clips' own sound.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { invokeAction } from "@/actions";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import { getDesktopBridge, type JeoAssetFile } from "@/services/desktop/bridge";
import { buildElementFromMedia } from "@/timeline/element-utils";
import type { TimelineElement, TimelineTrack } from "@/timeline";
import { TICKS_PER_SECOND } from "@/wasm";
import { cn } from "@/utils/ui";
import {
	addLibraryAudio,
	importFile,
	insertAll,
	listAssetFiles,
	playhead,
	seconds,
} from "../actions";
import { VoiceRecordButton } from "./voice-record";

type Tab = "music" | "sound-effects" | "timeline";
const MUSIC_SPEEDS = [1, 0.9, 0.8] as const;

function formatSize(bytes: number): string {
	return bytes > 1048576
		? `${(bytes / 1048576).toFixed(1)} MB`
		: `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatClock(ticks: number): string {
	const total = ticks / TICKS_PER_SECOND;
	const minutes = Math.floor(total / 60);
	return `${minutes}:${(total - minutes * 60).toFixed(1).padStart(4, "0")}`;
}

/** One sound playing at a time, straight from the assets folder. */
function useListen() {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const urlRef = useRef<string | null>(null);
	const [playing, setPlaying] = useState<string | null>(null);

	const stop = useCallback(() => {
		audioRef.current?.pause();
		audioRef.current = null;
		if (urlRef.current) URL.revokeObjectURL(urlRef.current);
		urlRef.current = null;
		setPlaying(null);
	}, []);

	const toggle = useCallback(
		async (file: JeoAssetFile) => {
			if (playing === file.relPath) {
				stop();
				return;
			}
			stop();
			const desktop = getDesktopBridge();
			if (!desktop) return;
			try {
				const { data } = await desktop.readAsset({ relPath: file.relPath });
				const url = URL.createObjectURL(new Blob([data]));
				const audio = new Audio(url);
				audio.onended = stop;
				urlRef.current = url;
				audioRef.current = audio;
				setPlaying(file.relPath);
				await audio.play();
			} catch {
				stop();
				toast.error(`Could not play ${file.name}.`);
			}
		},
		[playing, stop],
	);

	useEffect(() => stop, [stop]);
	return { playing, toggle, stop };
}

function TabButton({
	isOn,
	onClick,
	children,
	jeoId,
}: {
	isOn: boolean;
	onClick: () => void;
	children: React.ReactNode;
	jeoId: string;
}) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={isOn}
			data-jeo-audio-tab={jeoId}
			onClick={onClick}
			className={cn(
				"flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs transition-colors duration-150",
				isOn ? "bg-primary text-primary-foreground" : "hover:bg-accent",
			)}
		>
			{children}
		</button>
	);
}

export function AudioView() {
	const editor = useEditor();
	const desktop = getDesktopBridge();
	const [tab, setTab] = useState<Tab>("music");
	const [files, setFiles] = useState<JeoAssetFile[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [query, setQuery] = useState("");
	const [musicSpeed, setMusicSpeed] = useState<number>(1);
	const [busyPath, setBusyPath] = useState<string | null>(null);
	const listen = useListen();
	const fileInputRef = useRef<HTMLInputElement>(null);
	// re-read the timeline whenever it changes
	useEditor((e) => e.scenes.getActiveSceneOrNull());

	const reload = useCallback(async () => {
		setIsLoading(true);
		setFiles(await listAssetFiles());
		setIsLoading(false);
	}, []);
	useEffect(() => {
		void reload();
	}, [reload]);

	const add = async (file: JeoAssetFile) => {
		setBusyPath(file.relPath);
		listen.stop();
		try {
			const result = await addLibraryAudio({
				file,
				rate: file.kind === "music" ? musicSpeed : 1,
			});
			if (result.ok) toast.success(result.message ?? "Added.");
			else toast.error(result.message);
		} catch {
			toast.error("That didn't work. Nothing was changed.");
		}
		setBusyPath(null);
	};

	const addFromComputer = async (file: File) => {
		const asset = await importFile({ file });
		if (!asset || asset.type !== "audio" || !asset.duration) {
			toast.error(`${file.name} is not a sound file I can read.`);
			return;
		}
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: "audio",
			name: asset.name,
			duration: seconds(asset.duration),
			startTime: playhead(),
		});
		insertAll({
			items: [{ element, placement: { mode: "auto", trackType: "audio" } }],
		});
		toast.success("Sound added at the playhead.");
	};

	const shown = files
		.filter((file) => file.kind === tab)
		.filter((file) => file.name.toLowerCase().includes(query.trim().toLowerCase()));

	// ---- in this video ----
	const sceneTracks = editor.scenes.getActiveSceneOrNull()?.tracks;
	const sounds: Array<{ element: TimelineElement; track: TimelineTrack }> =
		sceneTracks?.audio.flatMap((track) =>
			track.elements.map((element) => ({ element, track })),
		) ?? [];
	const clips =
		sceneTracks?.main.elements.filter((element) => element.type === "video") ?? [];
	const allClipsMuted =
		clips.length > 0 && clips.every((clip) => clip.params.muted === true);

	const patch = (
		item: { element: TimelineElement; track: TimelineTrack },
		params: Record<string, number | boolean>,
		isPreview = false,
	) => {
		if (isPreview) {
			editor.timeline.previewElements({
				updates: [
					{ trackId: item.track.id, elementId: item.element.id, updates: { params } },
				],
			});
			return;
		}
		editor.timeline.updateElements({
			updates: [
				{
					trackId: item.track.id,
					elementId: item.element.id,
					patch: {
						params: {
							...("params" in item.element ? item.element.params : {}),
							...params,
						},
					},
				},
			],
		});
	};

	return (
		<PanelView
			title="Audio"
			actions={
				<div className="flex items-center gap-1">
					<VoiceRecordButton />
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						className="hover:bg-accent cursor-pointer rounded-md px-2 py-1 text-xs transition-colors duration-150"
						title="Add a sound file from your computer at the playhead"
					>
						Add file
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
						className="hidden"
						onChange={(event) => {
							const file = event.currentTarget.files?.[0];
							event.currentTarget.value = "";
							if (file) void addFromComputer(file);
						}}
					/>
				</div>
			}
		>
			<div data-jeo="audio-view">
				<div role="tablist" className="bg-accent/50 mb-3 flex gap-1 rounded-lg p-1">
					<TabButton jeoId="music" isOn={tab === "music"} onClick={() => setTab("music")}>
						Music
					</TabButton>
					<TabButton
						jeoId="sound-effects"
						isOn={tab === "sound-effects"}
						onClick={() => setTab("sound-effects")}
					>
						Sound effects
					</TabButton>
					<TabButton
						jeoId="timeline"
						isOn={tab === "timeline"}
						onClick={() => setTab("timeline")}
					>
						In this video{sounds.length > 0 ? ` (${sounds.length})` : ""}
					</TabButton>
				</div>

				{tab !== "timeline" && (
					<>
						<div className="mb-2 flex items-center gap-2">
							<input
								aria-label="Search sounds"
								value={query}
								onChange={(event) => setQuery(event.currentTarget.value)}
								placeholder={tab === "music" ? "Search music" : "Search sound effects"}
								className="border-input bg-accent placeholder:text-muted-foreground h-8 min-w-0 flex-1 rounded-md border px-2.5 text-xs outline-none"
							/>
							<button
								type="button"
								onClick={() => void reload()}
								className="hover:bg-accent cursor-pointer rounded-md px-2 py-1.5 text-xs transition-colors duration-150"
								title="Look in the folder again"
							>
								Refresh
							</button>
						</div>
						{tab === "music" && (
							<div className="mb-2 flex items-center gap-1 text-xs">
								<span className="text-muted-foreground mr-1">Speed when added</span>
								{MUSIC_SPEEDS.map((speed) => (
									<button
										key={speed}
										type="button"
										aria-pressed={musicSpeed === speed}
										onClick={() => setMusicSpeed(speed)}
										className={cn(
											"cursor-pointer rounded px-2 py-1 tabular-nums transition-colors duration-150",
											musicSpeed === speed
												? "bg-secondary text-secondary-foreground"
												: "hover:bg-accent",
										)}
									>
										{speed}×
									</button>
								))}
							</div>
						)}
						<p className="text-muted-foreground mb-2 text-xs">
							{tab === "music"
								? "Music starts at 0:00 and is cut to the video's length."
								: "A sound effect lands where the playhead is."}
						</p>
						<div className="flex flex-col gap-1">
							{shown.map((file) => (
								<div
									key={file.relPath}
									data-jeo-sound={file.name}
									className="bg-accent/50 hover:bg-accent flex items-center gap-2 rounded-md py-1.5 pr-1.5 pl-1.5 transition-colors duration-150"
								>
									<button
										type="button"
										title={listen.playing === file.relPath ? "Stop" : "Listen"}
										aria-label={`${listen.playing === file.relPath ? "Stop" : "Listen to"} ${file.name}`}
										onClick={() => void listen.toggle(file)}
										className={cn(
											"flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[0.65rem] transition-colors duration-150",
											listen.playing === file.relPath
												? "bg-primary text-primary-foreground"
												: "bg-background hover:bg-background/70",
										)}
									>
										{listen.playing === file.relPath ? "■" : "▶"}
									</button>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm">
											{file.name.replace(/\.[^.]+$/, "")}
										</span>
										<span className="text-muted-foreground block text-[0.68rem]">
											{formatSize(file.size)}
										</span>
									</span>
									<button
										type="button"
										disabled={busyPath !== null}
										onClick={() => void add(file)}
										className="bg-primary text-primary-foreground shrink-0 cursor-pointer rounded-md px-2.5 py-1 text-xs transition-opacity duration-150 hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
									>
										{busyPath === file.relPath ? "Adding…" : "Add"}
									</button>
								</div>
							))}
						</div>
						{shown.length === 0 && (
							<div className="border-border rounded-md border border-dashed p-4 text-center">
								<p className="text-sm">
									{isLoading
										? "Looking…"
										: query
											? "Nothing matches that search."
											: tab === "music"
												? "No music yet"
												: "No sound effects yet"}
								</p>
								{!isLoading && !query && (
									<p className="text-muted-foreground mt-1 text-xs">
										Put mp3 or wav files in the folder and press Refresh, or use
										"Add file" above for a one-off sound.
									</p>
								)}
							</div>
						)}
						{desktop && (
							<button
								type="button"
								onClick={() => desktop.showAssetsFolder({ kind: tab })}
								className="text-muted-foreground hover:text-foreground mt-3 cursor-pointer text-xs underline-offset-2 hover:underline"
							>
								Open the {tab === "music" ? "music" : "sound-effects"} folder
							</button>
						)}
						{!desktop && (
							<p className="text-muted-foreground mt-3 text-xs">
								The music and sound library works in the JEO Editor desktop app.
							</p>
						)}
					</>
				)}

				{tab === "timeline" && (
					<div className="flex flex-col gap-2">
						<div className="bg-accent/50 flex items-center justify-between gap-3 rounded-md p-2.5">
							<span className="min-w-0">
								<span className="block text-sm">The clips' own sound</span>
								<span className="text-muted-foreground block text-xs">
									{clips.length} video clip{clips.length === 1 ? "" : "s"} ·{" "}
									{allClipsMuted ? "all muted" : "playing"}
								</span>
							</span>
							<button
								type="button"
								data-jeo="mute-clips"
								disabled={clips.length === 0}
								onClick={() => {
									if (!sceneTracks) return;
									editor.timeline.updateElements({
										updates: clips.map((clip) => ({
											trackId: sceneTracks.main.id,
											elementId: clip.id,
											patch: { params: { ...clip.params, muted: !allClipsMuted } },
										})),
									});
								}}
								className="bg-background hover:bg-background/70 shrink-0 cursor-pointer rounded-md px-2.5 py-1.5 text-xs transition-colors duration-150 disabled:opacity-50"
							>
								{allClipsMuted ? "Unmute all" : "Mute all"}
							</button>
						</div>
						{sounds.length === 0 && (
							<p className="text-muted-foreground px-1 py-3 text-xs">
								No music, sound effects or voice in this video yet.
							</p>
						)}
						{sounds.map((item) => {
							const params = ("params" in item.element ? item.element.params : {}) as {
								volume?: number;
								muted?: boolean;
							};
							const volume = typeof params.volume === "number" ? params.volume : 0;
							const isMuted = params.muted === true;
							return (
								<div
									key={item.element.id}
									data-jeo-timeline-sound={item.element.name}
									className="bg-accent/50 rounded-md p-2.5"
								>
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => {
												editor.selection.setSelectedElements({
													elements: [
														{ trackId: item.track.id, elementId: item.element.id },
													],
												});
												editor.playback.seek({ time: item.element.startTime });
											}}
											className="min-w-0 flex-1 cursor-pointer text-left"
											title="Show it on the timeline"
										>
											<span className="block truncate text-sm">
												{item.element.name.replace(/\.[^.]+$/, "")}
											</span>
											<span className="text-muted-foreground block text-[0.68rem] tabular-nums">
												{formatClock(item.element.startTime)} to{" "}
												{formatClock(item.element.startTime + item.element.duration)}
											</span>
										</button>
										<button
											type="button"
											aria-pressed={isMuted}
											onClick={() => patch(item, { muted: !isMuted })}
											className={cn(
												"shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs transition-colors duration-150",
												isMuted
													? "bg-primary text-primary-foreground"
													: "bg-background hover:bg-background/70",
											)}
										>
											{isMuted ? "Muted" : "Mute"}
										</button>
										<button
											type="button"
											title="Remove from the video (Ctrl+Z brings it back)"
											onClick={() => {
												editor.selection.setSelectedElements({
													elements: [
														{ trackId: item.track.id, elementId: item.element.id },
													],
												});
												invokeAction("delete-selected");
											}}
											className="bg-background hover:bg-background/70 shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs transition-colors duration-150"
										>
											Remove
										</button>
									</div>
									<div className="mt-2 flex items-center gap-2">
										<span className="text-muted-foreground w-12 shrink-0 text-xs">
											Volume
										</span>
										<Slider
											aria-label={`Volume of ${item.element.name}`}
											className="min-w-0 flex-1"
											min={-30}
											max={12}
											step={0.5}
											value={[Math.max(-30, Math.min(12, volume))]}
											onValueChange={([next]) => patch(item, { volume: next }, true)}
											onValueCommit={() => editor.timeline.commitPreview()}
										/>
										<span className="w-14 shrink-0 text-right text-xs tabular-nums">
											{volume > 0 ? "+" : ""}
											{volume.toFixed(1)} dB
										</span>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</PanelView>
	);
}
