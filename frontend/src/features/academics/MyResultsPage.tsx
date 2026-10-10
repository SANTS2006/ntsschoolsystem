import { ScrollText } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { useMyResults } from "./useAcademicsCrud";

export function MyResultsPage() {
  const navigate = useNavigate();
  const { data: results, isLoading, isError, error } = useMyResults();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  const byYear = new Map<string, typeof results>();
  for (const result of results ?? []) {
    const list = byYear.get(result.academic_year_name) ?? [];
    list.push(result);
    byYear.set(result.academic_year_name, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My Results</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Your published results, grouped by academic year.
        </p>
      </div>

      {!results || results.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No published results yet"
          description="Once your school publishes a term's results, they'll appear here."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(byYear.entries()).map(([year, entries]) => (
            <Card key={year}>
              <CardHeader>
                <CardTitle>{year}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {entries?.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => navigate(`/my-results/${entry.school_class}/${entry.term}`)}
                    className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3 text-left transition-colors hover:border-[var(--color-primary)]"
                  >
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      {entry.term_name} — {entry.school_class_name}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      Published {new Date(entry.published_at).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
