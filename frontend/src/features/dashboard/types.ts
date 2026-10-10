export type KpiFormat = "number" | "percent" | "currency" | "text";
export type KpiTone = "neutral" | "success" | "warning" | "danger";

export interface DashboardKpi {
  key: string;
  label: string;
  /** null = no data to calculate it from yet. */
  value: number | string | null;
  format: KpiFormat;
  tone: KpiTone;
  hint: string;
  link: string | null;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface DashboardChartSpec {
  key: string;
  title: string;
  kind: "bar" | "line" | "pie";
  data: ChartPoint[];
  format: KpiFormat;
  empty: string;
}

export interface DashboardTableSpec {
  key: string;
  title: string;
  columns: string[];
  rows: (string | number)[][];
  link: string | null;
  empty: string;
}

export interface DashboardAlert {
  tone: "info" | "warning" | "danger" | "success";
  message: string;
  link: string | null;
}

export interface DashboardFilters {
  /** null for roles whose dashboard is personal (teacher, student). */
  options: { terms: { id: string; name: string; is_current: boolean }[]; classes: { id: string; name: string }[] } | null;
  applied: { term: string | null; school_class: string | null };
}

export interface ComparisonRow {
  key: string;
  label: string;
  format: KpiFormat;
  current: number | null;
  previous: number | null;
  delta: number | null;
  /** null when there is no baseline to take a percentage of. */
  delta_pct: number | null;
}

export interface TermComparison {
  current: { id: string; name: string; year: string };
  previous: { id: string; name: string; year: string } | null;
  rows: ComparisonRow[];
}

export interface RoleDashboard {
  filters: DashboardFilters | null;
  comparison: TermComparison | null;
  role: string | null;
  title: string;
  subtitle: string;
  kpis: DashboardKpi[];
  charts: DashboardChartSpec[];
  tables: DashboardTableSpec[];
  alerts: DashboardAlert[];
  actions: { label: string; to: string }[];
  /** Figures the school can't have yet, and why — shown instead of an invented number. */
  unavailable: { label: string; reason: string }[];
}
