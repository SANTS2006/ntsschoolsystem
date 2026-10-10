import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { createGuardian, deleteGuardian, fetchGuardians, getGuardian, resetGuardianPassword, updateGuardian } from "./api";
import type { Guardian, GuardianListParams, GuardianPayload } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const GUARDIANS_KEY = ["parents", "guardians"] as const;

export function useGuardianList(params: PageParams & GuardianListParams) {
  return useQuery({
    queryKey: [...GUARDIANS_KEY, "list", params],
    queryFn: () => fetchGuardians(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useGuardian(id: string | undefined) {
  return useQuery<Guardian, ApiError>({
    queryKey: [...GUARDIANS_KEY, "detail", id],
    queryFn: () => getGuardian(id as string),
    enabled: !!id,
  });
}

export function useCreateGuardian() {
  const queryClient = useQueryClient();
  return useMutation<Guardian, ApiError, GuardianPayload>({
    mutationFn: createGuardian,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GUARDIANS_KEY }),
  });
}

export function useUpdateGuardian(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Guardian, ApiError, GuardianPayload>({
    mutationFn: (values) => updateGuardian(id, values),
    onSuccess: (guardian) => {
      queryClient.invalidateQueries({ queryKey: GUARDIANS_KEY });
      queryClient.setQueryData([...GUARDIANS_KEY, "detail", id], guardian);
    },
  });
}

export function useDeleteGuardian() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteGuardian,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GUARDIANS_KEY }),
  });
}

export function useResetGuardianPassword() {
  return useMutation<string, ApiError, string>({
    mutationFn: resetGuardianPassword,
  });
}
