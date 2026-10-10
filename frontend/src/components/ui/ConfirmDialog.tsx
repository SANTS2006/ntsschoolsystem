import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { Button } from "./Button";
import { ConfirmContext, type ConfirmOptions } from "./confirmContext";

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ tone: "neutral", ...options, resolve });
    });
  }, []);

  const settle = useCallback(
    (value: boolean) => {
      pending?.resolve(value);
      setPending(null);
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    confirmButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, settle]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {pending && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-black/50"
              onClick={() => settle(false)}
              aria-hidden="true"
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full",
                    pending.tone === "danger"
                      ? "bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
                      : "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
                  )}
                >
                  {pending.tone === "danger" ? (
                    <AlertTriangle className="size-5" aria-hidden="true" />
                  ) : (
                    <HelpCircle className="size-5" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0">
                  <p id="confirm-dialog-title" className="truncate text-sm font-semibold text-[var(--color-text)]">
                    {pending.title}
                  </p>
                  {pending.description && (
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{pending.description}</p>
                  )}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => settle(false)}>
                  {pending.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  ref={confirmButtonRef}
                  type="button"
                  variant={pending.tone === "danger" ? "danger" : "primary"}
                  onClick={() => settle(true)}
                >
                  {pending.confirmLabel ?? "Confirm"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}
