import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Inbox, Mail, Phone } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { fetchEnquiries, setEnquiryHandled, type Enquiry } from "./api";

const PAGE_SIZE = 20;
const KEY = ["platform", "enquiries"] as const;

const EMAIL_STATUS: Record<Enquiry["email_status"], { label: string; tone: "success" | "warning" | "neutral" }> = {
  sent: { label: "Team e-mailed", tone: "success" },
  failed: { label: "E-mail failed", tone: "warning" },
  not_configured: { label: "E-mail not set up", tone: "warning" },
  pending: { label: "E-mail pending", tone: "neutral" },
};

const words = (value: string) => value.replace(/_/g, " ");

/** What the public website collected: demo requests and contact messages. The Django admin is not exposed in
 * production, so this is where the NTS team reads them and marks them handled. */
export function EnquiriesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"waiting" | "all">("waiting");

  const params = { page, page_size: PAGE_SIZE, handled: filter === "waiting" ? false : undefined };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [...KEY, params],
    queryFn: () => fetchEnquiries(params),
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  });
  const toggle = useMutation<Enquiry, ApiError, { id: string; handled: boolean }>({
    mutationFn: ({ id, handled }) => setEnquiryHandled(id, handled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    onError: (err) => showToast({ title: "Could not update the enquiry", description: generalErrorMessage(err), tone: "danger" }),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Website enquiries" description="Demo requests and messages sent from the public website." />
      <div className="flex gap-2" role="group" aria-label="Show">
        {(["waiting", "all"] as const).map((value) => (
          <Button
            key={value}
            variant={filter === value ? "primary" : "secondary"}
            onClick={() => {
              setFilter(value);
              setPage(1);
            }}
          >
            {value === "waiting" ? "Waiting for a reply" : "All"}
          </Button>
        ))}
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}
      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Inbox} title={filter === "waiting" ? "Nothing waiting" : "No enquiries yet"} description="New website enquiries appear here." />
      ) : (
        <div className="flex flex-col gap-3">
          {data?.results.map((enquiry) => {
            const mail = EMAIL_STATUS[enquiry.email_status];
            return (
              <Card key={enquiry.id}>
                <CardContent className="flex flex-col gap-3 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{enquiry.name}</span>
                      <Badge tone={enquiry.kind === "demo" ? "primary" : "neutral"}>{enquiry.kind === "demo" ? "Demo request" : "Message"}</Badge>
                      <Badge tone={mail.tone}>{mail.label}</Badge>
                      {enquiry.handled && <Badge tone="success">Handled</Badge>}
                    </div>
                    <span className="text-xs text-[var(--color-text-muted)]">{new Date(enquiry.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <a className="inline-flex items-center gap-1.5 text-[var(--color-primary)] hover:underline" href={`mailto:${enquiry.email}`}>
                      <Mail className="size-4" aria-hidden="true" /> {enquiry.email}
                    </a>
                    {enquiry.phone && (
                      <a className="inline-flex items-center gap-1.5 text-[var(--color-primary)] hover:underline" href={`tel:${enquiry.phone.replace(/[^+\d]/g, "")}`}>
                        <Phone className="size-4" aria-hidden="true" /> {enquiry.phone}
                      </a>
                    )}
                    {enquiry.preferred_contact && <span className="text-[var(--color-text-muted)]">Prefers {enquiry.preferred_contact}</span>}
                  </div>
                  {(enquiry.organization || enquiry.school_type || enquiry.student_count || enquiry.topic || enquiry.interests.length > 0) && (
                    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      {enquiry.organization && (
                        <div>
                          <dt className="inline text-[var(--color-text-muted)]">School: </dt>
                          <dd className="inline">{enquiry.organization}</dd>
                        </div>
                      )}
                      {enquiry.school_type && (
                        <div>
                          <dt className="inline text-[var(--color-text-muted)]">Type: </dt>
                          <dd className="inline">{words(enquiry.school_type)}</dd>
                        </div>
                      )}
                      {enquiry.student_count && (
                        <div>
                          <dt className="inline text-[var(--color-text-muted)]">Students: </dt>
                          <dd className="inline">{enquiry.student_count}</dd>
                        </div>
                      )}
                      {enquiry.topic && (
                        <div>
                          <dt className="inline text-[var(--color-text-muted)]">Topic: </dt>
                          <dd className="inline">{enquiry.topic}</dd>
                        </div>
                      )}
                      {enquiry.interests.length > 0 && (
                        <div className="sm:col-span-2">
                          <dt className="inline text-[var(--color-text-muted)]">Interested in: </dt>
                          <dd className="inline">{enquiry.interests.map(words).join(", ")}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {enquiry.message && <p className="whitespace-pre-wrap rounded-md bg-[var(--color-bg-subtle)] p-3 text-sm">{enquiry.message}</p>}
                  <div>
                    <Button variant="secondary" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: enquiry.id, handled: !enquiry.handled })}>
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      {enquiry.handled ? "Mark as waiting" : "Mark as handled"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {data && <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage} />}
        </div>
      )}
    </div>
  );
}
