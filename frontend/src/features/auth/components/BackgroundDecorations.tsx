import { motion, useReducedMotion } from "framer-motion";

/** Soft navy/cyan shapes behind the auth card. Purely decorative; hidden from assistive tech and
 * toned down on small screens so they never compete with the form. */
export function BackgroundDecorations() {
  const reduce = useReducedMotion();
  const fade = { initial: { opacity: reduce ? 1 : 0 }, animate: { opacity: 1 }, transition: { duration: 1.2 } };

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        {...fade}
        className="absolute -left-40 -top-40 size-[420px] rounded-full bg-[radial-gradient(circle_at_60%_60%,color-mix(in_srgb,var(--brand-primary)_85%,white)_0%,color-mix(in_srgb,var(--brand-primary)_70%,black)_60%,color-mix(in_srgb,var(--brand-primary)_30%,black)_100%)] opacity-90 sm:-left-32 sm:-top-32 sm:size-[520px]"
      />
      <motion.div
        {...fade}
        className="absolute -bottom-48 -right-40 size-[460px] rounded-full bg-[radial-gradient(circle_at_40%_40%,color-mix(in_srgb,var(--brand-secondary)_60%,white)_0%,var(--brand-secondary)_35%,var(--brand-primary)_100%)] opacity-70 blur-[2px] sm:-bottom-40 sm:-right-32 sm:size-[560px]"
      />
      <div className="absolute left-1/4 top-1/3 hidden size-72 rounded-full bg-[var(--brand-secondary)]/10 blur-3xl md:block" />
    </div>
  );
}
