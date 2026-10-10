import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const toneConfig: Record<AlertTone, { icon: typeof Info; classes: string }> = {
  info: { icon: Info, classes: "border-[var(--color-primary)]/30 text-[var(--color-primary)]" },
  success: { icon: CheckCircle2, classes: "border-[var(--color-success)]/30 text-[var(--color-success)]" },
  warning: { icon: AlertTriangle, classes: "border-[var(--color-warning)]/30 text-[var(--color-warning)]" },
  danger: { icon: XCircle, classes: "border-[var(--color-danger)]/30 text-[var(--color-danger)]" },
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
}

export function Alert({ className, tone = "info", children, ...props }: AlertProps) {
  const { icon: Icon, classes } = toneConfig[tone];
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--radius-md)] border bg-[var(--color-bg-subtle)] p-3 text-sm",
        classes,
        className,
      )}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="text-[var(--color-text)]">{children}</div>
    </div>
  );
}
