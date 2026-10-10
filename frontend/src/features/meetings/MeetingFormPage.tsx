import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/toastContext";

import { AudiencePicker } from "./AudiencePicker";
import { EMPTY_AUDIENCE, type AudienceState, hasAudience, toAudiencePayload } from "./audience";
import { useAudiencePreview, useCreateMeeting } from "./useMeetingsCrud";

/** `datetime-local` value (local wall-clock time) for "now + an hour, on the hour". */
function defaultStart(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MeetingFormPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createMeeting = useCreateMeeting();

  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [start, setStart] = useState(defaultStart);
  const [duration, setDuration] = useState("60");
  const [audience, setAudience] = useState<AudienceState>(EMPTY_AUDIENCE);
  const [error, setError] = useState<string | null>(null);

  const audiencePayload = toAudiencePayload(audience);
  const audienceChosen = hasAudience(audience);
  const { data: preview } = useAudiencePreview(audiencePayload, audienceChosen);

  const canSubmit = title.trim() !== "" && start !== "" && Number(duration) >= 5 && audienceChosen;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    createMeeting.mutate(
      {
        title: title.trim(),
        agenda: agenda.trim(),
        // The input is the principal's local time; toISOString() sends it as an unambiguous UTC instant.
        scheduled_start: new Date(start).toISOString(),
        duration_minutes: Number(duration),
        ...audiencePayload,
      },
      {
        onSuccess: (meeting) => {
          showToast({ title: "Meeting created", description: "Invitation emails are on their way." });
          navigate(`/meetings/${meeting.id}`);
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div>
        <button
          type="button"
          onClick={() => navigate("/meetings")}
          className="back-button"
        >
          <BackArrowIcon className="size-4" />
          Back to meetings
        </button>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">New live meeting</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Everyone you choose is emailed the meeting details and a join link as soon as you create it.
        </p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Meeting details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
          </div>
          <div className="md:col-span-2">
            <Textarea
              label="Agenda (optional)"
              rows={3}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="What will be covered — shown in the invitation email."
            />
          </div>
          <Input label="Starts" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
          <Input
            label="Duration (minutes)"
            type="number"
            min={5}
            max={480}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who should attend?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AudiencePicker value={audience} onChange={setAudience} />
          {audienceChosen && preview && (
            <p className="text-sm text-[var(--color-text-muted)]" role="status">
              <strong className="text-[var(--color-text)]">{preview.total}</strong> people will be invited (
              {preview.by_kind.staff} staff, {preview.by_kind.parent} parents, {preview.by_kind.student} students).
              {preview.without_email > 0 &&
                ` ${preview.without_email} have no email address on file and will only see it in the app, if they have an account.`}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => navigate("/meetings")}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit} isLoading={createMeeting.isPending}>
          Create meeting &amp; send invitations
        </Button>
      </div>
    </form>
  );
}
