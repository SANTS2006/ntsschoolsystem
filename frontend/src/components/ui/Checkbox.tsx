import { type InputHTMLAttributes, forwardRef, useId } from "react";

import { cn } from "@/lib/cn";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hint?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, hint, id, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={checkboxId} className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            className={cn(
              "size-4 shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] accent-[var(--color-primary)]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
              className,
            )}
            {...props}
          />
          {label}
        </label>
        {hint && <p className="pl-6 text-xs text-[var(--color-text-muted)]">{hint}</p>}
      </div>
    );
  },
);
Checkbox.displayName = "Checkbox";
