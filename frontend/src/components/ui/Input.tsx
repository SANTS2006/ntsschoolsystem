import type { LucideIcon } from "lucide-react";
import { type InputHTMLAttributes, forwardRef, useId } from "react";

import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
  /** Rendered in place of the icon slot, right-aligned (e.g. a show/hide-password toggle). */
  trailing?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, icon: Icon, trailing, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-[var(--color-text)]">
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <Icon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]"
              aria-hidden="true"
            />
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            className={cn(
              "h-11 w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3.5 text-sm shadow-[var(--shadow-sm)] text-[var(--color-text)] transition-colors",
              "placeholder:text-[var(--color-text-muted)]",
              "focus-visible:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_18%,transparent)]",
              "disabled:cursor-not-allowed disabled:opacity-60",
              Icon && "pl-10",
              trailing && "pr-10",
              error ? "border-[var(--color-danger)]" : "border-[var(--color-border)]",
              className,
            )}
            {...props}
          />
          {trailing && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>
          )}
        </div>
        {error ? (
          <p id={errorId} className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-sm text-[var(--color-text-muted)]">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";
