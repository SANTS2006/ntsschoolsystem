import { FileQuestion } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { quizStatusTone } from "./statusTone";
import { useMyQuizzes } from "./useQuizzesCrud";

export function MyQuizzesPage() {
  const navigate = useNavigate();
  const { data: quizzes, isLoading, isError, error } = useMyQuizzes();

  if (isLoading) return <FullPageSpinner />;
  if (isError) return <Alert tone="danger">{(error as ApiError).message}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My Quizzes</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Quizzes set by your subject teachers. Each can be taken once, in full screen.
        </p>
      </div>

      {!quizzes || quizzes.length === 0 ? (
        <EmptyState icon={FileQuestion} title="No quizzes" description="Nothing has been scheduled for you yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {quizzes.map((quiz) => {
            const done = quiz.my_attempt_status === "submitted" || quiz.my_attempt_status === "auto_submitted";
            const canOpen = quiz.status === "active" || done || quiz.my_attempt_status === "in_progress";
            return (
              <Card key={quiz.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">{quiz.title}</p>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {quiz.subject_offering_name} · {new Date(quiz.start_time).toLocaleString()} –{" "}
                      {new Date(quiz.end_time).toLocaleString()} · {quiz.duration_minutes} min
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {done && quiz.my_score !== null && (
                      <span className="text-sm font-semibold text-[var(--color-text)]">
                        {Number(quiz.my_score)} / {Number(quiz.my_max_score)}
                      </span>
                    )}
                    <Badge tone={quizStatusTone(quiz.status)}>{quiz.status}</Badge>
                    {canOpen && (
                      <Button size="sm" onClick={() => navigate(`/my-quizzes/${quiz.id}/take`)}>
                        {done ? "View result" : quiz.my_attempt_status === "in_progress" ? "Resume" : "Open"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
