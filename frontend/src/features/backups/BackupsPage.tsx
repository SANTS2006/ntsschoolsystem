import { CheckCircle2, Clock, DatabaseBackup, Download, HardDrive, History, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { StatRow } from "@/components/ui/StatRow";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";

import { downloadBackupFile, type Backup, type BackupOverview, type BackupSettings, type Restore } from "./api";
import { RestoreWizard } from "./RestoreWizard";
import {
  useBackupList,
  useBackupOverview,
  useCreateBackup,
  useDeleteBackup,
  useRestoreList,
  useSaveBackupSettings,
  useVerifyBackup,
} from "./useBackups";

const STORAGE_LABEL: Record<string, string> = { r2: "Cloudflare R2", s3: "S3 bucket", cloudinary: "Cloudinary", local: "This server's disk" };
const KIND_LABEL = { automatic: "Automatic", manual: "Manual", pre_restore: "Safety (before restore)" } as const;
const STATUS_TONE: Record<Backup["status"], BadgeTone> = { pending: "neutral", running: "warning", completed: "success", failed: "danger" };
const VERIFY_TONE: Record<Backup["verification"], BadgeTone> = { unverified: "neutral", valid: "success", invalid: "danger" };
const VERIFY_LABEL: Record<Backup["verification"], string> = { unverified: "Not verified", valid: "Verified", invalid: "Invalid" };

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

function Overview({ overview }: { overview: BackupOverview }) {
  const last = overview.last_valid_backup;
  return (
    <>
      {!overview.storage_is_durable && (
        <Alert tone="danger">
          Backups are being saved to this server&apos;s own disk, which is wiped whenever the server restarts or is redeployed.
          Set the backup storage to cloud storage so they survive.
        </Alert>
      )}
      {!overview.encryption_configured && (
        <Alert tone="danger">No backup encryption key is set, so new backups will fail. Set BACKUP_ENCRYPTION_KEY on the server.</Alert>
      )}
      {!last && <Alert tone="warning">There is no verified backup yet. Take one now so there is something to recover from.</Alert>}
      {overview.last_failed_backup && (!last || overview.last_failed_backup.created_at > last.created_at) && (
        <Alert tone="danger">
          The latest backup failed ({when(overview.last_failed_backup.created_at)}): {overview.last_failed_backup.error_message || "unknown reason"}
        </Alert>
      )}
      {overview.running_restore && (
        <Alert tone="warning">A restore is in progress: {overview.running_restore.step_message || overview.running_restore.status}.</Alert>
      )}
      <StatRow
        items={[
          {
            key: "last",
            label: "Last verified backup",
            value: last ? new Date(last.created_at).toLocaleDateString() : "None",
            footnote: last ? `${new Date(last.created_at).toLocaleTimeString()} · ${formatBytes(last.size_bytes)}` : undefined,
            icon: ShieldCheck,
            tone: last ? "success" : "danger",
          },
          {
            key: "next",
            label: "Next automatic backup",
            value: overview.next_scheduled_at ? new Date(overview.next_scheduled_at).toLocaleDateString() : "Off",
            footnote: overview.next_scheduled_at ? new Date(overview.next_scheduled_at).toLocaleTimeString() : "Automatic backups are switched off",
            icon: Clock,
          },
          {
            key: "count",
            label: "Verified backups kept",
            value: overview.valid_backup_count,
            footnote: `${overview.total_backup_count} in total · ${formatBytes(overview.total_size_bytes)}`,
            icon: DatabaseBackup,
          },
          {
            key: "storage",
            label: "Stored in",
            value: STORAGE_LABEL[overview.storage] ?? overview.storage,
            footnote: `Kept ${overview.settings.retention_days} days, at least ${overview.settings.min_valid_to_keep} verified`,
            icon: HardDrive,
          },
        ]}
      />
    </>
  );
}

function SettingsCard({ settings }: { settings: BackupSettings }) {
  const save = useSaveBackupSettings();
  const { showToast } = useToast();
  const [values, setValues] = useState(settings);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    save.mutate(values, {
      onSuccess: () => showToast({ title: "Backup settings saved" }),
      onError: (err: ApiError) => setError(err.errors[0]?.message ?? err.message),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Schedule &amp; retention</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Checkbox
          label="Back up automatically every day"
          checked={values.automatic_enabled}
          onChange={(e) => setValues({ ...values, automatic_enabled: e.target.checked })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            type="number"
            min={0}
            max={23}
            label="Daily backup hour (UTC)"
            value={values.schedule_hour_utc}
            onChange={(e) => setValues({ ...values, schedule_hour_utc: Number(e.target.value) })}
          />
          <Input
            type="number"
            min={1}
            max={365}
            label="Keep backups for (days)"
            value={values.retention_days}
            onChange={(e) => setValues({ ...values, retention_days: Number(e.target.value) })}
          />
          <Input
            type="number"
            min={1}
            max={60}
            label="Always keep this many verified"
            hint="Older than the limit, but never fewer than this many."
            value={values.min_valid_to_keep}
            onChange={(e) => setValues({ ...values, min_valid_to_keep: Number(e.target.value) })}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={submit} isLoading={save.isPending}>
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RestoreHistory() {
  const [page, setPage] = useState(1);
  const { data } = useRestoreList(page);
  if (!data || data.count === 0) return null;
  const tone = (r: Restore): BadgeTone => (r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "warning");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" aria-hidden="true" /> Restore history
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Started</TableHeaderCell>
                <TableHeaderCell>By</TableHeaderCell>
                <TableHeaderCell>Result</TableHeaderCell>
                <TableHeaderCell>Details</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((restore) => (
                <TableRow key={restore.id}>
                  <TableCell>{when(restore.created_at)}</TableCell>
                  <TableCell>{restore.started_by_email}</TableCell>
                  <TableCell>
                    <Badge tone={tone(restore)}>{restore.status.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell>{restore.error_message || restore.step_message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t border-[var(--color-border)]">
            <Pagination page={page} pageSize={data.page_size} count={data.count} onPageChange={setPage} />
          </div>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

export function BackupsPage() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const { data: overview, isLoading, isError, error, refetch } = useBackupOverview();
  const { data: list } = useBackupList(page);
  const create = useCreateBackup();
  const verify = useVerifyBackup();
  const remove = useDeleteBackup();
  const [restoring, setRestoring] = useState<Backup | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (isLoading) return <FullPageSpinner />;
  if (isError || !overview) {
    return (
      <Alert tone="danger">
        <span className="flex flex-wrap items-center gap-3">
          {(error as ApiError | null)?.message ?? "Could not load the backups."}
          <Button size="sm" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </span>
      </Alert>
    );
  }

  const runningBackup = !!overview.running_backup || create.isPending;

  const handleCreate = () =>
    create.mutate(undefined, {
      onSuccess: () => showToast({ title: "Backup started", description: "It will appear below and be verified automatically." }),
      onError: (err: ApiError) => showToast({ title: "Could not start the backup", description: err.message, tone: "danger" }),
    });

  const handleVerify = (backup: Backup) => {
    setBusyId(backup.id);
    verify.mutate(backup.id, {
      onSuccess: ({ valid }) =>
        showToast({ title: valid ? "Backup is valid" : "Backup failed verification", tone: valid ? "success" : "danger" }),
      onError: (err: ApiError) => showToast({ title: "Could not verify", description: err.message, tone: "danger" }),
      onSettled: () => setBusyId(null),
    });
  };

  const handleDelete = async (backup: Backup) => {
    const ok = await confirm({
      title: "Delete this backup?",
      description: `The backup from ${when(backup.created_at)} is removed from storage for good.`,
      tone: "danger",
    });
    if (!ok) return;
    remove.mutate(backup.id, {
      onSuccess: () => showToast({ title: "Backup deleted" }),
      onError: (err: ApiError) => showToast({ title: "Could not delete", description: err.message, tone: "danger" }),
    });
  };

  const handleDownload = async (backup: Backup) => {
    try {
      await downloadBackupFile(backup.id, `nts-backup-${backup.created_at.slice(0, 16).replace(/[:T]/g, "-")}.ntsbak`);
    } catch (err) {
      showToast({ title: "Could not download", description: (err as ApiError).message, tone: "danger" });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Backup & Recovery"
        description="Daily encrypted backups of the whole database, with verified restore points."
        actions={
          <Button onClick={handleCreate} isLoading={runningBackup} disabled={runningBackup}>
            <DatabaseBackup className="size-4" aria-hidden="true" />
            {runningBackup ? "Backing up…" : "Back up now"}
          </Button>
        }
      />

      <Overview overview={overview} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backups</CardTitle>
        </CardHeader>
        <CardContent>
          {!list ? (
            <FullPageSpinner />
          ) : list.count === 0 ? (
            <EmptyState icon={DatabaseBackup} title="No backups yet" description="Back up now, or wait for the first automatic backup." />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Taken</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Verification</TableHeaderCell>
                    <TableHeaderCell>Size</TableHeaderCell>
                    <TableHeaderCell>By</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {list.results.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell title={backup.error_message || undefined}>{when(backup.created_at)}</TableCell>
                      <TableCell>{KIND_LABEL[backup.kind]}</TableCell>
                      <TableCell>
                        <Badge tone={STATUS_TONE[backup.status]}>{backup.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge tone={VERIFY_TONE[backup.verification]}>{VERIFY_LABEL[backup.verification]}</Badge>
                      </TableCell>
                      <TableCell>{formatBytes(backup.size_bytes)}</TableCell>
                      <TableCell>{backup.created_by_email || "Scheduler"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {backup.status !== "pending" && backup.status !== "running" && (
                            <button
                              type="button"
                              onClick={() => handleVerify(backup)}
                              disabled={busyId === backup.id}
                              title="Verify this backup"
                              aria-label="Verify this backup"
                              className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-success)]"
                            >
                              <CheckCircle2 className="size-4" aria-hidden="true" />
                            </button>
                          )}
                          {backup.status === "completed" && (
                            <button
                              type="button"
                              onClick={() => void handleDownload(backup)}
                              title="Download the encrypted file"
                              aria-label="Download the encrypted file"
                              className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                            >
                              <Download className="size-4" aria-hidden="true" />
                            </button>
                          )}
                          {backup.restorable && overview.restore_allowed && (
                            <button
                              type="button"
                              onClick={() => setRestoring(backup)}
                              title="Restore the database to this backup"
                              aria-label="Restore the database to this backup"
                              className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-warning)]"
                            >
                              <RotateCcw className="size-4" aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDelete(backup)}
                            title="Delete this backup"
                            aria-label="Delete this backup"
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t border-[var(--color-border)]">
                <Pagination page={page} pageSize={list.page_size} count={list.count} onPageChange={setPage} />
              </div>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <RestoreHistory />
      <SettingsCard key={JSON.stringify(overview.settings)} settings={overview.settings} />

      {restoring && <RestoreWizard backup={restoring} onClose={() => setRestoring(null)} />}
    </div>
  );
}
