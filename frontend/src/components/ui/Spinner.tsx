import { PLATFORM_LOGO, useBrand } from "@/lib/brandTheme";
import { cn } from "@/lib/cn";

const SIZES = { sm: 28, md: 44, lg: 72 } as const;

/** The system's loading indicator: the logo of whoever the app is dressed as — the NTS logo on the platform
 * side, the school's own logo inside a school — with a ring running round it in the brand colours. Used for
 * pages, tables, panels and anything else that is waiting on data. */
export function Spinner({
  className,
  label = "Loading",
  size = "md",
}: {
  className?: string;
  label?: string;
  size?: keyof typeof SIZES;
}) {
  const brand = useBrand();
  const px = SIZES[size];
  return (
    <span role="status" className={cn("brand-loader inline-grid shrink-0 place-items-center", className)} style={{ width: px, height: px }}>
      <span className="brand-loader__ring" aria-hidden="true" />
      <span className="brand-loader__logo" aria-hidden="true">
        <img src={brand.logo ?? PLATFORM_LOGO} alt="" draggable={false} />
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex h-full min-h-[50vh] w-full flex-col items-center justify-center gap-3">
      <Spinner size="lg" />
      <p className="brand-loader__text text-xs font-medium tracking-wide text-[var(--color-text-muted)]">Loading…</p>
    </div>
  );
}
