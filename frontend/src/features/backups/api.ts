import { apiClient } from "@/lib/api-client";

export type BackupKind = "automatic" | "manual" | "pre_restore";
export type BackupStatus = "pending" | "running" | "completed" | "failed";
export type Verification = "unverified" | "valid" | "invalid";
export type RestoreStatus =
  | "pending"
  | "preparing"
  | "backing_up_current_database"
  | "restoring"
  | "verifying"
  | "completed"
  | "failed";

export interface Backup {
  id: string;
  kind: BackupKind;
  status: BackupStatus;
  verification: Verification;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  verified_at: string | null;
  created_by_email: string;
  size_bytes: number;
  checksum_sha256: string;
  encrypted: boolean;
  storage: string;
  record_total: number;
  error_message: string;
  restorable: boolean;
  in_use_by_restore: boolean;
}

export interface Restore {
  id: string;
  backup_id: string;
  status: RestoreStatus;
  step_message: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  started_by_email: string;
  safety_backup_id: string | null;
  error_message: string;
  is_finished: boolean;
  request_id: string;
}

export interface BackupSettings {
  automatic_enabled: boolean;
  schedule_hour_utc: number;
  retention_days: number;
  min_valid_to_keep: number;
}

export interface BackupOverview {
  settings: BackupSettings;
  storage: string;
  storage_is_durable: boolean;
  encryption_configured: boolean;
  restore_allowed: boolean;
  last_valid_backup: Backup | null;
  last_failed_backup: Backup | null;
  running_backup: Backup | null;
  running_restore: Restore | null;
  next_scheduled_at: string | null;
  valid_backup_count: number;
  total_backup_count: number;
  total_size_bytes: number;
}

export interface PreparedRestore {
  backup_id: string;
  taken_at: string;
  kind: BackupKind;
  size_bytes: number;
  record_total: number;
  required_phrase: string;
  token: string;
  token_valid_seconds: number;
  warning: string;
}

export interface Page<T> {
  count: number;
  page: number;
  page_size: number;
  results: T[];
}

const BASE = "/platform/backups";

export async function fetchOverview(): Promise<BackupOverview> {
  const { data } = await apiClient.get<{ overview: BackupOverview }>(`${BASE}/overview/`);
  return data.overview;
}
export async function fetchBackups(page: number): Promise<Page<Backup>> {
  const { data } = await apiClient.get<Page<Backup>>(`${BASE}/`, { params: { page, page_size: 15 } });
  return data;
}
export async function fetchRestores(page: number): Promise<Page<Restore>> {
  const { data } = await apiClient.get<Page<Restore>>(`${BASE}/restores/`, { params: { page, page_size: 10 } });
  return data;
}
export async function fetchRestore(id: string): Promise<Restore> {
  const { data } = await apiClient.get<{ restore: Restore }>(`${BASE}/restores/${id}/`);
  return data.restore;
}
export async function createBackup(): Promise<Backup> {
  const { data } = await apiClient.post<{ backup: Backup }>(`${BASE}/`);
  return data.backup;
}
export async function verifyBackup(id: string): Promise<{ valid: boolean; backup: Backup }> {
  const { data } = await apiClient.post<{ valid: boolean; backup: Backup }>(`${BASE}/${id}/verify/`, undefined, {
    timeout: 5 * 60 * 1000,
  });
  return data;
}
export async function deleteBackup(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/${id}/`);
}
export async function prepareRestore(id: string): Promise<PreparedRestore> {
  const { data } = await apiClient.post<{ restore: PreparedRestore }>(`${BASE}/${id}/restore/prepare/`);
  return data.restore;
}
export async function startRestore(
  id: string,
  body: { token: string; confirmation: string; password: string },
): Promise<Restore> {
  const { data } = await apiClient.post<{ restore: Restore }>(`${BASE}/${id}/restore/`, body);
  return data.restore;
}
export async function saveBackupSettings(values: BackupSettings): Promise<BackupSettings> {
  const { data } = await apiClient.put<{ settings: BackupSettings }>(`${BASE}/settings/`, values);
  return data.settings;
}
export async function downloadBackupFile(id: string, filename: string): Promise<void> {
  const { data } = await apiClient.get<Blob>(`${BASE}/${id}/download/`, { responseType: "blob", timeout: 10 * 60 * 1000 });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
