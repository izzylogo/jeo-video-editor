"use client";

import { useEffect } from "react";
import { getDesktopBridge } from "@/services/desktop/bridge";

/**
 * JEO: the editor's own top bar is the window's title bar (like CapCut).
 *
 * The desktop window has no separate Windows title strip and no menu row. The
 * top 40 px of the page can be dragged to move the window, the minimise /
 * maximise / close buttons sit at its right end, and the File / Edit / View /
 * Window / Help menu only appears when Alt is pressed on its own.
 */
export function WindowFrame() {
	useEffect(() => {
		const desktop = getDesktopBridge();
		const setTitleBar = desktop?.setTitleBar;
		if (!desktop || !setTitleBar) return;
		const root = document.documentElement;
		root.dataset.jeoFrame = "1";

		// keep the window buttons readable in the light and the dark look
		const sync = () =>
			void setTitleBar({ dark: root.classList.contains("dark") }).catch(
				() => {},
			);
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });

		// Alt pressed and let go with nothing else = show the menu
		let altAlone = false;
		const onKeyDown = (event: KeyboardEvent) => {
			altAlone = event.key === "Alt" && !event.ctrlKey && !event.shiftKey && !event.metaKey;
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.key === "Alt" && altAlone) {
				event.preventDefault();
				void desktop.showAppMenu?.().catch(() => {});
			}
			altAlone = false;
		};
		const cancel = () => {
			altAlone = false;
		};
		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("keyup", onKeyUp, true);
		window.addEventListener("pointerdown", cancel, true);
		window.addEventListener("wheel", cancel, true);
		window.addEventListener("blur", cancel);
		return () => {
			observer.disconnect();
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("keyup", onKeyUp, true);
			window.removeEventListener("pointerdown", cancel, true);
			window.removeEventListener("wheel", cancel, true);
			window.removeEventListener("blur", cancel);
			delete root.dataset.jeoFrame;
		};
	}, []);

	// the strip you grab to move the window; buttons on top of it stay clickable
	return <div aria-hidden className="jeo-window-drag" />;
}
