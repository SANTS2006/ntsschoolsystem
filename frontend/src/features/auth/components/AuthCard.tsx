import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import { useBrand } from "@/lib/brandTheme";

import { BrandPanel } from "./BrandPanel";

interface AuthCardProps {
  /** Icon/logo shown above the title. */
  mark: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Shared two-column shell: form on the left, brand panel on the right. On phones the brand panel
 * stacks on top and the form sits below it. */
export function AuthCard({ mark, title, subtitle, children, footer }: AuthCardProps) {
  const reduce = useReducedMotion();
  const brand = useBrand();
  // Pages pass the platform name by default; inside a school it reads as the school instead.
  const heading = subtitle === "NTS School System" ? brand.name : subtitle;
  const item = (i: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: 0.25 + i * 0.07 },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="grid w-full max-w-[960px] overflow-hidden rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_30px_80px_-20px_color-mix(in_srgb,var(--brand-primary)_40%,transparent)] md:min-h-[540px] md:grid-cols-2"
    >
      <div className="order-2 flex flex-col justify-center px-6 md:order-1 py-8 sm:px-10 md:px-12 md:py-12">
        <motion.div {...item(0)} className="mb-7 flex flex-col items-start">
          {mark}
          {heading && <p className="mt-4 text-sm text-[var(--color-text-muted)]">{heading}</p>}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--color-text)]">{title}</h1>
        </motion.div>
        <motion.div {...item(1)}>{children}</motion.div>
        {footer && <motion.div {...item(2)}>{footer}</motion.div>}
      </div>
      <BrandPanel className="order-1 md:order-2" />
    </motion.div>
  );
}
