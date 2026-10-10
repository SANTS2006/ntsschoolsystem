import { useSyncExternalStore } from "react";

/** Who the app is currently dressed as: the platform (NTS logo, logo colours) or one school (its logo and
 * the two colours the platform admin picked for it). Everything coloured in the app reads CSS variables
 * built from `--brand-primary` / `--brand-secondary` (see index.css), so switching brand is just setting
 * those two on <html>; the loading screens read the logo and name from here. */
export interface Brand {
  name: string;
  logo: string | null;
  primary: string;
  secondary: string;
  isSchool: boolean;
}

export const PLATFORM_BRAND: Brand = {
  name: "NTS School System",
  logo: null,
  primary: "#1565c0",
  secondary: "#22d3ee",
  isSchool: false,
};

/** The NTS logo — shown by the loaders whenever there isn't a school logo. */
export const PLATFORM_LOGO = "/nts-logo.webp";

const HEX = /^#[0-9a-fA-F]{6}$/;

let current: Brand = PLATFORM_BRAND;
const listeners = new Set<() => void>();

function applyColors(brand: Brand) {
  const root = document.documentElement;
  if (brand.primary.toLowerCase() === PLATFORM_BRAND.primary && brand.secondary.toLowerCase() === PLATFORM_BRAND.secondary) {
    root.style.removeProperty("--brand-primary");
    root.style.removeProperty("--brand-secondary");
  } else {
    root.style.setProperty("--brand-primary", brand.primary);
    root.style.setProperty("--brand-secondary", brand.secondary);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", brand.primary);
  applyTabIdentity(brand);
}

const DEFAULT_ICON = "/icons/favicon-48.png";
const DEFAULT_TOUCH_ICON = "/icons/apple-touch-icon.png";

/** The browser tab: the school's name and logo while inside a school (including its sign-in page), the platform's
 * own name and icon everywhere else. */
function applyTabIdentity(brand: Brand) {
  document.title = brand.name;
  const logo = brand.isSchool ? brand.logo : null;

  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) {
    icon.href = logo ?? DEFAULT_ICON;
    // The platform icon is a 48px PNG; a school's logo can be any image type or size.
    if (logo) {
      icon.removeAttribute("type");
      icon.removeAttribute("sizes");
    } else {
      icon.type = "image/png";
      icon.setAttribute("sizes", "48x48");
    }
  }
  const touch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (touch) touch.href = logo ?? DEFAULT_TOUCH_ICON;
}

export function setBrand(next: Partial<Brand> | null): void {
  const merged: Brand = {
    name: next?.name || PLATFORM_BRAND.name,
    logo: next?.logo ?? null,
    primary: next?.primary && HEX.test(next.primary) ? next.primary : PLATFORM_BRAND.primary,
    secondary: next?.secondary && HEX.test(next.secondary) ? next.secondary : PLATFORM_BRAND.secondary,
    isSchool: !!next?.name,
  };
  if (JSON.stringify(merged) === JSON.stringify(current)) return;
  current = merged;
  applyColors(merged);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBrand(): Brand {
  return useSyncExternalStore(subscribe, () => current, () => PLATFORM_BRAND);
}
