import { type SelectHTMLAttributes, forwardRef, useId } from "react";

import { cn } from "@/lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, id, children, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const hintId = `${selectId}-hint`;
    const errorId = `${selectId}-error`;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-semibold text-[var(--color-text)]">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            "h-11 w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3.5 text-sm shadow-[var(--shadow-sm)] text-[var(--color-text)] transition-colors",
            "focus-visible:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_18%,transparent)]",
            "disabled:cursor-not-allowed disabled:opacity-60",
            error ? "border-[var(--color-danger)]" : "border-[var(--color-border)]",
            className,
          )}
          {...props}
        >
          {children}
        </select>
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
Select.displayName = "Select";
