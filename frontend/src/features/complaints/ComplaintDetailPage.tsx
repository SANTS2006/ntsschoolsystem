import { CheckCircle2, Send, UserPlus, XCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useStaffList } from "@/features/staff/useStaffCrud";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { priorityLabel, priorityTone, statusLabel, statusTone } from "./statusTone";
import {
  useAssignComplaint,
  useComplaint,
  useComplaintResponses,
  useCreateComplaintResponse,
  useRejectComplaint,
  useResolveComplaint,
} from "./useComplaintsCrud";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-0.5 text-sm text-[var(--color-text)]">
        {value || <span className="text-[var(--color-text-muted)]">—</span>}
      </p>
    </div>
  );
}

export function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: complaint, isLoading, isError, error } = useComplaint(id);
  const { data: responses, isLoading: isLoadingResponses } = useComplaintResponses(id);
  const { data: staffList } = useStaffList({ page_size: 100, employment_status: "active" });
  const assignComplaint = useAssignComplaint();
  const resolveComplaint = useResolveComplaint();
  const rejectComplaint = useRejectComplaint();
  const createResponse = useCreateComplaintResponse();

  const [assignee, setAssignee] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [replyMessage, setReplyMessage] = useState("");

  const handleAssign = () => {
    if (!id || !assignee) return;
    assignComplaint.mutate(
      { id, assignedTo: assignee },
      {
        onSuccess: () => showToast({ title: "Complaint assigned" }),
        onError: (err: ApiError) =>
          showToast({ title: "Could not assign", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  const handleResolve = () => {
    if (!id) return;
    resolveComplaint.mutate(
      { id, resolutionNotes },
      {
        onSuccess: () => showToast({ title: "Complaint resolved" }),
        onError: (err: ApiError) =>
          showToast({ title: "Could not resolve", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  const handleReject = async () => {
    if (!id) return;
    const ok = await confirm({
      title: "Reject this complaint?",
      tone: "danger",
    });
    if (!ok) return;
    rejectComplaint.mutate(
      { id, resolutionNotes },
      {
        onSuccess: () => showToast({ title: "Complaint rejected" }),
        onError: (err: ApiError) =>
          showToast({ title: "Could not reject", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  const handleReply = () => {
    if (!id || !replyMessage.trim()) return;
    createResponse.mutate(
      { complaint: id, message: replyMessage.trim() },
      {
        onSuccess: () => setReplyMessage(""),
        onError: (err: ApiError) =>
          showToast({ title: "Could not send reply", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !complaint) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Complaint not found."}</Alert>;
  }

  const isClosed = complaint.status === "resolved" || complaint.status === "rejected";

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate("/complaints")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to complaints
      </button>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-[var(--color-text)]">{complaint.subject}</CardTitle>
            <p className="text-sm text-[var(--color-text-muted)]">{complaint.category_label}</p>
          </div>
          <div className="flex gap-2">
            <Badge tone={priorityTone(complaint.priority)}>{priorityLabel(complaint.priority)}</Badge>
            <Badge tone={statusTone(complaint.status)}>{statusLabel(complaint.status)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Description" value={complaint.description} />
          </div>
          {complaint.image && (
            <img
              src={complaint.image}
              alt="Attached to the complaint"
              className="max-h-72 rounded-[var(--radius-md)] border border-[var(--color-border)] object-contain sm:col-span-2"
            />
          )}
          <Field
            label="Submitted by"
            value={complaint.submitted_by_name ?? (complaint.is_anonymous ? "Anonymous" : null)}
          />
          <Field label="Addressed to" value={complaint.addressed_to_name} />
          <Field label="Assigned to" value={complaint.assigned_to_name} />
          {complaint.resolution_notes && (
            <div className="sm:col-span-2">
              <Field label="Resolution notes" value={complaint.resolution_notes} />
            </div>
          )}
        </CardContent>
      </Card>

      {complaint.can_act && !isClosed && (
        <Card>
          <CardHeader>
            <CardTitle>Staff actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full max-w-xs">
                <Select label="Assign to" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Select staff…</option>
                  {staffList?.results.map((member) => (
                    <option key={member.id} value={member.user}>
                      {member.full_name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button variant="secondary" onClick={handleAssign} isLoading={assignComplaint.isPending} disabled={!assignee}>
                <UserPlus className="size-4" aria-hidden="true" />
                Assign
              </Button>
            </div>
            <Input
              label="Resolution notes"
              hint="Included when you resolve or reject below."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <Button variant="danger" onClick={handleReject} isLoading={rejectComplaint.isPending}>
                <XCircle className="size-4" aria-hidden="true" />
                Reject
              </Button>
              <Button onClick={handleResolve} isLoading={resolveComplaint.isPending}>
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Resolve
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Responses</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoadingResponses ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : responses && responses.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No responses yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {responses?.map((response) => (
                <div
                  key={response.id}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[var(--color-text)]">{response.author_name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {new Date(response.created_at).toLocaleString()}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text)]">{response.message}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Write a reply…"
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
              />
            </div>
            <Button onClick={handleReply} isLoading={createResponse.isPending} disabled={!replyMessage.trim()}>
              <Send className="size-4" aria-hidden="true" />
              Send
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
