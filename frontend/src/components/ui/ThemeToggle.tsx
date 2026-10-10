import { Moon, Sun } from "lucide-react";

import { type ThemeMode, useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/cn";

const NEXT_THEME: Record<ThemeMode, ThemeMode> = {
  light: "dark",
  dark: "light",
};

const THEME_ICON: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
};

const THEME_LABEL: Record<ThemeMode, string> = {
  light: "Light theme",
  dark: "Dark theme",
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const Icon = THEME_ICON[theme];
  const next = NEXT_THEME[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`${THEME_LABEL[theme]} — switch to ${THEME_LABEL[next].toLowerCase()}`}
      title={`${THEME_LABEL[theme]} (click for ${THEME_LABEL[next].toLowerCase()})`}
      className={cn(
        "rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-muted)] transition-colors duration-200 hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text)]",
        className,
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
