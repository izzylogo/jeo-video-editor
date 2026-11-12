import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	reactStrictMode: true,
	devIndicators: false,
	typescript: {
		// The original OpenCut code has a few old type errors in files we don't
		// use. Type checking is run separately (`bun x tsc --noEmit`).
		ignoreBuildErrors: true,
	},
};

export default nextConfig;
