import { AlertTriangle, CheckCircle2, Clock, Maximize } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { fetchMyResult, markQuestionViewed, reportViolation, saveAnswer, startAttempt, submitAttempt } from "./api";
import type { AttemptResult, AttemptState, ViolationKind } from "./types";
import { useMyQuizzes } from "./useQuizzesCrud";

// Must match apps.quizzes.services.VIOLATION_AUTO_SUBMIT_THRESHOLD.
const MAX_VIOLATIONS = 3;

function enterFullscreen(): Promise<void> {
  const el = document.documentElement;
  if (!el.requestFullscreen) return Promise.resolve();
  // Some embedded webviews never settle this promise; don't let that block starting the quiz.
  const settled = el.requestFullscreen().catch(() => undefined);
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 1500));
  return Promise.race([settled, timeout]);
}

function exitFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => undefined);
  }
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function ResultPanel({ result, onExit }: { result: AttemptResult; onExit: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="size-12 text-[var(--color-success)]" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          {result.status === "auto_submitted" ? "Quiz ended" : "Quiz submitted"}
        </h2>
        <p className="text-3xl font-bold text-[var(--color-text)]">
          {result.score === null ? "—" : `${Number(result.score)} / ${Number(result.max_score)}`}
        </p>
        {result.percentage !== null && (
          <p className="text-sm text-[var(--color-text-muted)]">{result.percentage}%</p>
        )}
        {result.status === "auto_submitted" && (
          <p className="max-w-md text-sm text-[var(--color-text-muted)]">
            Your quiz was submitted automatically (time ran out, it was cancelled, or too many focus warnings). Answers
            saved up to that point were marked.
          </p>
        )}
        <Button onClick={onExit}>Back to my quizzes</Button>
      </CardContent>
    </Card>
  );
}

function QuizRunner({
  quizId,
  attempt,
  onFinished,
}: {
  quizId: string;
  attempt: AttemptState;
  onFinished: (result: AttemptResult) => void;
}) {
  const deadlineMs = new Date(attempt.deadline).getTime();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(attempt.questions.map((q) => [q.id, q.my_option_id])),
  );
  const [violations, setViolations] = useState(0);
  const [needsFullscreen, setNeedsFullscreen] = useState(() => !document.fullscreenElement);
  const [remaining, setRemaining] = useState(() => Math.round((deadlineMs - Date.now()) / 1000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishedRef = useRef(false);
  const lastViolationAt = useRef(0);

  const question = attempt.questions[index];

  const finish = useCallback(
    async (mode: "submit" | "fetch") => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setBusy(true);
      try {
        const result = mode === "submit" ? await submitAttempt(quizId) : await fetchMyResult(quizId);
        onFinished(result);
      } catch {
        // The server may already have closed the attempt (timeout/violations) — its stored result is authoritative.
        try {
          onFinished(await fetchMyResult(quizId));
        } catch (err) {
          finishedRef.current = false;
          setBusy(false);
          setError((err as ApiError).message ?? "Could not submit. Check your connection and try again.");
        }
      }
    },
    [quizId, onFinished],
  );

  const onViolation = useCallback(
    (kind: ViolationKind) => {
      if (finishedRef.current) return;
      if (kind === "fullscreen_exit") setNeedsFullscreen(true);
      // One tab switch fires blur, visibilitychange and often fullscreenchange together — count it once.
      const now = Date.now();
      if (now - lastViolationAt.current < 2000) return;
      lastViolationAt.current = now;
      reportViolation(quizId, kind)
        .then((res) => {
          setViolations(res.violation_count);
          if (res.status !== "in_progress") void finish("fetch");
        })
        .catch(() => undefined);
    },
    [quizId, finish],
  );

  useEffect(() => {
    const onFullscreenChange = () => {
      if (document.fullscreenElement) {
        setNeedsFullscreen(false);
      } else {
        onViolation("fullscreen_exit");
      }
    };
    const onVisibility = () => {
      if (document.hidden) onViolation("tab_hidden");
    };
    const onBlur = () => onViolation("blur");
    const block = (e: Event) => e.preventDefault();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!finishedRef.current) e.preventDefault();
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
    };
  }, [onViolation]);

  useEffect(() => {
    const timer = setInterval(() => {
      const left = Math.round((deadlineMs - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) void finish("submit");
    }, 1000);
    return () => clearInterval(timer);
  }, [deadlineMs, finish]);

  useEffect(() => {
    if (question) void markQuestionViewed(quizId, question.id).catch(() => undefined);
  }, [quizId, question]);

  const choose = (optionId: string) => {
    setAnswers((prev) => ({ ...prev, [question.id]: optionId }));
    saveAnswer(quizId, question.id, optionId).catch(() => setError("Could not save that answer — check your connection."));
  };

  const unanswered = Object.values(answers).filter((v) => !v).length;

  if (!question) {
    return <Alert tone="danger">This quiz has no questions.</Alert>;
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 p-4 select-none">
      {needsFullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[var(--color-bg)]/95 p-6 text-center">
          <AlertTriangle className="size-10 text-[var(--color-warning)]" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Return to full screen to continue</h2>
          <p className="max-w-md text-sm text-[var(--color-text-muted)]">
            The quiz must stay in full screen. Leaving it counts as a warning; after {MAX_VIOLATIONS} warnings your
            quiz is submitted automatically.
          </p>
          <Button onClick={() => void enterFullscreen()}>
            <Maximize className="size-4" aria-hidden="true" />
            Continue in full screen
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <span className="text-sm text-[var(--color-text-muted)]">
          Question {index + 1} of {attempt.questions.length}
        </span>
        <div className="flex items-center gap-3">
          {violations > 0 && (
            <Badge tone="warning">
              Warning {violations}/{MAX_VIOLATIONS}
            </Badge>
          )}
          <span
            className={`flex items-center gap-1 font-mono text-sm font-semibold ${
              remaining <= 60 ? "text-[var(--color-danger)]" : "text-[var(--color-text)]"
            }`}
          >
            <Clock className="size-4" aria-hidden="true" />
            {formatClock(remaining)}
          </span>
        </div>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-base font-medium text-[var(--color-text)]">{question.text}</p>
          <div className="flex flex-col gap-2">
            {question.options.map((option) => {
              const selected = answers[question.id] === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => choose(option.id)}
                  className={`rounded-[var(--radius-md)] border px-4 py-3 text-left text-sm transition-colors ${
                    selected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text)]"
                      : "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]"
                  }`}
                >
                  {option.text}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          Previous
        </Button>
        <div className="flex flex-wrap justify-center gap-1">
          {attempt.questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              aria-label={`Go to question ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`size-7 rounded text-xs font-medium ${
                i === index
                  ? "bg-[var(--color-primary)] text-white"
                  : answers[q.id]
                    ? "bg-[var(--color-success)]/20 text-[var(--color-text)]"
                    : "bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {index < attempt.questions.length - 1 ? (
          <Button onClick={() => setIndex((i) => i + 1)}>Next</Button>
        ) : (
          <Button
            isLoading={busy}
            onClick={() => {
              if (unanswered > 0 && !window.confirm(`${unanswered} question(s) are unanswered. Submit anyway?`)) return;
              void finish("submit");
            }}
          >
            Submit quiz
          </Button>
        )}
      </div>
    </div>
  );
}

export function TakeQuizPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const { data: quizzes, isLoading } = useMyQuizzes();
  const quiz = quizzes?.find((q) => q.id === quizId);

  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leave = useCallback(() => {
    exitFullscreen();
    navigate("/my-quizzes", { replace: true });
  }, [navigate]);

  const handleFinished = useCallback((res: AttemptResult) => {
    exitFullscreen();
    setAttempt(null);
    setResult(res);
  }, []);

  const start = async () => {
    setError(null);
    setStarting(true);
    // Must run inside the click handler: browsers only allow fullscreen from a user gesture.
    await enterFullscreen();
    try {
      setAttempt(await startAttempt(quizId as string));
    } catch (err) {
      exitFullscreen();
      setError((err as ApiError).message);
    } finally {
      setStarting(false);
    }
  };

  if (isLoading) return <FullPageSpinner />;

  if (result) {
    return (
      <div className="mx-auto max-w-xl p-4">
        <ResultPanel result={result} onExit={leave} />
      </div>
    );
  }

  if (attempt) {
    return <QuizRunner quizId={quizId as string} attempt={attempt} onFinished={handleFinished} />;
  }

  if (!quiz) {
    return (
      <div className="mx-auto max-w-xl p-4">
        <Alert tone="danger">Quiz not found.</Alert>
      </div>
    );
  }

  const finished = quiz.my_attempt_status === "submitted" || quiz.my_attempt_status === "auto_submitted";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">{quiz.title}</h1>
            <p className="text-sm text-[var(--color-text-muted)]">{quiz.subject_offering_name}</p>
          </div>
          {quiz.instructions && <p className="text-sm text-[var(--color-text)]">{quiz.instructions}</p>}
          <ul className="list-disc pl-5 text-sm text-[var(--color-text-muted)]">
            <li>
              {quiz.question_count} questions · {quiz.duration_minutes} minutes once you start
            </li>
            <li>The quiz opens in full screen. Leaving full screen, switching tabs or switching windows counts as a warning.</li>
            <li>After {MAX_VIOLATIONS} warnings, or when time runs out, your quiz is submitted automatically.</li>
            <li>You only get one attempt.</li>
          </ul>
          {error && <Alert tone="danger">{error}</Alert>}
          {finished ? (
            <Button onClick={() => void fetchMyResult(quiz.id).then(setResult)}>View my result</Button>
          ) : quiz.status === "scheduled" ? (
            <Alert tone="info">Opens {new Date(quiz.start_time).toLocaleString()}.</Alert>
          ) : quiz.status === "cancelled" ? (
            <Alert tone="danger">This quiz was cancelled.</Alert>
          ) : quiz.status === "ended" && quiz.my_attempt_status !== "in_progress" ? (
            <Alert tone="danger">This quiz has closed.</Alert>
          ) : (
            <Button isLoading={starting} onClick={() => void start()}>
              {quiz.my_attempt_status === "in_progress" ? "Resume quiz" : "Start quiz"}
            </Button>
          )}
          <Button variant="secondary" onClick={leave}>
            Back
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
