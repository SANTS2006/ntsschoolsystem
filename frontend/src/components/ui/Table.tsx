import { type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes, forwardRef, useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/cn";

/** On a phone the table turns into a stack of cards, one per row (see `.table-cards` in index.css), with
 * each value labelled by its column heading. The labels are copied from the header cells here, so no page
 * has to supply them. Pass `cards={false}` for a grid that only makes sense as a real table. */
export function TableContainer({
  className,
  cards = true,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { cards?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!cards) return;
    const table = ref.current?.querySelector(":scope > table");
    if (!table) return;
    const labels = Array.from(table.querySelectorAll(":scope > thead th")).map((th) => th.textContent?.trim() ?? "");
    table.querySelectorAll(":scope > tbody > tr").forEach((row) => {
      Array.from(row.children).forEach((cell, index) => {
        const wide = cell.getAttribute("colspan");
        cell.setAttribute("data-label", wide ? "" : (labels[index] ?? ""));
      });
    });
  });

  return (
    <div
      ref={ref}
      className={cn(
        "overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]",
        cards && "table-cards",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table ref={ref} className={cn("w-full border-collapse text-sm", className)} {...props} />
  ),
);
Table.displayName = "Table";

export const TableHead = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]", className)} {...props} />
  ),
);
TableHead.displayName = "TableHead";

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={className} {...props} />,
);
TableBody.displayName = "TableBody";

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b border-[var(--color-border)] transition-colors last:border-0 hover:bg-[var(--color-bg-subtle)]/60", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

export const TableHeaderCell = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "whitespace-nowrap px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]",
        className,
      )}
      {...props}
    />
  ),
);
TableHeaderCell.displayName = "TableHeaderCell";

/** A table cell keeps its content on one line. The container scrolls sideways when the columns don't
 * all fit, and a single very long value is cut off with an ellipsis (its full text is the tooltip) rather
 * than stretching the whole table. A column that genuinely needs to wrap can opt out with
 * `className="whitespace-normal"` (and `max-w-none` to lift the width cap). */
export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, title, children, ...props }, ref) => (
    <td
      ref={ref}
      title={title ?? (typeof children === "string" ? children : undefined)}
      className={cn(
        "max-w-[22rem] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 text-[var(--color-text)]",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  ),
);
TableCell.displayName = "TableCell";

export const TableRowLink = forwardRef<
  HTMLTableRowElement,
  HTMLAttributes<HTMLTableRowElement> & { onClick?: () => void }
>(({ className, onClick, ...props }, ref) => (
  <tr
    ref={ref}
    onClick={onClick}
    className={cn(
      "border-b border-[var(--color-border)] transition-colors last:border-0",
      onClick ? "cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]" : "hover:bg-[var(--color-bg-subtle)]/60",
      className,
    )}
    {...props}
  />
));
TableRowLink.displayName = "TableRowLink";
