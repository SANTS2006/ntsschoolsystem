import type { BadgeTone } from "@/components/ui/Badge";

import type { AttemptStatus, QuizStatus } from "./types";

export function quizStatusTone(status: QuizStatus): BadgeTone {
  switch (status) {
    case "active":
      return "success";
    case "ended":
      return "neutral";
    case "cancelled":
      return "danger";
    default:
      return "primary";
  }
}

export function attemptStatusTone(status: AttemptStatus | "not_started"): BadgeTone {
  switch (status) {
    case "submitted":
      return "success";
    case "auto_submitted":
      return "warning";
    case "in_progress":
      return "primary";
    default:
      return "neutral";
  }
}

export const attemptStatusLabel: Record<AttemptStatus | "not_started", string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  auto_submitted: "Auto-submitted",
};

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
