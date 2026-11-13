"use client";

import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	BlurIcon,
	ColorsIcon,
	FlashIcon,
	TextFontIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { getDesktopBridge, type JeoAssetFile } from "@/services/desktop/bridge";
import { cn } from "@/utils/ui";
import * as jeoActions from "../actions";
import { callTool, followHead, listTools } from "../control";
import {
	type ActionResult,
	CAPTION_PRESETS,
	TAG_PRESETS,
	addBlurShake,
	addCaption,
	addColourFlash,
	addColourSplit,
	addEnding,
	addFreeze,
	addLibraryAudio,
	addPopUp,
	addTag,
	endOn29,
	formatFrames,
	getEndInfo,
	listAssetFiles,
	snapTextsToCuts,
} from "../actions";

/**
 * The same actions are exposed as `window.__jeoActions` for the control
 * channel (Claude, Phase 3) and for automated tests.
 */
export function useExposeJeoActions(): void {
	useEffect(() => {
		const target = window as unknown as {
			__jeoActions?: typeof jeoActions;
			__jeoControl?: { listTools: typeof listTools; callTool: typeof callTool };
		};
		target.__jeoActions = jeoActions;
		target.__jeoControl = { listTools, callTool };
	}, []);

	// one-time repair for projects whose clips were muted by the old default
	const projectId = useEditor(
		(editor) => editor.project.getActiveOrNull()?.metadata.id ?? null,
	);
	useEffect(() => {
		if (!projectId) return;
		const timer = window.setTimeout(() => {
			if (jeoActions.repairSilentProject()) {
				toast.success("The clips' own sound is back on (it was muted by mistake).");
			}
			const resized = jeoActions.resizeOldTexts();
			if (resized > 0) {
				toast.success(
					`${resized} texts resized to your standard (12 at 120%). Ctrl+Z puts them back.`,
				);
			}
		}, 2500);
		return () => window.clearTimeout(timer);
	}, [projectId]);
}

function report(result: ActionResult): void {
	if (result.ok) {
		if (result.message) toast.success(result.message);
	} else {
		toast.error(result.message);
	}
}

async function run(action: () => ActionResult | Promise<ActionResult>): Promise<void> {
	try {
		report(await action());
	} catch (error) {
		console.error("[jeo] action failed:", error);
		toast.error("That didn't work. Nothing was changed.");
	}
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mb-4">
			<h3 className="text-muted-foreground mb-2 px-1 text-xs font-medium uppercase tracking-wide">
				{title}
			</h3>
			<div className="flex flex-col gap-1.5">{children}</div>
		</section>
	);
}

/** A preset row: sample in caption style on the left, name + hint on the right. */
function PresetRow({
	sample,
	label,
	hint,
	onClick,
	disabled,
}: {
	/** a caption sample (string) or an icon */
	sample: React.ReactNode;
	label: string;
	hint: string;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"bg-accent/60 hover:bg-accent active:bg-accent/80 flex w-full cursor-pointer items-center gap-3 rounded-md p-2 text-left transition-colors duration-150",
				"disabled:cursor-not-allowed disabled:opacity-50",
			)}
		>
			<span
				className="flex h-14 w-24 shrink-0 items-center justify-center rounded bg-black/60 px-1 text-center text-[0.62rem] leading-tight whitespace-pre-line text-white"
				style={{
					fontFamily: '"LEMON MILK", sans-serif',
					fontWeight: 700,
					textShadow: "0 0 2px #000, 0 0 2px #000",
				}}
			>
				{sample}
			</span>
			<span className="min-w-0">
				<span className="text-foreground block text-sm font-medium">{label}</span>
				<span className="text-muted-foreground block text-xs">{hint}</span>
			</span>
		</button>
	);
}

function Note({ children }: { children: React.ReactNode }) {
	return <p className="text-muted-foreground px-1 text-xs">{children}</p>;
}

// ---------- Captions ----------

export function CaptionsView() {
	return (
		<PanelView title="Captions">
			<Section title="Click to add at the playhead, then type">
				{CAPTION_PRESETS.map((preset) => (
					<PresetRow
						key={preset.id}
						sample={preset.sample}
						label={preset.label}
						hint={preset.hint}
						onClick={() => run(() => addCaption({ preset: preset.id }))}
					/>
				))}
			</Section>
			<Section title="Helper">
				<Button variant="outline" onClick={() => run(snapTextsToCuts)}>
					Snap texts to cuts
				</Button>
				<Note>
					Moves every text that starts or ends close to a cut exactly onto it, so
					no text comes in before its scene.
				</Note>
			</Section>
		</PanelView>
	);
}

// ---------- Tags ----------

function FollowButton() {
	const editor = useEditor();
	const [isBusy, setIsBusy] = useState(false);
	const handleFollow = async () => {
		const selected = editor.selection.getSelectedElements();
		if (selected.length !== 1) {
			toast.error("Select one tag on the timeline first.");
			return;
		}
		setIsBusy(true);
		try {
			const outcome = await followHead({ id: selected[0].elementId });
			if (outcome.ok) toast.success("The tag now follows the person.");
			else toast.error(outcome.error ?? "Could not follow.");
		} catch (error) {
			console.error("[jeo] follow failed:", error);
			toast.error("Could not follow. Nothing was changed.");
		}
		setIsBusy(false);
	};
	return (
		<Button variant="outline" onClick={handleFollow} disabled={isBusy}>
			{isBusy ? "Tracking…" : "Make selected tag follow the head"}
		</Button>
	);
}

export function TagsView() {
	return (
		<PanelView title="Tags">
			<Section title="On the head">
				{TAG_PRESETS.filter((preset) => !preset.id.startsWith("arrow")).map(
					(preset) => (
						<PresetRow
							key={preset.id}
							sample={preset.sample}
							label={preset.label}
							hint={preset.hint}
							onClick={() => run(() => addTag({ preset: preset.id }))}
						/>
					),
				)}
			</Section>
			<Section title="Arrow">
				{TAG_PRESETS.filter((preset) => preset.id.startsWith("arrow")).map(
					(preset) => (
						<PresetRow
							key={preset.id}
							sample={preset.sample}
							label={preset.label}
							hint={preset.hint}
							onClick={() => run(() => addTag({ preset: preset.id }))}
						/>
					),
				)}
			</Section>
			<Section title="Auto-follow">
				<FollowButton />
				<Note>
					Put the tag on the head at its first frame, select it, then click. It
					follows the person through that clip (not on a freeze). You can still
					drag the keyframes afterwards.
				</Note>
			</Section>
			<Section title="Triangle or arrow?">
				<Note>
					▼ Triangle: a 1–2 word label for who they are, when it adds emotional
					depth. Pairs with a scene text.
				</Note>
				<Note>
					↗ Arrow: a longer phrase, or pointing at an object. Use one or the
					other on a freeze, never both.
				</Note>
			</Section>
		</PanelView>
	);
}

// ---------- assets hook ----------

function useAssetFiles() {
	const [files, setFiles] = useState<JeoAssetFile[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const reload = useCallback(async () => {
		setIsLoading(true);
		setFiles(await listAssetFiles());
		setIsLoading(false);
	}, []);
	useEffect(() => {
		void reload();
	}, [reload]);
	return { files, isLoading, reload };
}

// ---------- Freeze ----------

export function FreezeView() {
	const { files } = useAssetFiles();
	const sounds = files.filter((file) => file.kind === "sound-effects");
	const [holdSeconds, setHoldSeconds] = useState(2);
	const [soundPath, setSoundPath] = useState<string>("");
	const [isBusy, setIsBusy] = useState(false);

	// pre-pick a sound whose name looks like a freeze sound
	useEffect(() => {
		if (soundPath || sounds.length === 0) return;
		const guess = sounds.find((file) => /freeze|fah|boom|hit/i.test(file.name));
		if (guess) setSoundPath(guess.relPath);
	}, [sounds, soundPath]);

	const handleFreeze = async () => {
		setIsBusy(true);
		await run(() =>
			addFreeze({
				holdSeconds,
				sound: sounds.find((file) => file.relPath === soundPath) ?? null,
			}),
		);
		setIsBusy(false);
	};

	return (
		<PanelView title="Freeze">
			<Section title="Freeze frame at the playhead">
				<label className="flex items-center justify-between gap-2 px-1 text-sm">
					<span>Length (seconds)</span>
					<input
						type="number"
						min={0.2}
						max={10}
						step={0.1}
						value={holdSeconds}
						onChange={(event) =>
							setHoldSeconds(
								Math.min(10, Math.max(0.2, Number(event.target.value) || 2)),
							)
						}
						className="bg-input h-8 w-20 rounded-md border px-2 text-right text-sm tabular-nums"
					/>
				</label>
				<label className="flex items-center justify-between gap-2 px-1 text-sm">
					<span>Sound on the freeze</span>
					<select
						value={soundPath}
						onChange={(event) => setSoundPath(event.target.value)}
						disabled={sounds.length === 0}
						className="bg-input h-8 max-w-40 rounded-md border px-2 text-sm"
					>
						<option value="">None</option>
						{sounds.map((file) => (
							<option key={file.relPath} value={file.relPath}>
								{file.name}
							</option>
						))}
					</select>
				</label>
				<Button onClick={handleFreeze} disabled={isBusy}>
					{isBusy ? "Freezing…" : "Add freeze"}
				</Button>
				{sounds.length === 0 && (
					<Note>
						No sound effects yet. Put files (for example your "FAHHHH") in
						assets\sound-effects to choose one here.
					</Note>
				)}
			</Section>
			<Section title="Your intro">
				<Note>
					Let the video play about 1.33 s (1 second + 10 frames), then freeze
					for 2.0 s.
				</Note>
				<Note>
					On the freeze: a ▼ tag on the head + a scene text, or an ↗ arrow with a
					spotlight. Re-frame the frozen picture so the head sits under the tag.
				</Note>
			</Section>
		</PanelView>
	);
}

// ---------- Effects ----------

export function JeoEffectsSection() {
	return (
		<>
			<Section title="Text">
				<PresetRow
					sample={<HugeiconsIcon icon={TextFontIcon} className="size-6" />}
					label="Pop-up"
					hint="Selected text pops in: 30% → 115% → 100% in 0.2 s."
					onClick={() => run(addPopUp)}
				/>
			</Section>
			<Section title="At the playhead">
				<PresetRow
					sample={<HugeiconsIcon icon={FlashIcon} className="size-6" />}
					label="Colour flash (C.F)"
					hint="White flash on a reaction or surprise moment."
					onClick={() => run(() => addColourFlash({ color: "white" }))}
				/>
				<PresetRow
					sample={<HugeiconsIcon icon={FlashIcon} className="size-6 text-red-500" />}
					label="Red colour flash"
					hint="Red flash for an angry moment."
					onClick={() => run(() => addColourFlash({ color: "red" }))}
				/>
				<PresetRow
					sample={<HugeiconsIcon icon={BlurIcon} className="size-6" />}
					label="Blur shake"
					hint="0.3 s blurry camera shake, like the start of your endings."
					onClick={() => run(addBlurShake)}
				/>
				<PresetRow
					sample={<HugeiconsIcon icon={ColorsIcon} className="size-6" />}
					label="Colour split"
					hint="Soft red/blue fringes from the playhead to the end."
					onClick={() => run(addColourSplit)}
				/>
			</Section>
		</>
	);
}

// ---------- Endings ----------

export function EndingsView() {
	const duration = useEditor((editor) => editor.timeline.getTotalDuration());
	const [isBusy, setIsBusy] = useState(false);
	// `duration` is read so this panel refreshes when the timeline changes
	const info = duration >= 0 ? getEndInfo() : getEndInfo();

	const handleEnding = async (kind: "funny" | "sweet") => {
		setIsBusy(true);
		await run(() => addEnding({ kind }));
		setIsBusy(false);
	};

	return (
		<PanelView title="Endings">
			<Section title="Put the playhead on the last cut, then click">
				<PresetRow
					sample="😂"
					label="Funny ending"
					hint="Blurry shake → your 😂 fades in and keeps growing → colour split."
					onClick={() => handleEnding("funny")}
					disabled={isBusy}
				/>
				<PresetRow
					sample="❤️"
					label="Sweet ending"
					hint="Same build with the ❤️ heart."
					onClick={() => handleEnding("sweet")}
					disabled={isBusy}
				/>
			</Section>
			<Section title=":29 end">
				<div className="bg-accent/60 rounded-md p-2 text-sm">
					Video length:{" "}
					<span className="font-mono font-semibold">{info.timecode}</span>{" "}
					<span className="text-muted-foreground">(seconds:frames)</span>
					<div
						className={cn(
							"mt-1 text-xs",
							info.isOn29 ? "text-constructive" : "text-caution",
						)}
					>
						{info.frames === 0
							? "The timeline is empty."
							: info.isOn29
								? "Ends on a :29 frame."
								: "Does not end on a :29 frame yet."}
					</div>
				</div>
				<div className="flex gap-1.5">
					<Button
						variant="outline"
						className="flex-1"
						disabled={!info.trimTo}
						onClick={() => run(() => endOn29({ direction: "trim" }))}
					>
						Trim to {info.trimTo ? formatFrames({ frames: info.trimTo }) : "—"}
					</Button>
					<Button
						variant="outline"
						className="flex-1"
						disabled={!info.extendTo}
						onClick={() => run(() => endOn29({ direction: "extend" }))}
					>
						Extend to{" "}
						{info.extendTo ? formatFrames({ frames: info.extendTo }) : "—"}
					</Button>
				</div>
				<Note>
					Ending on :29 keeps the video just under the next second. Texts, emoji
					and effects that reach the end follow it.
				</Note>
			</Section>
		</PanelView>
	);
}

// ---------- Audio ----------

const MUSIC_SPEEDS = [1, 0.9, 0.8, 0.7];

function formatSize(bytes: number): string {
	return bytes > 1024 * 1024
		? `${(bytes / 1024 / 1024).toFixed(1)} MB`
		: `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function AudioView() {
	const { files, isLoading, reload } = useAssetFiles();
	const [musicSpeed, setMusicSpeed] = useState(1);
	const [busyPath, setBusyPath] = useState<string | null>(null);
	const desktop = getDesktopBridge();
	const music = files.filter((file) => file.kind === "music");
	const sounds = files.filter((file) => file.kind === "sound-effects");

	const handleAdd = async (file: JeoAssetFile) => {
		setBusyPath(file.relPath);
		await run(() =>
			addLibraryAudio({
				file,
				rate: file.kind === "music" ? musicSpeed : 1,
			}),
		);
		setBusyPath(null);
	};

	const list = (items: JeoAssetFile[], emptyText: string) =>
		items.length === 0 ? (
			<Note>{isLoading ? "Loading…" : emptyText}</Note>
		) : (
			items.map((file) => (
				<button
					key={file.relPath}
					type="button"
					disabled={busyPath !== null}
					onClick={() => handleAdd(file)}
					className="bg-accent/60 hover:bg-accent flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<span className="truncate">{file.name}</span>
					<span className="text-muted-foreground shrink-0 text-xs">
						{busyPath === file.relPath ? "Adding…" : formatSize(file.size)}
					</span>
				</button>
			))
		);

	return (
		<PanelView
			title="Audio"
			actions={
				<Button variant="ghost" size="sm" onClick={() => void reload()}>
					Refresh
				</Button>
			}
		>
			{!desktop && (
				<Note>
					The music and sound library works in the JEO Editor desktop app.
				</Note>
			)}
			<Section title="Music (starts at 0:00, cut to the video)">
				<div className="flex items-center gap-1 px-1 text-xs">
					<span className="text-muted-foreground mr-1">Speed</span>
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
				{list(music, "No music yet. Put files in assets\\music.")}
				{desktop && (
					<Button
						variant="text"
						className="text-muted-foreground justify-start px-1"
						onClick={() => desktop.showAssetsFolder({ kind: "music" })}
					>
						Open music folder
					</Button>
				)}
			</Section>
			<Section title="Sound effects (land on the playhead)">
				{list(sounds, "No sound effects yet. Put files in assets\\sound-effects.")}
				{desktop && (
					<Button
						variant="text"
						className="text-muted-foreground justify-start px-1"
						onClick={() => desktop.showAssetsFolder({ kind: "sound-effects" })}
					>
						Open sound-effects folder
					</Button>
				)}
			</Section>
			<Note>
				After adding, select the sound on the timeline to change its volume or
				speed on the right.
			</Note>
		</PanelView>
	);
}
