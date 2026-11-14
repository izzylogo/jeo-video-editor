import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { TICKS_PER_SECOND } from "@/wasm";
import { useEditor } from "@/editor/use-editor";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { HugeiconsIcon } from "@hugeicons/react";
import { DashboardSpeed02Icon } from "@hugeicons/core-free-icons";
import { buildConstantRetime } from "@/retime";
import {
	DEFAULT_RETIME_RATE,
	MIN_RETIME_RATE,
	MAX_RETIME_RATE,
	clampRetimeRate,
	canMaintainPitch,
} from "@/retime/rate";
import type { AudioElement, VideoElement } from "@/timeline";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { usePropertyDraft } from "@/components/editor/panels/properties/hooks/use-property-draft";
import {
	formatNumberForDisplay,
	getFractionDigitsForStep,
	snapToStep,
} from "@/utils/math";

const SPEED_STEP = 0.01;
const SPEED_FRACTION_DIGITS = getFractionDigitsForStep({ step: SPEED_STEP });

function rateToDisplay({ rate }: { rate: number }): string {
	return formatNumberForDisplay({
		value: rate,
		fractionDigits: SPEED_FRACTION_DIGITS,
	});
}

function parseSpeedInput({ input }: { input: string }): number | null {
	const parsed = parseFloat(input);
	if (Number.isNaN(parsed)) return null;
	return clampRetimeRate({
		rate: snapToStep({ value: parsed, step: SPEED_STEP }),
	});
}

// JEO: the slider. 1x sits in the middle: the left half is slow motion
// (0.1x to 1x), the right half is fast (1x to 5x).
const SLIDER_MIN_RATE = 0.1;
const BUTTON_STEP = 0.05;
const SLIDER_MARKS = [0.1, 0.5, 1, 2, 3, 5];
const QUICK_RATES = [0.5, 0.8, 1, 1.05, 1.5, 2];

// Every stop on the slider is a real speed, so one arrow-key press always
// changes it: small steps (0.02x) when slow, bigger (0.1x) when fast.
const SLIDER_RATES: number[] = [];
for (let i = 0; i <= 45; i++) SLIDER_RATES.push(Math.round((SLIDER_MIN_RATE + i * 0.02) * 100) / 100);
for (let i = 1; i <= 40; i++) SLIDER_RATES.push(Math.round((1 + i * 0.1) * 100) / 100);
const SLIDER_LAST = SLIDER_RATES.length - 1;

function rateToSlider(rate: number): number {
	let best = 0;
	for (let i = 1; i < SLIDER_RATES.length; i++) {
		if (Math.abs(SLIDER_RATES[i] - rate) < Math.abs(SLIDER_RATES[best] - rate)) best = i;
	}
	return best;
}

function sliderToRate(position: number): number {
	const index = Math.min(SLIDER_LAST, Math.max(0, Math.round(position)));
	return clampRetimeRate({ rate: SLIDER_RATES[index] });
}

function buildRetime({
	rate,
	maintainPitch,
}: {
	rate: number;
	maintainPitch: boolean;
}) {
	if (rate === DEFAULT_RETIME_RATE && !maintainPitch) return undefined;
	return buildConstantRetime({ rate, maintainPitch });
}

export function SpeedTab({
	element,
	trackId,
}: {
	element: AudioElement | VideoElement;
	trackId: string;
}) {
	const editor = useEditor();
	const rate = clampRetimeRate({
		rate: element.retime?.rate ?? DEFAULT_RETIME_RATE,
	});
	const isPitchPreserveAvailable = canMaintainPitch({ rate });
	const maintainPitch = element.retime?.maintainPitch ?? false;
	const pendingRateRef = useRef(rate);

	const commitRetime = ({
		rate: nextRate,
		maintainPitch: nextMaintainPitch,
	}: {
		rate: number;
		maintainPitch: boolean;
	}) => {
		editor.timeline.updateElementRetime({
			trackId,
			elementId: element.id,
			retime: buildRetime({ rate: nextRate, maintainPitch: nextMaintainPitch }),
		});
	};

	const speedDraft = usePropertyDraft({
		displayValue: rateToDisplay({ rate }),
		parse: (input) => parseSpeedInput({ input }),
		onPreview: (nextRate) => {
			pendingRateRef.current = nextRate;
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: {
							retime: buildRetime({ rate: nextRate, maintainPitch }),
						},
					},
				],
			});
		},
		onCommit: () => {
			// drop the live preview first, so the change is saved as one step and
			// the clips after this one move along
			editor.timeline.discardPreview();
			commitRetime({ rate: pendingRateRef.current, maintainPitch });
		},
	});

	// while the slider is being dragged only this number moves; the timeline
	// changes once, when the mouse is let go (quick on a slow laptop)
	const [dragRate, setDragRate] = useState<number | null>(null);
	useEffect(() => setDragRate(null), [rate, element.id]);
	const shownRate = dragRate ?? rate;
	const setRate = (next: number) =>
		commitRetime({
			rate: clampRetimeRate({
				rate: snapToStep({ value: next, step: SPEED_STEP }),
			}),
			maintainPitch,
		});
	const seconds = (element.duration * rate) / shownRate / TICKS_PER_SECOND;
	const stepButton =
		"bg-accent hover:bg-accent/70 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-base leading-none transition-transform duration-100 active:scale-[0.94] disabled:cursor-default disabled:opacity-40";

	return (
		<Section collapsible sectionKey={`${element.id}:speed`}>
			<SectionHeader>
				<SectionTitle>Speed</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<SectionField label="Speed">
						<NumberField
							icon={<HugeiconsIcon icon={DashboardSpeed02Icon} />}
							value={speedDraft.displayValue}
							suffix="x"
							scrubRanges={[
								{ from: 0.01, to: 1, pixelsPerUnit: 160 },
								{ from: 1, to: 5, pixelsPerUnit: 48 },
							]}
							scrubClamp={{ min: MIN_RETIME_RATE, max: MAX_RETIME_RATE }}
							onFocus={() => {
								pendingRateRef.current = rate;
								speedDraft.onFocus();
							}}
							onChange={speedDraft.onChange}
							onBlur={speedDraft.onBlur}
							onScrub={speedDraft.scrubTo}
							onScrubEnd={speedDraft.commitScrub}
							onReset={() =>
								commitRetime({ rate: DEFAULT_RETIME_RATE, maintainPitch })
							}
							isDefault={rate === DEFAULT_RETIME_RATE}
						/>
					</SectionField>
					<div data-jeo="speed-dial" className="flex flex-col gap-1.5">
						<div className="flex items-center gap-2">
							<button
								type="button"
								aria-label="Slower"
								title="Slower (0.05x)"
								className={stepButton}
								disabled={rate <= SLIDER_MIN_RATE}
								onClick={() => setRate(Math.max(SLIDER_MIN_RATE, rate - BUTTON_STEP))}
							>
								&minus;
							</button>
							<Slider
								aria-label="Speed"
								min={0}
								max={SLIDER_LAST}
								step={1}
								value={[rateToSlider(shownRate)]}
								onValueChange={([position]) => setDragRate(sliderToRate(position))}
								onValueCommit={([position]) => setRate(sliderToRate(position))}
							/>
							<button
								type="button"
								aria-label="Faster"
								title="Faster (0.05x)"
								className={stepButton}
								disabled={rate >= MAX_RETIME_RATE}
								onClick={() => setRate(Math.min(MAX_RETIME_RATE, rate + BUTTON_STEP))}
							>
								+
							</button>
						</div>
						<div className="text-muted-foreground relative mx-9 h-4 text-[10px]">
							{SLIDER_MARKS.map((mark) => (
								<button
									key={mark}
									type="button"
									className="hover:text-foreground absolute -translate-x-1/2 cursor-pointer tabular-nums"
									style={{ left: `${(rateToSlider(mark) / SLIDER_LAST) * 100}%` }}
									onClick={() => setRate(mark)}
								>
									{mark}x
								</button>
							))}
						</div>
						<div className="flex flex-wrap gap-1">
							{QUICK_RATES.map((quick) => (
								<button
									key={quick}
									type="button"
									onClick={() => setRate(quick)}
									className={
										Math.abs(rate - quick) < 0.001
											? "bg-primary text-primary-foreground cursor-pointer rounded px-2 py-1 text-xs tabular-nums"
											: "bg-accent hover:bg-accent/70 cursor-pointer rounded px-2 py-1 text-xs tabular-nums"
									}
								>
									{quick}x
								</button>
							))}
						</div>
						<p className="text-muted-foreground text-xs tabular-nums" data-jeo="speed-length">
							{rateToDisplay({ rate: shownRate })}x &middot; clip is {seconds.toFixed(2)} s long. Clips after it move along.
						</p>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-sm">Change pitch</span>
						<Switch
							checked={!maintainPitch}
							disabled={!isPitchPreserveAvailable}
							onCheckedChange={(checked) =>
								commitRetime({ rate, maintainPitch: !checked })
							}
						/>
					</div>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}
