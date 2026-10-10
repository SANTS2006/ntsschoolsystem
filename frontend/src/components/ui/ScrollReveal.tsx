import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Fades + slides a page section in as it scrolls into view. Apply at page-section granularity
 * only (a page header, a stat row, a main content card) — never per-table-row, which would cause
 * jank scrolling a large table. `once: true` so it never re-triggers on scroll-up. */
export function ScrollReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.35, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
