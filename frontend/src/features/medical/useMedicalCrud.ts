import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  createProfile,
  createVisit,
  deleteProfile,
  deleteVisit,
  fetchMyMedical,
  fetchProfiles,
  fetchVisits,
  getProfile,
  getVisit,
  updateProfile,
  updateVisit,
} from "./api";
import type {
  MedicalProfile,
  MedicalProfileListParams,
  MedicalProfilePayload,
  MedicalVisit,
  MedicalVisitListParams,
  MedicalVisitPayload,
  MyMedical,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const PROFILES_KEY = ["medical", "profiles"] as const;
const VISITS_KEY = ["medical", "visits"] as const;

export function useProfileList(params: PageParams & MedicalProfileListParams) {
  return useQuery({
    queryKey: [...PROFILES_KEY, "list", params],
    queryFn: () => fetchProfiles(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useProfile(id: string | undefined) {
  return useQuery<MedicalProfile, ApiError>({
    queryKey: [...PROFILES_KEY, "detail", id],
    queryFn: () => getProfile(id as string),
    enabled: !!id,
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation<MedicalProfile, ApiError, MedicalProfilePayload>({
    mutationFn: createProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROFILES_KEY }),
  });
}

export function useUpdateProfile(id: string) {
  const queryClient = useQueryClient();
  return useMutation<MedicalProfile, ApiError, MedicalProfilePayload>({
    mutationFn: (values) => updateProfile(id, values),
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
      queryClient.setQueryData([...PROFILES_KEY, "detail", id], profile);
    },
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROFILES_KEY }),
  });
}

export function useVisitList(params: PageParams & MedicalVisitListParams) {
  return useQuery({
    queryKey: [...VISITS_KEY, "list", params],
    queryFn: () => fetchVisits(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useVisit(id: string | undefined) {
  return useQuery<MedicalVisit, ApiError>({
    queryKey: [...VISITS_KEY, "detail", id],
    queryFn: () => getVisit(id as string),
    enabled: !!id,
  });
}

export function useCreateVisit() {
  const queryClient = useQueryClient();
  return useMutation<MedicalVisit, ApiError, MedicalVisitPayload>({
    mutationFn: createVisit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VISITS_KEY }),
  });
}

export function useUpdateVisit(id: string) {
  const queryClient = useQueryClient();
  return useMutation<MedicalVisit, ApiError, MedicalVisitPayload>({
    mutationFn: (values) => updateVisit(id, values),
    onSuccess: (visit) => {
      queryClient.invalidateQueries({ queryKey: VISITS_KEY });
      queryClient.setQueryData([...VISITS_KEY, "detail", id], visit);
    },
  });
}

export function useDeleteVisit() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteVisit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VISITS_KEY }),
  });
}

export function useMyMedical() {
  return useQuery<MyMedical, ApiError>({
    queryKey: ["medical", "my-medical"],
    queryFn: fetchMyMedical,
  });
}
