"use client";

/**
 * Record voice: like CapCut's microphone button. Click to start (the video
 * plays so you can speak along), click again to stop. The recording lands on
 * a sound track, starting where the playhead was.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Mic01Icon, StopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { buildElementFromMedia } from "@/timeline/element-utils";
import type { MediaTime } from "@/wasm";
import { cn } from "@/utils/ui";
import { importFile, insertAll, seconds } from "../actions";

/** Decode the recording and write it as a one-channel 16-bit WAV. */
async function toWavFile({ blob, name }: { blob: Blob; name: string }): Promise<File> {
	const context = new AudioContext();
	try {
		const decoded = await context.decodeAudioData(await blob.arrayBuffer());
		const frames = decoded.length;
		const mono = new Float32Array(frames);
		for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
			const data = decoded.getChannelData(channel);
			for (let i = 0; i < frames; i++) mono[i] += data[i] / decoded.numberOfChannels;
		}
		const buffer = new ArrayBuffer(44 + frames * 2);
		const view = new DataView(buffer);
		const text = (offset: number, value: string) => {
			for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
		};
		text(0, "RIFF");
		view.setUint32(4, 36 + frames * 2, true);
		text(8, "WAVEfmt ");
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true);
		view.setUint16(22, 1, true);
		view.setUint32(24, decoded.sampleRate, true);
		view.setUint32(28, decoded.sampleRate * 2, true);
		view.setUint16(32, 2, true);
		view.setUint16(34, 16, true);
		text(36, "data");
		view.setUint32(40, frames * 2, true);
		for (let i = 0; i < frames; i++) {
			const sample = Math.max(-1, Math.min(1, mono[i]));
			view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
		}
		return new File([buffer], name, { type: "audio/wav" });
	} finally {
		void context.close();
	}
}

export function VoiceRecordButton() {
	const editor = useEditor();
	const [isRecording, setIsRecording] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const recorderRef = useRef<MediaRecorder | null>(null);

	const start = async () => {
		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			toast.error(
				"No microphone found, or Windows is blocking it. Check Settings › Privacy › Microphone.",
			);
			return;
		}
		const startTime = editor.playback.getCurrentTime();
		const chunks: Blob[] = [];
		const recorder = new MediaRecorder(stream);
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.onstop = async () => {
			for (const track of stream.getTracks()) track.stop();
			editor.playback.pause();
			setIsRecording(false);
			setIsSaving(true);
			try {
				const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "-");
				// the raw recording has no length written in it: save it as a WAV
				const file = await toWavFile({
					blob: new Blob(chunks, { type: recorder.mimeType || "audio/webm" }),
					name: `Voice ${stamp}.wav`,
				});
				const asset = await importFile({ file });
				if (!asset || !asset.duration || !Number.isFinite(asset.duration)) {
					toast.error("The recording could not be saved.");
					return;
				}
				const element = buildElementFromMedia({
					mediaId: asset.id,
					mediaType: "audio",
					name: asset.name,
					duration: seconds(asset.duration),
					startTime: startTime as MediaTime,
				});
				insertAll({
					items: [{ element, placement: { mode: "auto", trackType: "audio" } }],
				});
				toast.success("Voice recording added to the timeline.");
			} catch (error) {
				console.error("[jeo] voice recording failed:", error);
				toast.error("The recording could not be saved.");
			} finally {
				setIsSaving(false);
			}
		};
		recorderRef.current = recorder;
		recorder.start();
		setIsRecording(true);
		editor.playback.play();
	};

	const stop = () => {
		if (recorderRef.current?.state === "recording") recorderRef.current.stop();
	};

	const label = isRecording
		? "Stop recording"
		: isSaving
			? "Saving the recording…"
			: "Record your voice from the playhead";

	return (
		<Button
			variant={isRecording ? "secondary" : "text"}
			size="icon"
			disabled={isSaving}
			title={label}
			aria-label={label}
			data-jeo-tool="record"
			onClick={() => (isRecording ? stop() : void start())}
			className={cn("rounded-sm", isRecording && "text-red-500")}
		>
			<HugeiconsIcon icon={isRecording ? StopIcon : Mic01Icon} />
		</Button>
	);
}
