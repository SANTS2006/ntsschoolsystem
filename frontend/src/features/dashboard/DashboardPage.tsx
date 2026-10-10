import { RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useCurrentUser } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import {
  AttentionList,
  ComparisonCard,
  DashboardChart,
  DashboardTable,
  FilterBar,
  KpiGrid,
  QuickActions,
} from "./components";
import { SafeSection } from "./SafeSection";
import { useRoleDashboard } from "./useDashboard";

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** The home page. What it shows is decided by the server from the role the person is working as: each role gets its
 * own key figures, charts, tables and shortcuts, built only from what that role may see. */
export function DashboardPage() {
  const { data: user } = useCurrentUser();
  const [search, setSearch] = useSearchParams();
  const params = { term: search.get("term") ?? undefined, school_class: search.get("school_class") ?? undefined };
  const { data, isLoading, isError, error, refetch, isFetching } = useRoleDashboard(params);
  const setFilters = (next: { term?: string; school_class?: string }) => {
    const out = new URLSearchParams();
    if (next.term) out.set("term", next.term);
    if (next.school_class) out.set("school_class", next.school_class);
    setSearch(out, { replace: true });
  };

  if (isLoading) return <FullPageSpinner />;

  if (isError || !data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert tone="danger">{(error as ApiError | null)?.message ?? "The dashboard could not be loaded."}</Alert>
        <Button variant="secondary" onClick={() => void refetch()} isLoading={isFetching}>
          <RefreshCw className="size-4" aria-hidden="true" /> Try again
        </Button>
      </div>
    );
  }

  const empty = data.kpis.length === 0 && data.charts.length === 0 && data.tables.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">
            {greeting()}
            {user?.first_name ? `, ${user.first_name}` : ""}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {data.title}
            {data.subtitle ? ` — ${data.subtitle}` : ""}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void refetch()} isLoading={isFetching}>
          <RefreshCw className="size-4" aria-hidden="true" /> Refresh
        </Button>
      </div>

      {data.filters && <FilterBar filters={data.filters} onChange={setFilters} />}
      <QuickActions actions={data.actions} />
      <AttentionList alerts={data.alerts} />

      {empty ? (
        <EmptyState
          title="Nothing to show here yet"
          description="Your role doesn't have any dashboard figures. Use the menu to open the modules you can work in."
        />
      ) : (
        <>
          {data.kpis.length > 0 && <KpiGrid kpis={data.kpis} />}
          {data.comparison && (
            <SafeSection label="Term comparison">
              <ComparisonCard comparison={data.comparison} />
            </SafeSection>
          )}
          {data.charts.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {data.charts.map((chart) => (
                <SafeSection key={chart.key} label={chart.title}>
                  <DashboardChart spec={chart} />
                </SafeSection>
              ))}
            </div>
          )}
          {data.tables.length > 0 && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {data.tables.map((table) => (
                <SafeSection key={table.key} label={table.title}>
                  <DashboardTable spec={table} />
                </SafeSection>
              ))}
            </div>
          )}
        </>
      )}

      {data.unavailable.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-text-muted)]">
          <p className="font-medium text-[var(--color-text)]">Not available yet</p>
          <ul className="mt-1 list-disc pl-4">
            {data.unavailable.map((item) => (
              <li key={item.label}>
                {item.label} — {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
