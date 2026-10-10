import { Hash } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { StatTone } from "@/features/dashboard/StatCard";
import { StatCard } from "@/features/dashboard/StatCard";

export interface StatRowItem {
  key: string;
  label: string;
  value: React.ReactNode;
  tone?: StatTone;
  icon?: LucideIcon;
  footnote?: string;
}

/** The established 3-up stat-card grid convention (`DashboardPage`/`PlatformOverviewPage`),
 * generalized for any module's list page. Items without an explicit `icon` fall back to a
 * generic one — most module summaries (a count, a status breakdown) don't need per-stat
 * iconography the way the Dashboard's hand-picked stats do. */
export function StatRow({ items }: { items: StatRowItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
      {items.map(({ key, icon, ...props }) => (
        <StatCard key={key} icon={icon ?? Hash} {...props} />
      ))}
    </div>
  );
}
