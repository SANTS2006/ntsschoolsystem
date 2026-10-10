import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { cn } from "@/lib/cn";

/** The page numbers to show: first, last, and a window around the current page, with gaps as `null`. */
function pageWindow(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const result: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push(null);
    result.push(p);
  });
  return result;
}

const buttonClass =
  "inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export function Pagination({
  page,
  pageSize,
  count,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  count: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const start = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, count);

  return (
    <div className="flex flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row">
      <p className="text-sm text-[var(--color-text-muted)]">
        {count === 0 ? (
          "No results"
        ) : (
          <>
            Showing <span className="font-semibold text-[var(--color-text)]">{start}–{end}</span> of{" "}
            <span className="font-semibold text-[var(--color-text)]">{count}</span>
          </>
        )}
      </p>
      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1.5">
          <button
            type="button"
            className={cn(buttonClass, "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]")}
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            aria-label="First page"
          >
            <ChevronsLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cn(buttonClass, "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]")}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          {/* Numbered buttons need room; a phone just gets "Page x of y" between the arrows. */}
          <span className="px-2 text-sm text-[var(--color-text-muted)] sm:hidden">
            Page {page} of {totalPages}
          </span>
          <div className="hidden items-center gap-1.5 sm:flex">
            {pageWindow(page, totalPages).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="px-1 text-[var(--color-text-muted)]" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? "page" : undefined}
                  className={cn(
                    buttonClass,
                    p === page
                      ? "border-transparent bg-[image:var(--gradient-primary)] text-white shadow-[var(--shadow-sm)]"
                      : "border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)]",
                  )}
                >
                  {p}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            className={cn(buttonClass, "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]")}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cn(buttonClass, "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]")}
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            aria-label="Last page"
          >
            <ChevronsRight className="size-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
