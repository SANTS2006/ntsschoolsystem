import { type ButtonHTMLAttributes, type MouseEvent, forwardRef, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { getPendingMutations, subscribePendingMutations } from "@/lib/activity";
import { cn } from "@/lib/cn";

import { ActivityIndicator } from "./ActivityIndicator";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-[image:var(--gradient-primary)] text-[var(--color-primary-contrast)]",
    "hover:bg-[image:var(--gradient-primary-hover)]",
    "hover:shadow-[0_10px_30px_-8px_color-mix(in_srgb,var(--color-primary)_65%,transparent)]",
    "focus-visible:outline-[var(--color-primary)]",
  ),
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)] hover:border-[var(--color-primary)]/40 focus-visible:outline-[var(--color-primary)]",
  ghost:
    "bg-transparent text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] focus-visible:outline-[var(--color-primary)]",
  danger: cn(
    "bg-[image:var(--gradient-danger)] text-white",
    "hover:bg-[image:var(--gradient-danger-hover)]",
    "hover:shadow-[0_10px_30px_-8px_color-mix(in_srgb,var(--color-danger)_65%,transparent)]",
    "focus-visible:outline-[var(--color-danger)]",
  ),
};

const sizeClasses: Record<ButtonSize, string> = {
  // A minimum height (not a fixed one) so a long label wraps onto a second line instead of spilling out of the button on a
  // narrow screen; the side padding tightens below the `sm` breakpoint for the same reason.
  sm: "min-h-9 px-3 py-1.5 text-sm gap-1.5 sm:px-3.5",
  md: "min-h-11 px-4 py-2 text-sm gap-2 sm:px-5",
  lg: "min-h-12 px-5 py-2.5 text-base gap-2 sm:px-6",
};

/** How long after a click a button waits for work to start before deciding the click was instant. */
const WAIT_FOR_WORK_MS = 1500;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, disabled, children, onClick, ...props }, ref) => {
    // A button shows it is working in three cases: the page said so (`isLoading`), its click handler returned a
    // promise that hasn't settled, or a save/send started because of the click and hasn't finished.
    const [awaitingHandler, setAwaitingHandler] = useState(false);
    const [watching, setWatching] = useState(false);
    const sawWork = useRef(false);
    // Only a clicked button listens, so the many idle buttons on a page never re-render for this.
    const inFlight = useSyncExternalStore(subscribePendingMutations, () => (watching ? getPendingMutations() : 0));

    useEffect(() => {
      if (!watching) return;
      if (inFlight > 0) {
        sawWork.current = true;
        return;
      }
      if (sawWork.current) {
        sawWork.current = false;
        setWatching(false);
        return;
      }
      const timer = window.setTimeout(() => setWatching(false), WAIT_FOR_WORK_MS);
      return () => window.clearTimeout(timer);
    }, [watching, inFlight]);

    // Double taps happen all the time on slow phones (nothing seems to happen, so people press again). A second click right
    // after the first is ignored; the server independently refuses to repeat the same write (see lib/api-client).
    const lastClick = useRef(0);

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      const now = Date.now();
      if (now - lastClick.current < 500) {
        event.preventDefault();
        return;
      }
      lastClick.current = now;
      const result: unknown = onClick?.(event);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        setAwaitingHandler(true);
        (result as Promise<unknown>).then(
          () => setAwaitingHandler(false),
          () => setAwaitingHandler(false),
        );
      }
      sawWork.current = false;
      setWatching(true);
    };

    const busy = !!isLoading || awaitingHandler || (watching && inFlight > 0);

    return (
      <button
        ref={ref}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        onClick={handleClick}
        className={cn(
          "inline-flex max-w-full items-center justify-center rounded-[var(--radius-md)] text-center font-semibold leading-snug transition-all duration-200 ease-out [&>svg]:shrink-0",
          "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:active:scale-100",
          // A working button stays fully visible (not greyed like a disabled one) so the indicator reads clearly.
          busy && "cursor-progress disabled:opacity-90",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {busy && <ActivityIndicator />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
