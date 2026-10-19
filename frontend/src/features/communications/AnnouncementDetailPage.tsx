import { Pencil, Send, Users } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { OpenFileButton } from "@/components/ui/FileViewer";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { publishedTone, targetTypeLabel } from "./statusTone";
import { useAnnouncement, usePublishAnnouncement } from "./useCommunicationsCrud";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-0.5 break-words text-sm text-[var(--color-text)]">{value || <span className="text-[var(--color-text-muted)]">—</span>}</p>
    </div>
  );
}

/** One communication in full. Only its creator sees the Edit (and, for a draft, Publish) buttons. */
export function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const canUpdate = useHasPermission("communications.update");
  const canCreate = useHasPermission("communications.create");
  const { data: a, isLoading, isError, error } = useAnnouncement(id);
  const publish = usePublishAnnouncement();

  if (isLoading) return <FullPageSpinner />;
  if (isError || !a) return <Alert tone="danger">{(error as ApiError | undefined)?.message ?? "Communication not found."}</Alert>;

  const handlePublish = () =>
    publish.mutate(a.id, {
      onSuccess: (result) => showToast({ title: result.message }),
      onError: (err: ApiError) => showToast({ title: "Could not publish", description: generalErrorMessage(err), tone: "danger" }),
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => navigate("/communications")} className="back-button">
          <BackArrowIcon className="size-4" />
          Back to communications
        </button>
        <div className="flex flex-wrap justify-end gap-2">
          {a.target_type === "specific_users" && a.is_mine && canUpdate && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/communications/${a.id}/recipients`)}>
              <Users className="size-4" aria-hidden="true" />
              Recipients
            </Button>
          )}
          {canCreate && a.is_mine && !a.published_at && (
            <Button size="sm" onClick={handlePublish} isLoading={publish.isPending}>
              <Send className="size-4" aria-hidden="true" />
              Publish
            </Button>
          )}
          {canUpdate && a.is_mine && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/communications/${a.id}/edit`)}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="min-w-0 break-words text-base font-semibold">{a.title}</CardTitle>
          <Badge tone={publishedTone(a.published_at)}>{a.published_at ? "Published" : "Draft"}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {a.image && (
            <OpenFileButton url={a.image} title={a.title} className="block w-full cursor-zoom-in sm:col-span-2">
              <img src={a.image} alt={a.title} className="max-h-72 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] object-cover" />
            </OpenFileButton>
          )}
          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Message</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--color-text)]">{a.body}</p>
          </div>
          <Field
            label="Audience"
            value={[targetTypeLabel(a.target_type), a.target_class_name, a.target_section_name, a.target_department_name].filter(Boolean).join(" — ")}
          />
          <Field label="Also sent by e-mail" value={a.send_email ? "Yes" : "No"} />
          <Field label="Created by" value={a.created_by_name} />
          <Field label="Created" value={new Date(a.created_at).toLocaleString()} />
          <Field label="Published by" value={a.published_by_name} />
          <Field label="Published" value={a.published_at ? new Date(a.published_at).toLocaleString() : ""} />
          <Field label="Last updated" value={new Date(a.updated_at).toLocaleString()} />
          <Field label="Active" value={a.is_active ? "Yes" : "No"} />
        </CardContent>
      </Card>
    </div>
  );
}
