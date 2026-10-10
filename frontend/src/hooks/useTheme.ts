import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "nts-theme";

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function readStoredTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage unavailable (private mode, disabled storage) — fall through to OS preference.
  }
  return systemPrefersDark() ? "dark" : "light";
}

/** `data-theme` itself is already applied synchronously by an inline script in `index.html`
 * (before this hook's first render) to avoid a flash of the wrong theme — this hook's job is
 * just to track the current choice for UI (which icon the toggle shows) and persist changes. */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Theme still applies for this page load even if it can't be persisted.
    }
  }, []);

  return { theme, setTheme };
}
