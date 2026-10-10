import { Send } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/toastContext";

import { useInviteApplicationsToInterview } from "./useAdmissionsCrud";

export function InterviewInviteModal({
  open,
  onClose,
  applicationIds,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  applicationIds: string[];
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const inviteToInterview = useInviteApplicationsToInterview();

  const [interviewDatetime, setInterviewDatetime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    if (!interviewDatetime) return;
    inviteToInterview.mutate(
      {
        application_ids: applicationIds,
        interview_datetime: interviewDatetime,
        interview_location: location,
        interview_notes: notes,
      },
      {
        onSuccess: ({ updated }) => {
          showToast({ title: `Invited ${updated} applicant(s) to interview` });
          setInterviewDatetime("");
          setLocation("");
          setNotes("");
          onDone();
        },
        onError: (err) =>
          showToast({ title: "Could not send interview invites", description: err.message, tone: "danger" }),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={`Invite ${applicationIds.length} applicant(s) to interview`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-text-muted)]">
          Every selected applicant is emailed these same interview details, customized with their name and
          your school's information.
        </p>
        <Input
          type="datetime-local"
          label="Date & time"
          value={interviewDatetime}
          onChange={(e) => setInterviewDatetime(e.target.value)}
        />
        <Input
          label="Location (or meeting link)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <Textarea
          label="Notes (optional)"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="mt-1 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!interviewDatetime}
            isLoading={inviteToInterview.isPending}
          >
            {!inviteToInterview.isPending && <Send className="size-4" aria-hidden="true" />}
            Send invites
          </Button>
        </div>
      </div>
    </Modal>
  );
}
