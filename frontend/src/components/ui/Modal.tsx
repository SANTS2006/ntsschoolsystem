import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { cn } from "@/lib/cn";

/** Generic overlay+panel dialog — same interaction chrome as ConfirmDialog (overlay
 * click-to-dismiss, Escape key, motion transitions, role="dialog"/aria-modal) but takes
 * arbitrary `children` instead of a fixed title/description/buttons shape, for a dialog that
 * needs real form fields (e.g. InterviewInviteModal). Use `useConfirm()`/ConfirmDialog instead
 * for a plain yes/no confirmation — this is for everything else. */
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidthClassName = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-[#0b0d1a]/55 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "relative max-h-[92vh] w-full overflow-y-auto rounded-t-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] sm:max-h-[calc(100vh-2rem)] sm:rounded-[1.25rem] sm:p-6",
              maxWidthClassName,
            )}
          >
            <div className="-mx-5 -mt-5 mb-5 flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:-mx-6 sm:-mt-6 sm:px-6">
              <p id="modal-title" className="text-base font-semibold text-[var(--color-text)]">
                {title}
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 rounded-full p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text)]"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
