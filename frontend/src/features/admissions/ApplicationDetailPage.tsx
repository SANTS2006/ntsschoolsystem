import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileLink } from "@/components/ui/FileLink";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import { AcceptApplicationsDialog } from "./AcceptApplicationsDialog";
import { applicationStatusLabel, applicationStatusTone } from "./statusTone";
import { useApplication } from "./useAdmissionsCrud";

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="text-sm text-[var(--color-text)]">{value || <span className="text-[var(--color-text-muted)]">—</span>}</p>
    </div>
  );
}

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: application, isLoading, isError, error } = useApplication(id);
  const canUpdate = useHasPermission("admissions.update");
  const [acceptOpen, setAcceptOpen] = useState(false);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !application) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Application not found."}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate("/admissions/applications")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to applications
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">{application.full_name}</h1>
          <p className="mt-1 text-sm capitalize text-[var(--color-text-muted)]">{application.kind} applicant</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={applicationStatusTone(application.status)}>{applicationStatusLabel(application.status)}</Badge>
          {canUpdate && application.status !== "accepted" && application.status !== "rejected" && (
            <Button size="sm" onClick={() => setAcceptOpen(true)}>
              Accept
            </Button>
          )}
        </div>
      </div>

      <AcceptApplicationsDialog
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        applicants={[{ id: application.id, name: application.full_name, kind: application.kind }]}
        onDone={() => navigate("/admissions/applications")}
      />

      <Card>
        <CardHeader>
          <CardTitle>Contact details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Email" value={application.email} />
          <Field label="Phone" value={application.phone} />
          <Field label="Date of birth" value={application.date_of_birth} />
          <Field label="Gender" value={application.gender} />
          <Field label="Address" value={application.address} />
          {Object.entries(application.custom_answers ?? {}).map(([key, answer]) => (
            <Field key={key} label={answer.label} value={answer.value} />
          ))}
        </CardContent>
      </Card>

      {application.kind === "student" ? (
        <Card>
          <CardHeader>
            <CardTitle>Student application details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Applying for class" value={application.applying_for_class_name} />
            <Field label="Previous school" value={application.previous_school} />
            <Field label="Guardian name" value={application.guardian_name} />
            <Field label="Guardian phone" value={application.guardian_phone} />
            <Field label="Guardian email" value={application.guardian_email} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Staff application details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Applying for role" value={application.applying_for_role_name} />
            <Field label="Job title" value={application.job_title} />
            <Field label="Qualification" value={application.qualification} />
            <Field label="Years of experience" value={application.years_of_experience} />
          </CardContent>
        </Card>
      )}

      {(application.interview_datetime || application.interview_location || application.interview_notes) && (
        <Card>
          <CardHeader>
            <CardTitle>Interview</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Date & time"
              value={application.interview_datetime ? new Date(application.interview_datetime).toLocaleString() : null}
            />
            <Field label="Location" value={application.interview_location} />
            <Field label="Notes" value={application.interview_notes} />
          </CardContent>
        </Card>
      )}

      {application.status === "rejected" && application.rejection_reason && (
        <Alert tone="danger">{application.rejection_reason}</Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {application.documents.length === 0 ? (
            <EmptyState title="No documents" description="This applicant didn't attach any documents." />
          ) : (
            <div className="flex flex-col gap-2">
              {application.documents.map((document) => (
                <FileLink key={document.id} url={document.file} label={document.title} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
