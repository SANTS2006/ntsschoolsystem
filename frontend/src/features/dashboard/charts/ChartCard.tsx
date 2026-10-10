import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

/** Fixed-height wrapper for every dashboard chart — recharts' `ResponsiveContainer` needs an
 * ancestor with a real height to measure against, so every chart component renders inside this
 * rather than each picking its own height ad hoc. First chart usage in the app (recharts was
 * already an installed, previously-unused dependency), so this is the pattern going forward. */
export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate text-sm font-medium text-[var(--color-text)]">{title}</CardTitle>
        {subtitle && <p className="truncate text-xs text-[var(--color-text-muted)]">{subtitle}</p>}
      </CardHeader>
      <CardContent className="h-64">{children}</CardContent>
    </Card>
  );
}
