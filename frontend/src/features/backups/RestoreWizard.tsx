import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Spinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import type { Backup, PreparedRestore, RestoreStatus } from "./api";
import { usePrepareRestore, useRestoreProgress, useStartRestore } from "./useBackups";

const STEPS: { status: RestoreStatus; label: string }[] = [
  { status: "preparing", label: "Checking the backup" },
  { status: "backing_up_current_database", label: "Saving a safety backup of the current database" },
  { status: "restoring", label: "Replacing the database contents" },
  { status: "verifying", label: "Checking the restored database" },
  { status: "completed", label: "Done" },
];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A restore is deliberately slow to start: read the warning, type the confirmation, enter your password, then watch
 * it run. Closing the window never stops a restore that has begun. */
export function RestoreWizard({ backup, onClose }: { backup: Backup; onClose: () => void }) {
  const prepare = usePrepareRestore();
  const start = useStartRestore();
  const [prepared, setPrepared] = useState<PreparedRestore | null>(null);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const progress = useRestoreProgress(restoreId);

  // Step 1 runs as soon as the wizard opens: it validates the backup and fetches the confirmation details.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    prepare.mutate(backup.id, { onSuccess: setPrepared });
  }, [backup.id, prepare]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!prepared) return;
    start.mutate(
      { id: backup.id, token: prepared.token, confirmation: phrase, password },
      { onSuccess: (restore) => setRestoreId(restore.id) },
    );
  };

  const restore = progress.data;
  const finished = restore?.is_finished ?? false;
  const stepIndex = restore ? STEPS.findIndex((s) => s.status === restore.status) : -1;
  // A running restore can't be dismissed by accident.
  const canClose = !restoreId || finished || progress.isError;

  return (
    <Modal open onClose={canClose ? onClose : () => undefined} title="Restore the database" maxWidthClassName="max-w-xl">
      {!restoreId ? (
        prepare.isPending || (!prepared && !prepare.isError) ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : prepare.isError ? (
          <div className="flex flex-col gap-4">
            <Alert tone="danger">{(prepare.error as ApiError).message}</Alert>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : prepared ? (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Alert tone="danger">
              <span className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{prepared.warning}</span>
              </span>
            </Alert>
            <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3 text-sm">
              <div>
                <dt className="text-[var(--color-text-muted)]">Backup taken</dt>
                <dd className="font-medium text-[var(--color-text)]">{new Date(prepared.taken_at).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">Size</dt>
                <dd className="font-medium text-[var(--color-text)]">{formatBytes(prepared.size_bytes)}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">Records inside</dt>
                <dd className="font-medium text-[var(--color-text)]">{prepared.record_total.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">Before restoring</dt>
                <dd className="font-medium text-[var(--color-text)]">A safety backup is taken</dd>
              </div>
            </dl>
            {start.isError && <Alert tone="danger">{(start.error as ApiError).message}</Alert>}
            <Input
              label={`Type “${prepared.required_phrase}” to confirm`}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <PasswordInput
              label="Your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                isLoading={start.isPending}
                disabled={phrase.trim() !== prepared.required_phrase || !password}
              >
                <AlertTriangle className="size-4" aria-hidden="true" />
                Restore the database
              </Button>
            </div>
          </form>
        ) : null
      ) : (
        <div className="flex flex-col gap-4" aria-live="polite">
          {restore?.status === "failed" ? (
            <Alert tone="danger">
              <span className="flex items-start gap-2">
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  The restore did not complete and nothing was changed. {restore.error_message}
                  {restore.request_id && <span className="mt-1 block text-xs opacity-80">Reference: {restore.request_id}</span>}
                </span>
              </span>
            </Alert>
          ) : restore?.status === "completed" ? (
            <Alert tone="success">
              <span className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>The database was restored. You may need to sign in again.</span>
              </span>
            </Alert>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              The restore is running in the background. Please keep this window open — it can take a few minutes.
            </p>
          )}
          <ol className="flex flex-col gap-2">
            {STEPS.map((step, index) => {
              const done = restore?.status === "completed" || (stepIndex > index && restore?.status !== "failed");
              const active = stepIndex === index && !finished;
              return (
                <li key={step.status} className="flex items-center gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center">
                    {done ? (
                      <CheckCircle2 className="size-5 text-[var(--color-success)]" aria-hidden="true" />
                    ) : active ? (
                      <Spinner size="sm" />
                    ) : (
                      <span className="size-2.5 rounded-full bg-[var(--color-border)]" aria-hidden="true" />
                    )}
                  </span>
                  <span className={active ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}>{step.label}</span>
                </li>
              );
            })}
          </ol>
          {restore?.safety_backup_id && (
            <p className="text-xs text-[var(--color-text-muted)]">A safety backup of the previous data was saved first and appears in the backup list.</p>
          )}
          {progress.isError && !finished && (
            <p className="text-xs text-[var(--color-text-muted)]">Waiting for the server… the restore carries on regardless.</p>
          )}
          {canClose && (
            <div className="flex justify-end">
              <Button onClick={onClose}>{finished ? "Close" : "Hide"}</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
