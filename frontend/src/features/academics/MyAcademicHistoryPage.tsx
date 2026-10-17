import { useQuery } from "@tanstack/react-query";
import { Award, CalendarRange } from "lucide-react";
import { Link } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { fetchMyYearHistory, type YearStatus } from "./yearApi";

const OUTCOME_LABEL: Record<string, string> = {
  promoted: "Promoted",
  repeated: "Repeated the class",
  graduated: "Graduated",
  withdrawn: "Withdrew",
  transferred: "Transferred",
};

const STATUS_TONE: Record<YearStatus, "primary" | "neutral" | "warning"> = { active: "primary", upcoming: "neutral", closed: "warning" };

/** A student's own journey through the school, year by year: class, section, outcome, and the published results of each year. */
export function MyAcademicHistoryPage() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["academics", "my-year-history"], queryFn: fetchMyYearHistory });

  if (isLoading) return <FullPageSpinner />;
  if (isError || !data) return <Alert tone="danger">{(error as ApiError | undefined)?.message ?? "Could not load your history."}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My academic history</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Your class and results in every academic year at this school.</p>
      </div>

      {data.years.length === 0 ? (
        <EmptyState icon={CalendarRange} title="No academic years yet" description="Once you are placed in a class, each year appears here." />
      ) : (
        data.years.map((year) => (
          <Card key={year.academic_year_id}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold text-[var(--color-text)]">{year.academic_year}</CardTitle>
              <Badge tone={STATUS_TONE[year.status]}>{year.status === "active" ? "Current year" : year.status === "closed" ? "Completed" : "Upcoming"}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm">
                <span className="font-medium">{year.class}</span>
                {year.section ? ` · Section ${year.section}` : ""}
                {year.outcome && <span className="text-[var(--color-text-muted)]"> — {OUTCOME_LABEL[year.outcome] ?? year.outcome}</span>}
              </p>
              {year.results.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">No published results for this year yet.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {year.results.map((result) => (
                    <li key={result.term_id}>
                      <Link
                        to={`/my-results/${result.school_class_id}/${result.term_id}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-bg-subtle)]"
                      >
                        <Award className="size-4" aria-hidden="true" />
                        {result.term_name} results
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
