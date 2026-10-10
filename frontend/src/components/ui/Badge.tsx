import { type HTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "primary";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]",
  success: "bg-[color-mix(in_srgb,var(--color-success)_15%,transparent)] text-[var(--color-success)]",
  warning: "bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)]",
  danger: "bg-[color-mix(in_srgb,var(--color-danger)_15%,transparent)] text-[var(--color-danger)]",
  primary: "bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)]",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone = "neutral", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ring-current/15",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";
