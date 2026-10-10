import { ChevronRight } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRowLink,
} from "@/components/ui/Table";
import type { ApiError } from "@/lib/api-client";

import { useMySubjectCA } from "./useAcademicsCrud";

export function MySubjectCAPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useMySubjectCA(id);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate("/my-subjects")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to my subjects
      </button>

      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Continuous Assessment</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Your scores on each assessment and your total CA so far.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total CA</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold text-[var(--color-text)]">
            {data?.total_ca ?? "—"}
            {data?.total_ca && <span className="text-sm font-normal text-[var(--color-text-muted)]"> / CA weight</span>}
          </p>
          {!data?.total_ca && (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              No assessments have been submitted yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assessments</CardTitle>
        </CardHeader>
        <CardContent>
          {!data || data.assessments.length === 0 ? (
            <EmptyState title="No assessments yet" description="Your teacher hasn't added any assessments yet." />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Assessment</TableHeaderCell>
                    <TableHeaderCell>Score</TableHeaderCell>
                    <TableHeaderCell>Maximum</TableHeaderCell>
                    <TableHeaderCell>Weight</TableHeaderCell>
                    <TableHeaderCell>Weighted score</TableHeaderCell>
                    <TableHeaderCell className="w-24" />
                  </tr>
                </TableHead>
                <TableBody>
                  {data.assessments.map((row) => (
                    <TableRowLink key={row.assessment} onClick={() => navigate(`/my-subjects/${id}/ca/${row.assessment}`)}>
                      <TableCell className="card-title-cell font-medium">
                        <span className="text-[var(--color-primary)]">{row.name}</span>
                        {row.allow_file_uploads && (
                          <p className="mt-0.5 text-xs font-normal text-[var(--color-text-muted)]">
                            {row.upload_state === "open"
                              ? `Upload open${row.upload_deadline_text ? ` until ${row.upload_deadline_text}` : ""}`
                              : "Uploads closed"}
                            {` · ${row.my_files.length} file${row.my_files.length === 1 ? "" : "s"} handed in`}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.raw_score ?? "Not graded yet"}
                        {row.discretionary_weight > 0 && (
                          <span className="ml-1 text-[var(--color-text-muted)]">
                            + {row.discretionary_mark ?? "—"} / {row.discretionary_weight} from your teacher
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{row.max_score}</TableCell>
                      <TableCell>{row.weight}%</TableCell>
                      <TableCell>{row.weighted_score ?? "—"}</TableCell>
                      <TableCell className="text-[var(--color-primary)]">
                        <span className="inline-flex items-center gap-1 text-sm font-medium">
                          Open <ChevronRight className="size-4" aria-hidden="true" />
                        </span>
                      </TableCell>
                    </TableRowLink>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
