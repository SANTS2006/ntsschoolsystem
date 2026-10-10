import type { LucideIcon } from "lucide-react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/cn";

/** The image-cover card used for the Subjects pages, as a reusable listing card: a cover picture (or a
 * gradient with an icon when there isn't one) with the title laid over it, chips for the key facts, and
 * a footer for a short description and any action buttons. The whole card is the click target — it
 * follows the same workflow the old table row did — and buttons inside it (`actions`) don't trigger it. */
export function ImageCard({
  image,
  fallbackIcon: FallbackIcon,
  title,
  subtitle,
  chips,
  badge,
  description,
  meta,
  actions,
  onClick,
  dimmed,
}: {
  image?: string | null;
  fallbackIcon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  chips?: ReactNode[];
  /** Top-right corner of the cover — usually a status badge. */
  badge?: ReactNode;
  description?: string;
  /** Small facts under the description (when, where, who). */
  meta?: ReactNode;
  /** Icon buttons at the bottom right; clicking one never opens the card. */
  actions?: ReactNode;
  onClick?: () => void;
  dimmed?: boolean;
}) {
  const interactive = !!onClick;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (interactive && (event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
      event.preventDefault();
      onClick?.();
    }
  };

  return (
    <article
      role={interactive ? "link" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={interactive ? title : undefined}
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] transition-all duration-200",
        interactive &&
          "cursor-pointer hover:-translate-y-1 hover:shadow-[var(--shadow-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
        dimmed && "opacity-70",
      )}
    >
      <div className="relative h-44 w-full shrink-0 overflow-hidden bg-[image:var(--gradient-primary)]">
        {image ? (
          <img src={image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : (
          <FallbackIcon className="absolute inset-0 m-auto size-14 text-white/40" aria-hidden="true" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/40" aria-hidden="true" />
        {badge && <div className="absolute right-3 top-3">{badge}</div>}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 text-white">
          <div>
            <h2 className="line-clamp-2 text-base font-semibold drop-shadow-sm">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-sm text-white/90 drop-shadow-sm">{subtitle}</p>}
          </div>
          {chips && chips.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {chips.map((chip, index) => (
                <span key={index} className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {description && <p className="line-clamp-2 text-sm text-[var(--color-text-muted)]">{description}</p>}
        {meta && <div className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">{meta}</div>}
        {actions && (
          <div
            className="mt-auto flex justify-end gap-1"
            onClick={(event: MouseEvent) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>
    </article>
  );
}

/** A small icon button for an `ImageCard`'s action row. */
export function CardAction({
  label,
  icon: Icon,
  onClick,
  tone = "default",
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: "default" | "success" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-40",
        tone === "success" && "hover:text-[var(--color-success)]",
        tone === "danger" && "hover:text-[var(--color-danger)]",
        tone === "default" && "hover:text-[var(--color-primary)]",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
