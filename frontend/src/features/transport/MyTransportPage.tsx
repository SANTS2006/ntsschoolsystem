import { Truck } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { useMyTransport } from "./useTransportCrud";

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

export function MyTransportPage() {
  const { data: assignment, isLoading, isError, error } = useMyTransport();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My Transport</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Your assigned route, stop, and vehicle.</p>
      </div>

      {!assignment ? (
        <EmptyState
          icon={Truck}
          title="No transport assignment"
          description="You aren't assigned to a school transport route."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{assignment.route_name}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Stop" value={assignment.stop_name} />
            <Field label="Pickup time" value={assignment.pickup_time} />
            <Field label="Vehicle" value={assignment.vehicle_registration} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
