import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { severityLabel, severityTone } from "./statusTone";
import { useAuditLog } from "./useAuditCrud";

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

function JsonBlock({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <pre className="mt-1 overflow-x-auto rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-3 text-xs text-[var(--color-text)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: log, isLoading, isError, error } = useAuditLog(id);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !log) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Audit entry not found."}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate("/audit")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to audit log
      </button>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-[var(--color-text)]">{log.action}</CardTitle>
            <p className="text-sm text-[var(--color-text-muted)]">{new Date(log.created_at).toLocaleString()}</p>
          </div>
          <Badge tone={severityTone(log.severity)}>{severityLabel(log.severity)}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Actor" value={log.actor_email} />
            <Field label="IP address" value={log.ip_address} />
            <Field label="Entity type" value={log.entity_type} />
            <Field label="Entity ID" value={log.entity_id} />
          </div>
          <JsonBlock label="Before" value={log.before} />
          <JsonBlock label="After" value={log.after} />
          <JsonBlock label="Metadata" value={log.metadata} />
        </CardContent>
      </Card>
    </div>
  );
}
