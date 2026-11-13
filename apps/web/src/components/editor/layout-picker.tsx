"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { usePanelStore } from "@/editor/panel-store";
import { LAYOUT_PRESETS, type LayoutPreset } from "@/panels/layout";
import { cn } from "@/utils/ui";

const TONE = {
	tools: "bg-foreground/25",
	properties: "bg-foreground/45",
	preview: "bg-primary",
} as const;

/** A tiny drawing of the layout: three panels on top, the timeline below. */
function LayoutSketch({ preset }: { preset: LayoutPreset }) {
	if (preset.shape === "tall-preview") {
		return (
			<div
				className="flex h-8 w-12 shrink-0 gap-px overflow-hidden rounded-[3px] border"
				aria-hidden="true"
			>
				<div
					className="flex flex-col gap-px"
					style={{ flex: 100 - preset.sizes.preview }}
				>
					<div className="flex gap-px" style={{ flex: preset.sizes.mainContent }}>
						{preset.order.map((id) => (
							<div key={id} className={TONE[id]} style={{ flex: preset.sizes[id] }} />
						))}
					</div>
					<div className="bg-foreground/15" style={{ flex: preset.sizes.timeline }} />
				</div>
				<div className={TONE.preview} style={{ flex: preset.sizes.preview }} />
			</div>
		);
	}
	return (
		<div
			className="flex h-8 w-12 shrink-0 flex-col gap-px overflow-hidden rounded-[3px] border"
			aria-hidden="true"
		>
			<div className="flex gap-px" style={{ flex: preset.sizes.mainContent }}>
				{preset.order.map((id) => (
					<div
						key={id}
						className={TONE[id]}
						style={{ flex: preset.sizes[id] }}
					/>
				))}
			</div>
			<div
				className="bg-foreground/15"
				style={{ flex: preset.sizes.timeline }}
			/>
		</div>
	);
}

/** JEO: pick one of the ready-made editor layouts. */
export function LayoutPicker() {
	const layout = usePanelStore((state) => state.layout);
	const applyLayout = usePanelStore((state) => state.applyLayout);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-9 shrink-0 px-2.5 text-xs font-medium"
					title="Change how the editor is laid out"
					data-jeo="layout-picker"
				>
					Layout
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				{LAYOUT_PRESETS.map((preset) => (
					<DropdownMenuItem
						key={preset.id}
						data-jeo-layout={preset.id}
						onClick={() => applyLayout(preset.id)}
						className={cn(
							"flex cursor-pointer items-center gap-3 py-2",
							preset.id === layout && "bg-accent",
						)}
					>
						<LayoutSketch preset={preset} />
						<div className="min-w-0">
							<p className="text-sm">
								{preset.name}
								{preset.id === layout && (
									<span className="text-muted-foreground ml-2 text-xs">
										in use
									</span>
								)}
							</p>
							<p className="text-muted-foreground truncate text-xs">
								{preset.hint}
							</p>
						</div>
					</DropdownMenuItem>
				))}
				<p className="text-muted-foreground border-t px-2 pt-2 pb-1 text-xs">
					You can still drag the edges between panels.
				</p>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
