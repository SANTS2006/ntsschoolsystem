import type { ReactNode } from "react";

/** The heading every page opens with: title and a muted line on the left, the page's main actions on the right.
 * On a phone the actions drop below the title and stretch to fill the row, so nothing is squeezed or cut off. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 [&>*]:max-sm:flex-1">{actions}</div>}
    </div>
  );
}
