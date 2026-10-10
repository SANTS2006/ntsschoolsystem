import { CheckCircle2, ExternalLink, Eye, Pencil, School as SchoolIcon, Trash2, XCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { setActingSchool } from "@/lib/actingSchool";
import { goTo, schoolPath } from "@/lib/schoolSlug";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { schoolUrl } from "./schoolUrl";
import { schoolStatusTone, statusLabel } from "./statusTone";
import { useActivateSchool, useSchool } from "./useSchoolsCrud";

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

export function SchoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: school, isLoading, isError, error } = useSchool(id);
  const activateSchool = useActivateSchool();

  const handleViewSchoolData = () => {
    if (!school) return;
    setActingSchool({ id: school.id, name: school.name });
    // The school's pages live under its own address, which is a different part of the site from this console.
    goTo(schoolPath(school.slug, "/dashboard"));
  };

  const handleActivate = () => {
    if (!school) return;
    activateSchool.mutate(school.id, {
      onSuccess: () => showToast({ title: "School activated" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not activate school", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !school) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "School not found."}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/platform/schools")}
          className="back-button"
        >
          <BackArrowIcon className="size-4" />
          Back to schools
        </button>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={handleViewSchoolData}>
            <Eye className="size-4" aria-hidden="true" />
            View school data
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/platform/schools/${school.id}/edit`)}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>
          {school.status !== "active" && (
            <Button size="sm" onClick={handleActivate} isLoading={activateSchool.isPending}>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Activate
            </Button>
          )}
          {school.status !== "suspended" && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => navigate(`/platform/schools/${school.id}/suspend`)}
            >
              <XCircle className="size-4" aria-hidden="true" />
              Suspend
            </Button>
          )}
          {school.status === "suspended" && (
            <Button variant="danger" size="sm" onClick={() => navigate(`/platform/schools/${school.id}/delete`)}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
              {school.logo ? (
                <img src={school.logo} alt="" className="size-full object-cover" />
              ) : (
                <SchoolIcon className="size-5 text-[var(--color-text-muted)]" aria-hidden="true" />
              )}
            </span>
            <div>
              <CardTitle className="text-base font-semibold text-[var(--color-text)]">{school.name}</CardTitle>
              <a
                href={schoolUrl(school.slug)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] hover:underline"
              >
                {schoolUrl(school.slug).replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
          <Badge tone={schoolStatusTone(school.status)}>{statusLabel(school.status)}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Motto" value={school.motto} />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Colours</p>
            <div className="mt-1 flex items-center gap-2">
              {[school.primary_color, school.secondary_color].map((color) => (
                <span key={color} className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text)]">
                  <span className="size-5 rounded-full border border-[var(--color-border)]" style={{ background: color }} aria-hidden="true" />
                  {color}
                </span>
              ))}
            </div>
          </div>
          <Field label="Email" value={school.email} />
          <Field label="Phone" value={school.phone_number} />
          <Field label="Website" value={school.website} />
          <Field label="Country" value={school.country} />
          <Field label="Region" value={school.region} />
          <Field label="City" value={school.city} />
          <Field label="Address" value={school.address} />
          <Field label="School type" value={statusLabel(school.school_type)} />
          <Field label="Ownership type" value={statusLabel(school.ownership_type)} />
          <Field label="Currency" value={school.currency} />
          <Field label="Timezone" value={school.timezone} />
          {school.status === "suspended" && (
            <Field label="Suspension reason" value={school.suspended_reason} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
