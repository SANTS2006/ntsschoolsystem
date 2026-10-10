import { HeartPulse } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { statusLabel, visitTypeTone } from "./statusTone";
import { useMyMedical } from "./useMedicalCrud";

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

export function MyMedicalPage() {
  const { data, isLoading, isError, error } = useMyMedical();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My Medical</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Your medical profile and visit history.</p>
      </div>

      {!data?.profile ? (
        <EmptyState
          icon={HeartPulse}
          title="No medical profile yet"
          description="The school hasn't recorded a medical profile for you yet."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Medical profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Blood group" value={data.profile.blood_group} />
            <Field label="Allergies" value={data.profile.allergies} />
            <Field label="Chronic conditions" value={data.profile.chronic_conditions} />
            <Field label="Emergency contact" value={data.profile.emergency_contact_name} />
            <Field label="Emergency phone" value={data.profile.emergency_contact_phone} />
            <Field label="Notes" value={data.profile.notes} />
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">Visit history</h2>
        {!data?.visits || data.visits.length === 0 ? (
          <EmptyState icon={HeartPulse} title="No visits on record" description="You haven't visited the school clinic." />
        ) : (
          <div className="flex flex-col gap-3">
            {data.visits.map((visit) => (
              <Card key={visit.id}>
                <CardHeader className="flex-row items-center justify-between">
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {new Date(visit.visited_at).toLocaleString()}
                  </p>
                  <Badge tone={visitTypeTone(visit.visit_type)}>{statusLabel(visit.visit_type)}</Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  {visit.symptoms && <p className="text-sm text-[var(--color-text)]">Symptoms: {visit.symptoms}</p>}
                  {visit.treatment && <p className="text-sm text-[var(--color-text)]">Treatment: {visit.treatment}</p>}
                  {visit.attended_by_name && (
                    <p className="text-sm text-[var(--color-text-muted)]">Attended by {visit.attended_by_name}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
