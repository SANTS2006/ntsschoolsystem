import { PLATFORM_LOGO, useBrand } from "@/lib/brandTheme";

interface BrandMarkProps {
  logo?: string | null;
  name?: string;
}

/** School icon (or a school's own uploaded logo) shown above the login title. */
export function BrandMark({ logo, name }: BrandMarkProps) {
  const brand = useBrand();
  logo = logo ?? brand.logo;
  name = name ?? brand.name;
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        className="size-14 rounded-2xl object-cover shadow-[0_10px_30px_-8px_color-mix(in_srgb,var(--brand-primary)_65%,transparent)]"
      />
    );
  }
  return (
    <span className="flex h-14 items-center rounded-2xl border border-[var(--color-border)] bg-white px-3 shadow-[0_10px_30px_-12px_color-mix(in_srgb,var(--brand-primary)_50%,transparent)]">
      <img src={PLATFORM_LOGO} alt="NTS School System" className="h-8 w-auto" />
    </span>
  );
}
