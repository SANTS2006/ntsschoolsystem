import { useQuery } from "@tanstack/react-query";
import { BedDouble, Building2, Phone, Users } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, type ApiError } from "@/lib/api-client";

interface Stay {
  id: string;
  status: "active" | "checked_out";
  check_in_date: string;
  check_out_date: string | null;
  hostel: string;
  gender_restriction: string;
  room_number: string;
  room_capacity: number;
  bed_number: string;
  warden_name: string | null;
  warden_phone: string | null;
  roommates: string[];
}

function Fact({ icon: Icon, label, value }: { icon: typeof BedDouble; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
        <p className="text-base font-semibold text-[var(--color-text)]">{value}</p>
      </div>
    </div>
  );
}

/** A student's own hostel: the hostel, room and bed they've been given, who looks after it, who shares the room, and
 * any earlier stays. */
export function MyHostelPage() {
  const { data, isLoading, isError, error } = useQuery<{ current: Stay | null; history: Stay[] }, ApiError>({
    queryKey: ["hostel", "my"],
    queryFn: async () => (await apiClient.get("/hostel/my/")).data,
  });
  if (isLoading) return <Spinner />;
  if (isError || !data) return <Alert tone="danger">{(error as ApiError | null)?.message ?? "Could not load your hostel details."}</Alert>;
  const { current, history } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My hostel</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Your hostel, room and bed.</p>
      </div>

      {!current ? (
        <EmptyState icon={BedDouble} title="No hostel bed yet" description="When the school gives you a hostel bed, the details appear here and you are notified." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {current.hostel} <Badge tone="success">Current</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Fact icon={Building2} label="Hostel" value={`${current.hostel} (${current.gender_restriction})`} />
            <Fact icon={BedDouble} label="Room and bed" value={`Room ${current.room_number} · Bed ${current.bed_number}`} />
            <Fact icon={Users} label={`Roommates (room holds ${current.room_capacity})`} value={current.roommates.length ? current.roommates.join(", ") : "No one else yet"} />
            <Fact
              icon={Phone}
              label="Warden"
              value={current.warden_name ? `${current.warden_name}${current.warden_phone ? ` · ${current.warden_phone}` : ""}` : "Not assigned"}
            />
            <p className="text-sm text-[var(--color-text-muted)] sm:col-span-2">
              Since {new Date(current.check_in_date).toLocaleDateString(undefined, { dateStyle: "long" })}
            </p>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Earlier stays</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-[var(--color-border)]">
              {history.map((stay) => (
                <li key={stay.id} className="py-2 text-sm text-[var(--color-text)]">
                  {stay.hostel} · Room {stay.room_number} · Bed {stay.bed_number}
                  <span className="block text-xs text-[var(--color-text-muted)]">
                    {new Date(stay.check_in_date).toLocaleDateString()} – {stay.check_out_date ? new Date(stay.check_out_date).toLocaleDateString() : "now"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
