import { CalendarClock, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { statusTone } from "./statusTone";
import { useMyLiveSessions } from "./useLiveSessionsCrud";

export function MyLiveSessionsPage() {
  const navigate = useNavigate();
  const { data: sessions, isLoading, isError, error } = useMyLiveSessions();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My Live Sessions</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Online lessons scheduled for your class — join when your teacher starts one.
        </p>
      </div>

      {!sessions || sessions.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No live sessions" description="Nothing scheduled for your class yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => (
            <Card key={session.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--color-text)]">{session.title}</p>
                  <p className="truncate text-sm text-[var(--color-text-muted)]">
                    {session.subject_name} · {new Date(session.scheduled_start).toLocaleString()} ·{" "}
                    {session.teacher_name}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={statusTone(session.status)}>{session.status}</Badge>
                  {session.status === "live" && (
                    <Button size="sm" onClick={() => navigate(`/live-sessions/${session.id}/room`)}>
                      <Video className="size-4" aria-hidden="true" />
                      Join
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
