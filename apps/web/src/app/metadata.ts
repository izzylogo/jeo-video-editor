import type { Metadata } from "next";
import { SITE_INFO } from "@/site/brand";

export const baseMetaData: Metadata = {
	title: SITE_INFO.title,
	description: SITE_INFO.description,
	robots: {
		index: false,
		follow: false,
	},
	icons: {
		icon: [{ url: SITE_INFO.favicon, type: "image/svg+xml" }],
	},
};
