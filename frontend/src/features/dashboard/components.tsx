import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Alert } from "@/components/ui/Alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { cn } from "@/lib/cn";

import { ChartCard } from "./charts/ChartCard";
import { PIE_COLORS, TOOLTIP_STYLE } from "./charts/chartTheme";
import { formatValue } from "./format";
import { SafeSection } from "./SafeSection";
import type {
  DashboardAlert,
  DashboardChartSpec,
  DashboardFilters,
  DashboardKpi,
  DashboardTableSpec,
  KpiTone,
  TermComparison,
} from "./types";

const TONE_BAR: Record<KpiTone, string> = {
  neutral: "bg-[var(--color-primary)]",
  success: "bg-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]",
  danger: "bg-[var(--color-danger)]",
};

/** One headline figure. The coloured edge carries the status; a card with a link drills into the detail. */
export function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  const body = (
    <Card className={cn("relative h-full overflow-hidden transition-shadow", kpi.link && "hover:shadow-[var(--shadow-md)]")}>
      <span className={cn("absolute inset-y-0 left-0 w-1", TONE_BAR[kpi.tone])} aria-hidden="true" />
      <CardContent className="flex flex-col gap-1 p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-[var(--color-text-muted)]">{kpi.label}</p>
          {kpi.link && <ArrowUpRight className="size-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />}
        </div>
        <p className="text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">{formatValue(kpi.value, kpi.format)}</p>
        {kpi.hint && <p className="text-xs text-[var(--color-text-muted)]">{kpi.hint}</p>}
      </CardContent>
    </Card>
  );
  return kpi.link ? (
    <Link to={kpi.link} className="block h-full rounded-[var(--radius-lg)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]">
      {body}
    </Link>
  ) : (
    body
  );
}

export function KpiGrid({ kpis }: { kpis: DashboardKpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <SafeSection key={kpi.key} label={kpi.label}>
          <KpiCard kpi={kpi} />
        </SafeSection>
      ))}
    </div>
  );
}

const AXIS = { fontSize: 11, fill: "var(--color-text-muted)" };

export function DashboardChart({ spec }: { spec: DashboardChartSpec }) {
  const tooltipFormat = (v: unknown) => formatValue(typeof v === "number" ? v : Number(v), spec.format);
  const data = spec.data.map((p) => ({ name: p.label, value: p.value }));
  return (
    <ChartCard title={spec.title}>
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-center text-sm text-[var(--color-text-muted)]">{spec.empty}</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          {spec.kind === "pie" ? (
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {data.map((entry, i) => (
                  <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormat} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          ) : spec.kind === "line" ? (
            <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={AXIS} />
              <YAxis tick={AXIS} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormat} />
              <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={AXIS} interval={0} />
              <YAxis tick={AXIS} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormat} />
              <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function DashboardTable({ spec }: { spec: DashboardTableSpec }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium">{spec.title}</CardTitle>
        {spec.link && (
          <Link to={spec.link} className="text-xs font-medium text-[var(--color-primary)]">
            View all
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {spec.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">{spec.empty}</p>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  {spec.columns.map((column) => (
                    <TableHeaderCell key={column}>{column}</TableHeaderCell>
                  ))}
                </tr>
              </TableHead>
              <TableBody>
                {spec.rows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j} className={j === 0 ? "font-medium" : undefined}>
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** "Needs attention": what the numbers say should be looked at today, each linking to where it is handled. */
export function AttentionList({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" aria-label="Needs attention">
      {alerts.map((alert) => (
        <Alert key={alert.message} tone={alert.tone}>
          {alert.link ? (
            <Link to={alert.link} className="">
              {alert.message}
            </Link>
          ) : (
            alert.message
          )}
        </Alert>
      ))}
    </div>
  );
}

export function QuickActions({ actions }: { actions: { label: string; to: string }[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Link
          key={action.to + action.label}
          to={action.to}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="h-9 w-64 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)]" />
        ))}
      </div>
    </div>
  );
}

export function FilterBar({
  filters,
  onChange,
}: {
  filters: DashboardFilters;
  onChange: (next: { term?: string; school_class?: string }) => void;
}) {
  const options = filters.options;
  if (!options) return null;
  const select =
    "rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]";
  const { term, school_class } = filters.applied;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Dashboard filters">
      <select
        aria-label="Term"
        className={select}
        value={term ?? ""}
        onChange={(e) => onChange({ term: e.target.value || undefined, school_class: school_class ?? undefined })}
      >
        <option value="">All terms</option>
        {options.terms.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.is_current ? " (current)" : ""}
          </option>
        ))}
      </select>
      <select
        aria-label="Class"
        className={select}
        value={school_class ?? ""}
        onChange={(e) => onChange({ term: term ?? undefined, school_class: e.target.value || undefined })}
      >
        <option value="">All classes</option>
        {options.classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {(term || school_class) && (
        <button type="button" onClick={() => onChange({})} className="text-sm font-medium text-[var(--color-primary)]">
          Clear filters
        </button>
      )}
    </div>
  );
}

/** This term against the one before it. Green/red follows whether the change is an increase or a decrease; a row with
 * no baseline shows the figure alone rather than an invented percentage. */
export function ComparisonCard({ comparison }: { comparison: TermComparison }) {
  const { current, previous } = comparison;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {current.name} ({current.year})
          {previous ? ` compared with ${previous.name} (${previous.year})` : " — there is no earlier term to compare with"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {comparison.rows.map((row) => {
            const up = row.delta !== null && row.delta > 0;
            const flat = row.delta === 0;
            return (
              <li key={row.key} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <p className="text-xs text-[var(--color-text-muted)]">{row.label}</p>
                <p className="text-xl font-bold text-[var(--color-text)]">{formatValue(row.current, row.format)}</p>
                {previous && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">was {formatValue(row.previous, row.format)}</p>}
                {row.delta !== null && (
                  <p
                    className={cn(
                      "mt-1 text-xs font-medium",
                      flat ? "text-[var(--color-text-muted)]" : up ? "text-[var(--color-success)]" : "text-[var(--color-danger)]",
                    )}
                  >
                    {flat
                      ? "No change"
                      : `${up ? "▲" : "▼"} ${Math.abs(row.delta).toLocaleString(undefined, { maximumFractionDigits: 1 })}${row.format === "percent" ? " pts" : ""}`}
                    {row.delta_pct !== null && !flat ? ` (${row.delta_pct > 0 ? "+" : ""}${row.delta_pct}%)` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
