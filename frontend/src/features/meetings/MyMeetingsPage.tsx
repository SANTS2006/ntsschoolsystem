import { Video } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { formatMeetingTime, meetingStatusTone } from "./statusTone";
import { useMyMeetings } from "./useMeetingsCrud";

export function MyMeetingsPage() {
  const navigate = useNavigate();
  const { data: meetings, isLoading, isError, error } = useMyMeetings();

  if (isLoading) return <FullPageSpinner />;
  if (isError) return <Alert tone="danger">{(error as ApiError).message}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My meetings</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Live meetings you've been invited to.</p>
      </div>

      {!meetings || meetings.length === 0 ? (
        <EmptyState icon={Video} title="No upcoming meetings" description="You haven't been invited to any meetings." />
      ) : (
        <div className="flex flex-col gap-3">
          {meetings.map((meeting) => (
            <Card key={meeting.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--color-text)]">{meeting.title}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {formatMeetingTime(meeting.scheduled_start)} · {meeting.duration_minutes} min · called by {meeting.host_name}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={meetingStatusTone(meeting.status)} className="capitalize">
                    {meeting.status}
                  </Badge>
                  <Button size="sm" onClick={() => navigate(`/meetings/${meeting.id}/room`)}>
                    Join
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
