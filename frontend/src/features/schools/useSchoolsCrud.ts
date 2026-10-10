import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  activateSchool,
  createSchool,
  deleteSchool,
  fetchMySchool,
  fetchSchoolBranding,
  fetchSchools,
  getSchool,
  searchSchools,
  suspendSchool,
  updateMySchool,
  updateSchool,
} from "./api";
import type {
  School,
  SchoolBranding,
  SchoolCreatePayload,
  SchoolListParams,
  SchoolSelfUpdatePayload,
  SchoolUpdatePayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const SCHOOLS_KEY = ["platform", "schools"] as const;

export function useSchoolList(params: PageParams & SchoolListParams) {
  return useQuery({
    queryKey: [...SCHOOLS_KEY, "list", params],
    queryFn: () => fetchSchools(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useSchool(id: string | undefined) {
  return useQuery<School, ApiError>({
    queryKey: [...SCHOOLS_KEY, "detail", id],
    queryFn: () => getSchool(id as string),
    enabled: !!id,
  });
}

export function useSchoolBranding(slug: string | undefined) {
  return useQuery<SchoolBranding, ApiError>({
    queryKey: [...SCHOOLS_KEY, "branding", slug],
    queryFn: () => fetchSchoolBranding(slug as string),
    enabled: !!slug,
    retry: false,
  });
}

export function useSchoolSearch(query: string) {
  return useQuery<SchoolBranding[], ApiError>({
    queryKey: [...SCHOOLS_KEY, "search", query],
    queryFn: () => searchSchools(query),
    enabled: query.trim().length > 0,
  });
}

export function useCreateSchool() {
  const queryClient = useQueryClient();
  return useMutation<School, ApiError, SchoolCreatePayload>({
    mutationFn: createSchool,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCHOOLS_KEY }),
  });
}

export function useUpdateSchool(id: string) {
  const queryClient = useQueryClient();
  return useMutation<School, ApiError, SchoolUpdatePayload>({
    mutationFn: (values) => updateSchool(id, values),
    onSuccess: (school) => {
      queryClient.invalidateQueries({ queryKey: SCHOOLS_KEY });
      queryClient.setQueryData([...SCHOOLS_KEY, "detail", id], school);
    },
  });
}

function invalidateSchool(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: SCHOOLS_KEY });
  queryClient.invalidateQueries({ queryKey: [...SCHOOLS_KEY, "detail", id] });
}

export function useActivateSchool() {
  const queryClient = useQueryClient();
  return useMutation<School, ApiError, string>({
    mutationFn: activateSchool,
    onSuccess: (_data, id) => invalidateSchool(queryClient, id),
  });
}

export function useSuspendSchool(id: string) {
  const queryClient = useQueryClient();
  return useMutation<School, ApiError, string>({
    mutationFn: (reason) => suspendSchool(id, reason),
    onSuccess: () => invalidateSchool(queryClient, id),
  });
}

const MY_SCHOOL_KEY = ["schools", "me"] as const;

export function useMySchool() {
  return useQuery<School, ApiError>({
    queryKey: MY_SCHOOL_KEY,
    queryFn: fetchMySchool,
  });
}

export function useUpdateMySchool() {
  const queryClient = useQueryClient();
  return useMutation<School, ApiError, SchoolSelfUpdatePayload>({
    mutationFn: updateMySchool,
    onSuccess: (school) => queryClient.setQueryData(MY_SCHOOL_KEY, school),
  });
}

export function useDeleteSchool(id: string) {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (confirm) => deleteSchool(id, confirm),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: [...SCHOOLS_KEY, "detail", id] });
      queryClient.invalidateQueries({ queryKey: SCHOOLS_KEY });
    },
  });
}
