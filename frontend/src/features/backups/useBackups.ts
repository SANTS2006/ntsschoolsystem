import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  createBackup,
  deleteBackup,
  fetchBackups,
  fetchOverview,
  fetchRestore,
  fetchRestores,
  prepareRestore,
  saveBackupSettings,
  startRestore,
  verifyBackup,
  type Backup,
  type BackupOverview,
  type BackupSettings,
  type Page,
  type PreparedRestore,
  type Restore,
} from "./api";

export const BACKUPS_KEY = ["platform", "backups"] as const;

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: BACKUPS_KEY });
}

export function useBackupOverview() {
  return useQuery<BackupOverview, ApiError>({
    queryKey: [...BACKUPS_KEY, "overview"],
    queryFn: fetchOverview,
    // Quick while something is happening, relaxed otherwise.
    refetchInterval: (query) => (query.state.data?.running_backup || query.state.data?.running_restore ? 3000 : 30_000),
  });
}

export function useBackupList(page: number) {
  return useQuery<Page<Backup>, ApiError>({
    queryKey: [...BACKUPS_KEY, "list", page],
    queryFn: () => fetchBackups(page),
    placeholderData: (previous) => previous,
    refetchInterval: (query) =>
      query.state.data?.results.some((b) => b.status === "pending" || b.status === "running") ? 3000 : false,
  });
}

export function useRestoreList(page: number) {
  return useQuery<Page<Restore>, ApiError>({
    queryKey: [...BACKUPS_KEY, "restores", page],
    queryFn: () => fetchRestores(page),
    placeholderData: (previous) => previous,
  });
}

/** One restore, polled until it finishes — drives the progress screen. */
export function useRestoreProgress(id: string | null) {
  return useQuery<Restore, ApiError>({
    queryKey: [...BACKUPS_KEY, "restore", id],
    queryFn: () => fetchRestore(id as string),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.is_finished ? false : 2000),
    // During the restore itself the database is locked for a moment; keep trying rather than giving up.
    retry: 5,
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();
  return useMutation<Backup, ApiError>({ mutationFn: createBackup, onSuccess: () => invalidateAll(queryClient) });
}

export function useVerifyBackup() {
  const queryClient = useQueryClient();
  return useMutation<{ valid: boolean; backup: Backup }, ApiError, string>({
    mutationFn: verifyBackup,
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useDeleteBackup() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({ mutationFn: deleteBackup, onSuccess: () => invalidateAll(queryClient) });
}

export function usePrepareRestore() {
  return useMutation<PreparedRestore, ApiError, string>({ mutationFn: prepareRestore });
}

export function useStartRestore() {
  const queryClient = useQueryClient();
  return useMutation<Restore, ApiError, { id: string; token: string; confirmation: string; password: string }>({
    mutationFn: ({ id, ...body }) => startRestore(id, body),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useSaveBackupSettings() {
  const queryClient = useQueryClient();
  return useMutation<BackupSettings, ApiError, BackupSettings>({
    mutationFn: saveBackupSettings,
    onSuccess: () => invalidateAll(queryClient),
  });
}
