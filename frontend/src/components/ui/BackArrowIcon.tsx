import type { SVGProps } from "react";

/**
 * The app's "go back" glyph — a softer, custom redraw of a plain left arrow (rounded, gently
 * curved wings instead of a sharp chevron) used as the leading icon on every "Back to …"
 * link/button. Matches lucide-react's own conventions (stroke-based, `currentColor`, same
 * `size-*` className sizing) so it drops in as a straight replacement for `ArrowLeft`.
 */
export function BackArrowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M19 12H7.5" />
      <path d="M12.5 5.5C10.3 7.7 8.2 9.8 6 12c2.2 2.2 4.3 4.3 6.5 6.5" />
    </svg>
  );
}
