import { Save } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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
  TableRow,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { useStateFromSource } from "@/hooks/useStateFromSource";

import type { PassStatus } from "./types";
import { useSubjectsHomePath } from "./useSubjectsHomePath";
import { useSaveSubjectResults, useSubjectOffering, useSubjectResults } from "./useAcademicsCrud";

const PASS_STATUS_LABEL: Record<PassStatus, string> = {
  pass: "PASS",
  near_pass: "NEAR PASS",
  fail: "FAIL",
  incomplete: "INCOMPLETE",
};

const PASS_STATUS_TONE: Record<PassStatus, BadgeTone> = {
  pass: "success",
  near_pass: "warning",
  fail: "danger",
  incomplete: "neutral",
};

export function SubjectResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const subjectsHome = useSubjectsHomePath();
  const { showToast } = useToast();

  const { data: offering, isLoading: isLoadingOffering } = useSubjectOffering(id);
  const { data: resultsData, isLoading: isLoadingResults } = useSubjectResults(id);
  const saveResults = useSaveSubjectResults(id ?? "");

  const [values, setValues] = useStateFromSource(resultsData, (loaded) => {
    const next: Record<string, string> = {};
    for (const row of loaded?.rows ?? []) {
      next[row.student] = row.exam_score ?? "";
    }
    return next;
  });

  const examMaxScore = resultsData?.exam_max_score ?? offering?.exam_max_score ?? "100";

  const handleSave = () => {
    const entries = Object.entries(values).map(([student, exam_score]) => ({
      student,
      exam_score: exam_score === "" ? null : exam_score,
    }));
    saveResults.mutate(
      { entries },
      {
        onSuccess: () => showToast({ title: "Exam scores saved" }),
        onError: (err: ApiError) => showToast({ title: "Could not save", description: err.message, tone: "danger" }),
      },
    );
  };

  if (isLoadingOffering || isLoadingResults) {
    return <FullPageSpinner />;
  }

  if (!offering) {
    return <Alert tone="danger">Subject offering not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(subjectsHome)}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        {subjectsHome === "/subjects" ? "Back to subjects" : subjectsHome === "/examinations/gradebook" ? "Back to gradebook" : "Back to subject offerings"}
      </button>

      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          {offering.subject_name} — {offering.school_class_name} · Exam & Final Results
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {offering.term_name} · Exam out of {examMaxScore} · CA {offering.ca_weight_percent}% / Exam{" "}
          {offering.exam_weight_percent}% · Pass mark {offering.pass_mark}%
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Final results</CardTitle>
        </CardHeader>
        <CardContent>
          {!resultsData || resultsData.rows.length === 0 ? (
            <EmptyState
              title="No enrolled students"
              description="Enroll students into this subject before entering exam scores."
            />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Student</TableHeaderCell>
                    <TableHeaderCell>Exam score</TableHeaderCell>
                    <TableHeaderCell>CA contribution</TableHeaderCell>
                    <TableHeaderCell>Exam contribution</TableHeaderCell>
                    <TableHeaderCell>Final score</TableHeaderCell>
                    <TableHeaderCell>Grade</TableHeaderCell>
                    {resultsData.is_tertiary && <TableHeaderCell>Points</TableHeaderCell>}
                    <TableHeaderCell>Status</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {resultsData.rows.map((row) => (
                    <TableRow key={row.student}>
                      <TableCell className="font-medium">
                        {row.student_name}
                        <span className="ml-1 text-[var(--color-text-muted)]">({row.student_admission_number})</span>
                      </TableCell>
                      <TableCell>
                        <input
                          type="number"
                          aria-label={`Exam score for ${row.student_name}`}
                          min={0}
                          max={Number(examMaxScore)}
                          step="0.01"
                          value={values[row.student] ?? ""}
                          onChange={(e) => setValues((prev) => ({ ...prev, [row.student]: e.target.value }))}
                          className="w-24 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)]"
                        />
                      </TableCell>
                      <TableCell>{row.ca_contribution ?? "Not graded yet"}</TableCell>
                      <TableCell>{row.exam_contribution ?? "—"}</TableCell>
                      <TableCell className="font-semibold">{row.final_score ?? "—"}</TableCell>
                      <TableCell>
                        {row.letter_grade ? <Badge tone="primary">{row.letter_grade}</Badge> : <span className="text-[var(--color-text-muted)]">—</span>}
                      </TableCell>
                      {resultsData.is_tertiary && <TableCell>{row.grade_points ?? "—"}</TableCell>}
                      <TableCell>
                        <Badge tone={PASS_STATUS_TONE[row.pass_status]}>{PASS_STATUS_LABEL[row.pass_status]}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {resultsData && resultsData.rows.length > 0 && (
            <div className="mt-4 flex justify-end">
              <Button onClick={handleSave} isLoading={saveResults.isPending}>
                <Save className="size-4" aria-hidden="true" />
                Save exam scores
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
