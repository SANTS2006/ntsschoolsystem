import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useCurrentUser } from "@/features/auth/useAuth";
import { DailyCallFrame } from "@/features/live-sessions/DailyCallFrame";
import { LogoBadge } from "@/layouts/AppShell";
import type { ApiError } from "@/lib/api-client";

import { formatMeetingTime } from "./statusTone";
import { useMeetingJoin } from "./useMeetingsCrud";

export function MeetingRoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const { data, isLoading, isError, error } = useMeetingJoin(id);

  if (isLoading) return <FullPageSpinner />;
  if (isError || !data) return <Alert tone="danger">{(error as ApiError)?.message ?? "Meeting not found."}</Alert>;

  const { meeting, room_url: roomUrl } = data;

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

      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{meeting.title}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {formatMeetingTime(meeting.scheduled_start)} · called by {meeting.host_name}
        </p>
      </div>

      {roomUrl ? (
        <DailyCallFrame roomUrl={roomUrl} />
      ) : (
        <Alert tone="danger">This meeting is {meeting.status === "cancelled" ? "cancelled" : "over"}.</Alert>
      )}
    </div>
  );
}
