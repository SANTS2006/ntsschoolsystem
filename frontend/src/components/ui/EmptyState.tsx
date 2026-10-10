import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-14 text-center">
      {Icon && (
        <span className="mb-1 flex size-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] text-[var(--color-primary)]">
          <Icon className="size-7" aria-hidden="true" />
        </span>
      )}
      <p className="text-base font-semibold text-[var(--color-text)]">{title}</p>
      {description && <p className="max-w-sm text-sm text-[var(--color-text-muted)]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
