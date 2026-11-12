import { cn } from "@/utils/ui";

/**
 * JEO Editor mark: a head tag (▼) above a caption bar.
 * The tile uses the accent colour, so it follows the accent picker.
 */
export function JeoLogo({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 64 64"
			className={cn("size-6", className)}
			role="img"
			aria-label="JEO Editor"
		>
			<rect x="2" y="2" width="60" height="60" rx="15" className="fill-primary" />
			<path
				d="M20 17h24a2.5 2.5 0 0 1 2.1 3.9L34.2 37.6a2.6 2.6 0 0 1-4.4 0L17.9 20.9A2.5 2.5 0 0 1 20 17z"
				fill="#ffffff"
			/>
			<rect x="15" y="44" width="34" height="7" rx="3.5" fill="#ffffff" />
		</svg>
	);
}
