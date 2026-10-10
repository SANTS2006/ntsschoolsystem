import { useNavigate, useParams } from "react-router-dom";

import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { StatRow } from "@/components/ui/StatRow";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import type { ApiError } from "@/lib/api-client";

import { attemptStatusLabel, attemptStatusTone, formatDuration } from "./statusTone";
import { useQuiz, useQuizResults } from "./useQuizzesCrud";

export function QuizResultsPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const { data: quiz } = useQuiz(quizId);
  const { data, isLoading, isError, error } = useQuizResults(quizId);

  if (isLoading) return <FullPageSpinner />;
  if (isError || !data) return <Alert tone="danger">{(error as ApiError | null)?.message ?? "Could not load results."}</Alert>;

  const { rows, summary, questions } = data;
  const hardest = [...questions]
    .filter((q) => q.percent_correct !== null)
    .sort((a, b) => (a.percent_correct as number) - (b.percent_correct as number))[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="back-button">
          <BackArrowIcon className="size-4" />
          Back
        </button>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">{quiz?.title ?? "Quiz"} — results</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Only you can see this page. {summary.completed} of {summary.registered} students have finished.
          </p>
        </div>
      </div>

      <StatRow
        items={[
          { key: "completed", label: "Completed", value: `${summary.completed} / ${summary.registered}` },
          {
            key: "avg",
            label: "Average score",
            value: summary.average_score === null ? "—" : summary.average_score,
          },
          {
            key: "avg-time",
            label: "Average time to finish",
            value: formatDuration(summary.average_completion_seconds),
          },
          { key: "fast", label: "Fastest finish", value: formatDuration(summary.fastest_completion_seconds) },
          { key: "slow", label: "Slowest finish", value: formatDuration(summary.slowest_completion_seconds) },
          {
            key: "hard",
            label: "Hardest question",
            value: hardest ? `${hardest.percent_correct}% correct` : "—",
            footnote: hardest?.text.slice(0, 60),
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Student</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Score</TableHeaderCell>
                  <TableHeaderCell>%</TableHeaderCell>
                  <TableHeaderCell>Time taken</TableHeaderCell>
                  <TableHeaderCell>Violations</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.student_id}>
                    <TableCell>{row.student_name}</TableCell>
                    <TableCell>
                      <Badge tone={attemptStatusTone(row.status)}>{attemptStatusLabel[row.status]}</Badge>
                    </TableCell>
                    <TableCell>{row.score === null ? "—" : `${Number(row.score)} / ${Number(row.max_score)}`}</TableCell>
                    <TableCell>{row.percentage === null ? "—" : `${row.percentage}%`}</TableCell>
                    <TableCell>{formatDuration(row.time_taken_seconds)}</TableCell>
                    <TableCell>{row.violation_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Question breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>#</TableHeaderCell>
                  <TableHeaderCell>Question</TableHeaderCell>
                  <TableHeaderCell>Answered correctly</TableHeaderCell>
                  <TableHeaderCell>Avg. time spent</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {questions.map((q, index) => (
                  <TableRow key={q.question_id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="max-w-md">{q.text}</TableCell>
                    <TableCell>
                      {q.percent_correct === null ? "—" : `${q.correct_count} / ${q.graded_count} (${q.percent_correct}%)`}
                    </TableCell>
                    <TableCell>{formatDuration(q.average_time_seconds)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </div>
  );
}
