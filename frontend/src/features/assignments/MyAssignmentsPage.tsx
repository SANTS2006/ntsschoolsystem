import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileLink } from "@/components/ui/FileLink";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { apiClient, type ApiError } from "@/lib/api-client";

import type { Assignment } from "./types";

interface MySubmission {
  status: "submitted" | "late" | "graded";
  submitted_at: string;
  score: string | null;
  feedback: string;
  attachment: string | null;
}
type MyAssignment = Assignment & { my_submission: MySubmission | null };

const KEY = ["assignments", "mine"] as const;

function useMyAssignments() {
  return useQuery<MyAssignment[], ApiError>({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<{ assignments: MyAssignment[] }>("/my-assignments/")).data.assignments,
  });
}

function useSubmitAssignment() {
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiError, { id: string; file: File }>({
    mutationFn: ({ id, file }) => {
      const form = new FormData();
      form.append("attachment", file);
      return apiClient.post(`/assignments/${id}/submit/`, form);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

function AssignmentCard({ assignment }: { assignment: MyAssignment }) {
  const { showToast } = useToast();
  const submit = useSubmitAssignment();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const sub = assignment.my_submission;
  const overdue = new Date(assignment.due_date) < new Date();
  const graded = sub?.status === "graded";

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    submit.mutate(
      { id: assignment.id, file },
      {
        onSuccess: () => showToast({ title: sub ? "Work resubmitted" : "Work submitted", description: assignment.title }),
        onError: (err: ApiError) => setError(err.message),
      },
    );
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--color-text)]">{assignment.title}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {assignment.subject_name} · {assignment.teacher_name} · out of {Number(assignment.max_score)}
            </p>
          </div>
          {graded ? (
            <Badge tone="success">Marked</Badge>
          ) : sub ? (
            <Badge tone={sub.status === "late" ? "warning" : "primary"}>{sub.status === "late" ? "Submitted late" : "Submitted"}</Badge>
          ) : overdue ? (
            <Badge tone="danger">Overdue</Badge>
          ) : (
            <Badge tone="neutral">To do</Badge>
          )}
        </div>
        {assignment.description && <p className="whitespace-pre-line text-sm text-[var(--color-text)]">{assignment.description}</p>}
        <p className="text-xs text-[var(--color-text-muted)]">
          Due {new Date(assignment.due_date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
        {assignment.attachment && <FileLink url={assignment.attachment} label="Assignment file" />}

        {error && <Alert tone="danger">{error}</Alert>}

        {graded && sub ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-3 text-sm">
            <p className="font-semibold text-[var(--color-text)]">
              Score: {sub.score} / {Number(assignment.max_score)}
            </p>
            {sub.feedback && <p className="mt-1 text-[var(--color-text-muted)]">{sub.feedback}</p>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <input ref={input} type="file" className="hidden" onChange={onPick} />
            <Button size="sm" variant={sub ? "secondary" : "primary"} isLoading={submit.isPending} onClick={() => input.current?.click()}>
              <Upload className="size-4" aria-hidden="true" />
              {sub ? "Replace my submission" : "Submit my work"}
            </Button>
          </div>
        )}
        {sub?.attachment && <FileLink url={sub.attachment} label="My submission" />}
      </CardContent>
    </Card>
  );
}

/** A student's assigned work: what is due, hand it in, and see the mark and feedback once the teacher has graded it. */
export function MyAssignmentsPage() {
  const { data, isLoading, isError, error } = useMyAssignments();
  if (isLoading) return <Spinner />;
  if (isError || !data) return <Alert tone="danger">{(error as ApiError | null)?.message ?? "Could not load your assignments."}</Alert>;

  // Not handed in first (soonest due at the top), then the rest by most recent.
  const sorted = [...data].sort((a, b) => {
    const pa = a.my_submission ? 1 : 0;
    const pb = b.my_submission ? 1 : 0;
    return pa - pb || new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Assignments</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Work set by your teachers. Hand it in here and see your mark.</p>
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assignments yet" description="Work your teachers set for your class appears here." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sorted.map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </div>
      )}
    </div>
  );
}
