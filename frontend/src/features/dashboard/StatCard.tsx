import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

export type StatTone = "neutral" | "success" | "warning" | "danger";

const toneClasses: Record<StatTone, string> = {
  neutral: "bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]",
  success: "bg-[color-mix(in_srgb,var(--color-success)_15%,transparent)] text-[var(--color-success)]",
  warning: "bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)]",
  danger: "bg-[color-mix(in_srgb,var(--color-danger)_15%,transparent)] text-[var(--color-danger)]",
};

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "neutral",
  footnote,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: StatTone;
  footnote?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-3.5 sm:gap-4 sm:p-5">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-12 sm:rounded-2xl", toneClasses[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-[var(--color-text-muted)]">{label}</p>
          <p className="mt-0.5 truncate text-2xl font-bold tracking-tight text-[var(--color-text)]">{value}</p>
          {footnote && <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">{footnote}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
