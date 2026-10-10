import { Save, Send } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
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

import { SubmissionsPanel } from "./SubmissionsPanel";
import { useAssessment, useAssessmentScores, useSaveAssessmentScores } from "./useAcademicsCrud";

function weightedScore(
  rawScore: string,
  discretionaryMark: string,
  maxScore: number,
  weight: number,
  discretionaryWeight: number,
): string {
  const raw = Number(rawScore);
  const mark = Number(discretionaryMark);
  const hasRaw = rawScore !== "" && !Number.isNaN(raw) && maxScore > 0;
  const hasMark = discretionaryMark !== "" && !Number.isNaN(mark);
  if (!hasRaw && !hasMark) return "—";
  const testPart = hasRaw ? (raw / maxScore) * (weight - discretionaryWeight) : 0;
  return (testPart + (hasMark ? mark : 0)).toFixed(2);
}

export function AssessmentGradeEntryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: assessment, isLoading: isLoadingAssessment } = useAssessment(id);
  const { data: scoresData, isLoading: isLoadingScores } = useAssessmentScores(id);
  const saveScores = useSaveAssessmentScores(id ?? "");

  const [values, setValues] = useStateFromSource(scoresData, (loaded) => {
    const next: Record<string, string> = {};
    for (const row of loaded?.rows ?? []) next[row.student] = row.raw_score ?? "";
    return next;
  });
  const [marks, setMarks] = useStateFromSource(scoresData, (loaded) => {
    const next: Record<string, string> = {};
    for (const row of loaded?.rows ?? []) next[row.student] = row.discretionary_mark ?? "";
    return next;
  });

  const maxScore = Number(scoresData?.max_score ?? assessment?.max_score ?? 0);
  const weight = scoresData?.weight ?? assessment?.weight ?? 0;
  const discretionaryWeight = scoresData?.discretionary_weight ?? assessment?.discretionary_weight ?? 0;

  const buildEntries = () =>
    Object.entries(values).map(([student, raw_score]) => ({
      student,
      raw_score: raw_score === "" ? null : raw_score,
      ...(discretionaryWeight > 0 ? { discretionary_mark: (marks[student] ?? "") === "" ? null : marks[student] } : {}),
    }));

  const handleSaveDraft = () => {
    saveScores.mutate(
      { entries: buildEntries(), submit: false },
      {
        onSuccess: () => showToast({ title: "Draft saved" }),
        onError: (err: ApiError) => showToast({ title: "Could not save", description: err.message, tone: "danger" }),
      },
    );
  };

  const handleSubmit = async () => {
    const ok = await confirm({
      title: "Submit these scores?",
      description: "Students will be notified (in-app and email) once submitted.",
    });
    if (!ok) return;
    saveScores.mutate(
      { entries: buildEntries(), submit: true },
      {
        onSuccess: () => showToast({ title: "Scores submitted" }),
        onError: (err: ApiError) => showToast({ title: "Could not submit", description: err.message, tone: "danger" }),
      },
    );
  };

  if (isLoadingAssessment || isLoadingScores) {
    return <FullPageSpinner />;
  }

  if (!assessment) {
    return <Alert tone="danger">Assessment not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(`/academics/subject-offerings/${assessment.subject_offering}/ca`)}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to continuous assessment
      </button>

      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{assessment.name}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {assessment.subject_offering_name} — {assessment.school_class_name} · {assessment.term_name} · Weight{" "}
          {weight}% of CA · Out of {maxScore}
          {discretionaryWeight > 0 &&
            ` · ${discretionaryWeight} of the ${weight} marks are reserved for your discretion`}
        </p>
      </div>

      {assessment.allow_file_uploads && <SubmissionsPanel assessmentId={assessment.id} />}

      <Card>
        <CardHeader>
          <CardTitle>Grade entry</CardTitle>
        </CardHeader>
        <CardContent>
          {!scoresData || scoresData.rows.length === 0 ? (
            <EmptyState
              title="No enrolled students"
              description="Enroll students into this subject before entering scores."
            />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Student</TableHeaderCell>
                    <TableHeaderCell>Score</TableHeaderCell>
                    <TableHeaderCell>Maximum</TableHeaderCell>
                    {discretionaryWeight > 0 && (
                      <TableHeaderCell>Discretionary (0–{discretionaryWeight})</TableHeaderCell>
                    )}
                    <TableHeaderCell>Weight</TableHeaderCell>
                    <TableHeaderCell>Weighted score</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {scoresData.rows.map((row) => (
                    <TableRow key={row.student}>
                      <TableCell className="font-medium">
                        {row.student_name}
                        <span className="ml-1 text-[var(--color-text-muted)]">({row.student_admission_number})</span>
                      </TableCell>
                      <TableCell>
                        <input
                          type="number"
                          aria-label={`Score for ${row.student_name}`}
                          min={0}
                          max={maxScore}
                          step="0.01"
                          value={values[row.student] ?? ""}
                          onChange={(e) =>
                            setValues((prev) => ({ ...prev, [row.student]: e.target.value }))
                          }
                          className="w-24 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)]"
                        />
                      </TableCell>
                      <TableCell>{maxScore}</TableCell>
                      {discretionaryWeight > 0 && (
                        <TableCell>
                          <input
                            type="number"
                            aria-label={`Discretionary mark for ${row.student_name}`}
                            min={0}
                            max={discretionaryWeight}
                            step="0.01"
                            value={marks[row.student] ?? ""}
                            onChange={(e) => setMarks((prev) => ({ ...prev, [row.student]: e.target.value }))}
                            className="w-24 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)]"
                          />
                        </TableCell>
                      )}
                      <TableCell>{weight}%</TableCell>
                      <TableCell className="font-medium">
                        {weightedScore(
                          values[row.student] ?? "",
                          marks[row.student] ?? "",
                          maxScore,
                          weight,
                          discretionaryWeight,
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge tone={row.status === "submitted" ? "success" : "neutral"}>
                          {row.status === "submitted" ? "Submitted" : "Draft"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {scoresData && scoresData.rows.length > 0 && (
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="secondary" onClick={handleSaveDraft} isLoading={saveScores.isPending}>
                <Save className="size-4" aria-hidden="true" />
                Save draft
              </Button>
              <Button onClick={handleSubmit} isLoading={saveScores.isPending}>
                <Send className="size-4" aria-hidden="true" />
                Submit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
