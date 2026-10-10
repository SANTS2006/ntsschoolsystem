import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { createIncident, deleteIncident, fetchIncidents, fetchMyDiscipline, getIncident, updateIncident } from "./api";
import type { DisciplineIncident, DisciplineIncidentListParams, DisciplineIncidentPayload } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const INCIDENTS_KEY = ["discipline", "incidents"] as const;

export function useIncidentList(params: PageParams & DisciplineIncidentListParams) {
  return useQuery({
    queryKey: [...INCIDENTS_KEY, "list", params],
    queryFn: () => fetchIncidents(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useIncident(id: string | undefined) {
  return useQuery<DisciplineIncident, ApiError>({
    queryKey: [...INCIDENTS_KEY, "detail", id],
    queryFn: () => getIncident(id as string),
    enabled: !!id,
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation<DisciplineIncident, ApiError, DisciplineIncidentPayload>({
    mutationFn: createIncident,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INCIDENTS_KEY }),
  });
}

export function useUpdateIncident(id: string) {
  const queryClient = useQueryClient();
  return useMutation<DisciplineIncident, ApiError, DisciplineIncidentPayload>({
    mutationFn: (values) => updateIncident(id, values),
    onSuccess: (incident) => {
      queryClient.invalidateQueries({ queryKey: INCIDENTS_KEY });
      queryClient.setQueryData([...INCIDENTS_KEY, "detail", id], incident);
    },
  });
}

export function useDeleteIncident() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteIncident,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INCIDENTS_KEY }),
  });
}

export function useMyDiscipline() {
  return useQuery<DisciplineIncident[], ApiError>({
    queryKey: ["discipline", "my-discipline"],
    queryFn: fetchMyDiscipline,
  });
}
