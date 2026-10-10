import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  deletePlatformAdmin,
  disablePlatformAdmin,
  enablePlatformAdmin,
  fetchPlatformAdmins,
  fetchPlatformStats,
  invitePlatformAdmin,
} from "./api";
import type { InvitePlatformAdminPayload, PlatformAdmin, PlatformAdminListParams } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const ADMINS_KEY = ["platform", "admins"] as const;

export function usePlatformAdminList(params: PageParams & PlatformAdminListParams) {
  return useQuery({
    queryKey: [...ADMINS_KEY, "list", params],
    queryFn: () => fetchPlatformAdmins(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useInvitePlatformAdmin() {
  const queryClient = useQueryClient();
  return useMutation<PlatformAdmin, ApiError, InvitePlatformAdminPayload>({
    mutationFn: invitePlatformAdmin,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMINS_KEY }),
  });
}

export function useDisablePlatformAdmin() {
  const queryClient = useQueryClient();
  return useMutation<PlatformAdmin, ApiError, string>({
    mutationFn: disablePlatformAdmin,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMINS_KEY }),
  });
}

export function useDeletePlatformAdmin() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deletePlatformAdmin,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMINS_KEY }),
  });
}

export function useEnablePlatformAdmin() {
  const queryClient = useQueryClient();
  return useMutation<PlatformAdmin, ApiError, string>({
    mutationFn: enablePlatformAdmin,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMINS_KEY }),
  });
}

export function usePlatformStats() {
  return useQuery({
    queryKey: ["platform", "stats"],
    queryFn: fetchPlatformStats,
  });
}
