import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { cn } from "@/lib/cn";

import { ToastContext, type ToastInput } from "./toastContext";

interface ToastItem extends ToastInput {
  id: string;
}

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: ToastInput) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, tone: "success", ...toast }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-[var(--radius-md)] border bg-[var(--color-surface)] p-3 shadow-[var(--shadow-md)]",
                toast.tone === "danger" ? "border-[var(--color-danger)]/30" : "border-[var(--color-success)]/30",
              )}
            >
              {toast.tone === "danger" ? (
                <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--color-danger)]" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--color-text)]">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
