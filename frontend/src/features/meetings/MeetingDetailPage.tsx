import { Mail, Play, Square, Video, XCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import { EMAIL_STATUS_LABEL, emailStatusTone, formatMeetingTime, meetingStatusTone } from "./statusTone";
import { useMeeting, useMeetingAction } from "./useMeetingsCrud";

export function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canUpdateAny = useHasPermission("meetings.update");
  const { data: meeting, isLoading, isError, error } = useMeeting(id);
  // Only the person who scheduled a meeting can start, end, cancel or resend it.
  const canUpdate = canUpdateAny && !!meeting?.is_mine;
  const act = useMeetingAction();

  if (isLoading) return <FullPageSpinner />;
  if (isError || !meeting) return <Alert tone="danger">{(error as ApiError)?.message ?? "Meeting not found."}</Alert>;

  const run = (action: "start" | "end" | "cancel" | "resend", doneTitle: string) =>
    act.mutate(
      { id: meeting.id, action },
      {
        onSuccess: () => showToast({ title: doneTitle }),
        onError: (err) => showToast({ title: "Action failed", description: err.message, tone: "danger" }),
      },
    );

  const handleCancel = async () => {
    const ok = await confirm({
      title: "Cancel this meeting?",
      description: "Everyone who was emailed an invitation will be told it's cancelled.",
      tone: "danger",
    });
    if (ok) run("cancel", "Meeting cancelled");
  };

  const over = meeting.status === "ended" || meeting.status === "cancelled";
  const counts = meeting.invitee_counts;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          type="button"
          onClick={() => navigate("/meetings")}
          className="back-button"
        >
          <BackArrowIcon className="size-4" />
          Back to meetings
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">{meeting.title}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {formatMeetingTime(meeting.scheduled_start)} · {meeting.duration_minutes} min · called by {meeting.host_name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={meetingStatusTone(meeting.status)} className="capitalize">
              {meeting.status}
            </Badge>
            {!over && (
              <Button size="sm" variant="secondary" onClick={() => navigate(`/meetings/${meeting.id}/room`)}>
                <Video className="size-4" aria-hidden="true" /> Join
              </Button>
            )}
            {canUpdate && meeting.status === "scheduled" && (
              <Button size="sm" onClick={() => run("start", "Meeting started")} isLoading={act.isPending}>
                <Play className="size-4" aria-hidden="true" /> Start
              </Button>
            )}
            {canUpdate && meeting.status === "live" && (
              <Button size="sm" variant="secondary" onClick={() => run("end", "Meeting ended")} isLoading={act.isPending}>
                <Square className="size-4" aria-hidden="true" /> End
              </Button>
            )}
            {canUpdate && !over && (
              <Button size="sm" variant="danger" onClick={handleCancel}>
                <XCircle className="size-4" aria-hidden="true" /> Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {meeting.agenda && (
        <Card>
          <CardHeader>
            <CardTitle>Agenda</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{meeting.agenda}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>
            Invitees — {meeting.audience} ({counts.total})
          </CardTitle>
          {canUpdate && !over && (counts.failed > 0 || counts.pending > 0) && (
            <Button size="sm" variant="secondary" onClick={() => run("resend", "Sending the outstanding invitations")} isLoading={act.isPending}>
              <Mail className="size-4" aria-hidden="true" /> Resend failed ({counts.failed + counts.pending})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">
            {counts.sent} emailed
            {counts.pending > 0 && ` · ${counts.pending} sending`}
            {counts.failed > 0 && ` · ${counts.failed} failed`}
            {counts.no_email > 0 && ` · ${counts.no_email} without an email address`}
          </p>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Group</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
                  <TableHeaderCell>Invitation</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {meeting.invitees.map((invitee) => (
                  <TableRow key={invitee.id}>
                    <TableCell className="font-medium">{invitee.name}</TableCell>
                    <TableCell className="capitalize">{invitee.kind}</TableCell>
                    <TableCell>{invitee.email || "—"}</TableCell>
                    <TableCell>
                      <Badge tone={emailStatusTone(invitee.email_status)}>{EMAIL_STATUS_LABEL[invitee.email_status]}</Badge>
                    </TableCell>
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
