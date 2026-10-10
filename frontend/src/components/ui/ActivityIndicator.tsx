import { cn } from "@/lib/cn";

/** The small "something is happening" mark inside a button that is working: a ring with a bright comet running
 * round it, in the button's own text colour, with a steady dot in the middle. Sized by the surrounding text. */
export function ActivityIndicator({ className }: { className?: string }) {
  return (
    <span className={cn("activity-indicator", className)} aria-hidden="true">
      <span className="activity-indicator__ring" />
      <span className="activity-indicator__dot" />
    </span>
  );
}
