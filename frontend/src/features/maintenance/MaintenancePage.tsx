import { CheckCircle2, Wrench } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { NAV_CONFIG } from "@/layouts/navConfig";

import type { Maintenance } from "./api";
import { useMaintenance, useSaveMaintenance } from "./useMaintenance";

/** Pages the notice can be limited to: the sign-in pages plus every module in the menu. */
const PAGE_CHOICES = [
  { path: "/login", label: "Sign-in pages" },
  ...NAV_CONFIG.map((item) => ({ path: item.to, label: item.label })),
].filter((choice, index, all) => all.findIndex((other) => other.path === choice.path) === index);

const DEFAULT_MESSAGE =
  "The system is currently under maintenance. Some things may be unavailable or slow for a while. We're sorry for the inconvenience and will be back shortly.";

export function MaintenancePage() {
  const { data, isLoading } = useMaintenance();
  if (isLoading || !data) return <FullPageSpinner />;
  // Remounts with fresh values whenever the saved setting changes.
  return <MaintenanceForm key={`${data.enabled}-${data.enabled_at}`} current={data} />;
}

function MaintenanceForm({ current }: { current: Maintenance }) {
  const { showToast } = useToast();
  const save = useSaveMaintenance();
  const [message, setMessage] = useState(current.message || DEFAULT_MESSAGE);
  const [allPages, setAllPages] = useState(current.all_pages);
  const [pages, setPages] = useState<string[]>(current.pages);
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const togglePage = (path: string) =>
    setPages((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));

  const submit = (enabled: boolean) => {
    setError(null);
    save.mutate(
      { enabled, message: message.trim(), all_pages: allPages, pages: allPages ? [] : pages, notify },
      {
        onSuccess: ({ emailing }) =>
          showToast({
            title: enabled ? "Maintenance mode is on" : "Maintenance mode is off",
            description: emailing ? "Everyone is being emailed about it." : undefined,
          }),
        onError: (err: ApiError) => setError(err.errors[0]?.message ?? err.message),
      },
    );
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Maintenance"
        description="Tell everyone the system is being worked on. A banner shows the message, and users can be emailed."
        actions={
          <Badge tone={current.enabled ? "warning" : "success"}>{current.enabled ? "Maintenance is ON" : "System is live"}</Badge>
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What users see</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Textarea
            label="Message"
            rows={4}
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            hint="Shown in the banner and sent in the email. Mention when you expect to be back."
          />
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-amber-500/40 bg-amber-100 px-4 py-3 text-sm text-amber-950 dark:bg-amber-500/15 dark:text-amber-100">
            <Wrench className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 whitespace-pre-line break-words">
              <strong className="font-semibold">Under maintenance. </strong>
              {message || DEFAULT_MESSAGE}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where it shows</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Where the message is shown">
            <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input type="radio" name="scope" className="accent-[var(--color-primary)]" checked={allPages} onChange={() => setAllPages(true)} />
              On every page
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input type="radio" name="scope" className="accent-[var(--color-primary)]" checked={!allPages} onChange={() => setAllPages(false)} />
              Only on the pages I choose
            </label>
          </div>
          {!allPages && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PAGE_CHOICES.map((choice) => (
                <Checkbox
                  key={choice.path}
                  label={choice.label}
                  checked={pages.includes(choice.path)}
                  onChange={() => togglePage(choice.path)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          {!current.enabled && (
            <Checkbox
              label="Email everyone when I turn it on"
              hint="Every active user — platform admins, staff, students and parents with an email address — gets the message, in their school's own email style."
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
            />
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {current.enabled && (
              <>
                <Button variant="secondary" onClick={() => submit(true)} isLoading={save.isPending}>
                  Save changes
                </Button>
                <Button onClick={() => submit(false)} isLoading={save.isPending}>
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Turn maintenance off
                </Button>
              </>
            )}
            {!current.enabled && (
              <Button variant="danger" onClick={() => submit(true)} isLoading={save.isPending}>
                <Wrench className="size-4" aria-hidden="true" />
                Turn maintenance on
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
