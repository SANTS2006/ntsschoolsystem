import { ShieldAlert } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { incidentStatusTone, severityTone, statusLabel } from "./statusTone";
import { useMyDiscipline } from "./useDisciplineCrud";

export function MyDisciplinePage() {
  const { data: incidents, isLoading, isError, error } = useMyDiscipline();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My Discipline</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Disciplinary incidents recorded for you.</p>
      </div>

      {!incidents || incidents.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No incidents on record" description="Nothing has been reported for you." />
      ) : (
        <div className="flex flex-col gap-4">
          {incidents.map((incident) => (
            <Card key={incident.id}>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-[var(--color-text)]">
                    {incident.category_label}
                  </CardTitle>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {new Date(incident.incident_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge tone={severityTone(incident.severity)}>{statusLabel(incident.severity)}</Badge>
                  <Badge tone={incidentStatusTone(incident.status)}>{statusLabel(incident.status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm text-[var(--color-text)]">{incident.description}</p>
                {incident.action_taken !== "none" && (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Action taken: <span className="text-[var(--color-text)]">{statusLabel(incident.action_taken)}</span>
                  </p>
                )}
                {incident.follow_up_notes && (
                  <p className="text-sm text-[var(--color-text-muted)]">Follow-up: {incident.follow_up_notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
