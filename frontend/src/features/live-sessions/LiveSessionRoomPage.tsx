import { BellRing } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useCurrentUser, useHasPermission } from "@/features/auth/useAuth";
import { LogoBadge } from "@/layouts/AppShell";
import type { ApiError } from "@/lib/api-client";

import { DailyCallFrame } from "./DailyCallFrame";
import { useLiveSession, useRemindLiveSession } from "./useLiveSessionsCrud";

export function LiveSessionRoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: currentUser } = useCurrentUser();
  const canUpdate = useHasPermission("live_sessions.update");
  const { data: session, isLoading, isError, error } = useLiveSession(id);
  const remindSession = useRemindLiveSession();

  const handleRemind = () => {
    if (!id) return;
    remindSession.mutate(id, {
      onSuccess: () => showToast({ title: "Reminder sent" }),
      onError: (err: ApiError) => showToast({ title: "Could not send reminder", description: err.message, tone: "danger" }),
    });
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !session) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Live session not found."}</Alert>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="back-button"
        >
          <BackArrowIcon className="size-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <LogoBadge logoUrl={currentUser?.school?.logo} />
          <span className="text-sm font-medium text-[var(--color-text)]">{currentUser?.school?.name}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">{session.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {session.subject_name} · {session.school_class_name}
            {session.section_name && ` — ${session.section_name}`} · {session.teacher_name}
          </p>
        </div>
        {canUpdate && (session.status === "scheduled" || session.status === "live") && (
          <Button variant="secondary" size="sm" onClick={handleRemind} isLoading={remindSession.isPending}>
            {!remindSession.isPending && <BellRing className="size-4" aria-hidden="true" />}
            Send reminder now
          </Button>
        )}
      </div>

      {session.status === "scheduled" ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-10">
          <Spinner />
          <p className="text-sm text-[var(--color-text-muted)]">Waiting for the teacher to start the session…</p>
        </div>
      ) : session.status === "ended" || session.status === "cancelled" ? (
        <Alert tone="danger">This session has ended.</Alert>
      ) : session.daily_room_url ? (
        <DailyCallFrame roomUrl={session.daily_room_url} />
      ) : (
        <FullPageSpinner />
      )}
    </div>
  );
}
