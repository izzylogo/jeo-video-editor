"use client";

import type { ReactNode } from "react";

/**
 * Shows Claude's reply as clean text. Claude writes "markdown" (# for
 * headings, ** for bold, - for lists); shown raw that is a mess of symbols.
 * This turns it into real headings, bold words, bullet lists and code chips.
 */

function inline(text: string, keyPrefix: string): ReactNode[] {
	const parts: ReactNode[] = [];
	const pattern =
		/(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(__[^_\n]+?__)|(\*[^*\s][^*\n]*?\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;
	let last = 0;
	let index = 0;
	for (const match of text.matchAll(pattern)) {
		const at = match.index ?? 0;
		if (at > last) parts.push(text.slice(last, at));
		const token = match[0];
		const key = `${keyPrefix}-${index++}`;
		if (token.startsWith("`")) {
			parts.push(
				<code
					key={key}
					className="bg-background/60 rounded px-1 py-0.5 font-mono text-[0.85em]"
				>
					{token.slice(1, -1)}
				</code>,
			);
		} else if (token.startsWith("**") || token.startsWith("__")) {
			parts.push(
				<strong key={key} className="font-semibold">
					{token.slice(2, -2)}
				</strong>,
			);
		} else if (token.startsWith("[")) {
			parts.push(token.slice(1, token.indexOf("](")));
		} else {
			parts.push(<em key={key}>{token.slice(1, -1)}</em>);
		}
		last = at + token.length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return parts;
}

type Block =
	| { kind: "heading"; text: string }
	| { kind: "paragraph"; text: string }
	| { kind: "list"; ordered: boolean; items: string[] }
	| { kind: "code"; text: string }
	| { kind: "rule" };

function tableRow(line: string): string | null {
	const cells = line
		.replace(/^\s*\|/, "")
		.replace(/\|\s*$/, "")
		.split("|")
		.map((cell) => cell.trim());
	// the |---|---| line under a table header carries nothing to read
	if (cells.every((cell) => /^:?-{2,}:?$/.test(cell) || cell === "")) return null;
	return cells.filter(Boolean).join("  ·  ");
}

function toBlocks(source: string): Block[] {
	const blocks: Block[] = [];
	const lines = source.replace(/\r\n/g, "\n").split("\n");
	let paragraph: string[] = [];
	const flush = () => {
		if (paragraph.length > 0) {
			blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
			paragraph = [];
		}
	};
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		if (trimmed.startsWith("```")) {
			flush();
			const code: string[] = [];
			i++;
			while (i < lines.length && !lines[i].trim().startsWith("```")) {
				code.push(lines[i]);
				i++;
			}
			blocks.push({ kind: "code", text: code.join("\n") });
			continue;
		}
		if (trimmed === "") {
			flush();
			continue;
		}
		if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
			flush();
			blocks.push({ kind: "rule" });
			continue;
		}
		const heading = /^#{1,6}\s+(.*)$/.exec(trimmed);
		if (heading) {
			flush();
			blocks.push({ kind: "heading", text: heading[1].replace(/\s*#+$/, "") });
			continue;
		}
		const bullet = /^([-*•+]|\d+[.)])\s+(.*)$/.exec(trimmed);
		if (bullet) {
			flush();
			const ordered = /^\d/.test(bullet[1]);
			const previous = blocks[blocks.length - 1];
			if (previous?.kind === "list" && previous.ordered === ordered) {
				previous.items.push(bullet[2]);
			} else {
				blocks.push({ kind: "list", ordered, items: [bullet[2]] });
			}
			continue;
		}
		if (trimmed.startsWith("|")) {
			const row = tableRow(trimmed);
			if (row) paragraph.push(row);
			continue;
		}
		paragraph.push(trimmed.replace(/^>\s?/, ""));
	}
	flush();
	return blocks;
}

export function ChatText({ text }: { text: string }) {
	const blocks = toBlocks(text);
	return (
		<div className="flex flex-col gap-2 leading-relaxed" data-jeo="chat-text">
			{blocks.map((block, index) => {
				const key = `b${index}`;
				if (block.kind === "heading") {
					return (
						<p key={key} className="pt-1 text-[0.95em] font-semibold">
							{inline(block.text, key)}
						</p>
					);
				}
				if (block.kind === "rule") {
					return <hr key={key} className="border-foreground/15" />;
				}
				if (block.kind === "code") {
					return (
						<pre
							key={key}
							className="bg-background/60 overflow-x-auto rounded p-2 font-mono text-xs whitespace-pre-wrap"
						>
							{block.text}
						</pre>
					);
				}
				if (block.kind === "list") {
					const List = block.ordered ? "ol" : "ul";
					return (
						<List
							key={key}
							className={
								block.ordered
									? "flex list-decimal flex-col gap-1 pl-5"
									: "flex list-disc flex-col gap-1 pl-4"
							}
						>
							{block.items.map((item, itemIndex) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static text
								<li key={`${key}-${itemIndex}`} className="pl-0.5">
									{inline(item, `${key}-${itemIndex}`)}
								</li>
							))}
						</List>
					);
				}
				return (
					<p key={key} className="whitespace-pre-wrap">
						{inline(block.text, key)}
					</p>
				);
			})}
		</div>
	);
}
