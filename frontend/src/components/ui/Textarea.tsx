import { type TextareaHTMLAttributes, forwardRef, useId } from "react";

import { cn } from "@/lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/** Multi-line sibling of `Input` — same label/error/hint layout and focus styling. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, rows = 4, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;
    const hintId = `${textareaId}-hint`;
    const errorId = `${textareaId}-error`;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-medium text-[var(--color-text)]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            "w-full resize-y rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors",
            "placeholder:text-[var(--color-text-muted)]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
            "disabled:cursor-not-allowed disabled:opacity-60",
            error ? "border-[var(--color-danger)]" : "border-[var(--color-border)]",
            className,
          )}
          {...props}
        />
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
Textarea.displayName = "Textarea";
