import { User } from "lucide-react";

import { cn } from "@/lib/cn";

export type AvatarSize = "sm" | "lg" | "xl";

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: "size-8 text-xs",
  lg: "size-12 text-sm",
  xl: "size-24 text-2xl",
};

const DOT_SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: "size-2",
  lg: "size-2.5",
  xl: "size-4",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/** A single avatar shape reused everywhere a user/staff/guardian photo is shown — a real image
 * when `src` is set, otherwise initials on a gradient (when `name` is given, e.g. an identified
 * person in a menu/table) or a generic icon on a neutral background (list pickers with no name
 * context yet). `isOnline` renders a small presence dot, cut into the bottom-right corner. */
export function Avatar({
  src,
  name,
  size = "sm",
  isOnline,
  className,
}: {
  src?: string | null;
  name?: string;
  size?: AvatarSize;
  isOnline?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", SIZE_CLASSES[size], className)}>
      <span
        className={cn(
          "flex size-full items-center justify-center overflow-hidden rounded-full font-semibold",
          src
            ? "bg-[var(--color-bg-subtle)]"
            : name
              ? "bg-[image:var(--gradient-primary)] text-white"
              : "border border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]",
        )}
      >
        {src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : name ? (
          initials(name)
        ) : (
          <User className="size-1/2" aria-hidden="true" />
        )}
      </span>
      {isOnline !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-2 ring-[var(--color-surface)]",
            DOT_SIZE_CLASSES[size],
            isOnline ? "bg-[var(--color-success)]" : "bg-[var(--color-text-muted)]",
          )}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
