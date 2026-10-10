import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  bulkCreateEntries,
  copySection,
  createEntry,
  createPeriod,
  createRoom,
  deleteEntry,
  deletePeriod,
  deleteRoom,
  fetchEntries,
  fetchMyTimetable,
  fetchPeriods,
  fetchRooms,
  getEntry,
  getPeriod,
  getRoom,
  updateEntry,
  updatePeriod,
  updateRoom,
} from "./api";
import type {
  CopySectionPayload,
  CopySectionResult,
  Period,
  PeriodPayload,
  Room,
  RoomPayload,
  TimetableEntry,
  TimetableEntryDraft,
  TimetableEntryListParams,
  TimetableEntryPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
}

const ROOMS_KEY = ["timetable", "rooms"] as const;
const PERIODS_KEY = ["timetable", "periods"] as const;
const ENTRIES_KEY = ["timetable", "entries"] as const;

export function useRoomList(params: PageParams) {
  return useQuery({
    queryKey: [...ROOMS_KEY, "list", params],
    queryFn: () => fetchRooms(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useRoom(id: string | undefined) {
  return useQuery<Room, ApiError>({
    queryKey: [...ROOMS_KEY, "detail", id],
    queryFn: () => getRoom(id as string),
    enabled: !!id,
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();
  return useMutation<Room, ApiError, RoomPayload>({
    mutationFn: createRoom,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timetable"] }),
  });
}

export function useUpdateRoom(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Room, ApiError, RoomPayload>({
    mutationFn: (values) => updateRoom(id, values),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: ["timetable"] });
      queryClient.setQueryData([...ROOMS_KEY, "detail", id], room);
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteRoom,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timetable"] }),
  });
}

export function usePeriodList(params: PageParams) {
  return useQuery({
    queryKey: [...PERIODS_KEY, "list", params],
    queryFn: () => fetchPeriods(params),
    placeholderData: (previousData) => previousData,
  });
}

export function usePeriod(id: string | undefined) {
  return useQuery<Period, ApiError>({
    queryKey: [...PERIODS_KEY, "detail", id],
    queryFn: () => getPeriod(id as string),
    enabled: !!id,
  });
}

export function useCreatePeriod() {
  const queryClient = useQueryClient();
  return useMutation<Period, ApiError, PeriodPayload>({
    mutationFn: createPeriod,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timetable"] }),
  });
}

export function useUpdatePeriod(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Period, ApiError, PeriodPayload>({
    mutationFn: (values) => updatePeriod(id, values),
    onSuccess: (period) => {
      queryClient.invalidateQueries({ queryKey: ["timetable"] });
      queryClient.setQueryData([...PERIODS_KEY, "detail", id], period);
    },
  });
}

export function useDeletePeriod() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deletePeriod,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timetable"] }),
  });
}

export function useEntryList(params: PageParams & TimetableEntryListParams) {
  return useQuery({
    queryKey: [...ENTRIES_KEY, "list", params],
    queryFn: () => fetchEntries(params),
    enabled: !!params.section,
    placeholderData: (previousData) => previousData,
  });
}

export function useEntry(id: string | undefined) {
  return useQuery<TimetableEntry, ApiError>({
    queryKey: [...ENTRIES_KEY, "detail", id],
    queryFn: () => getEntry(id as string),
    enabled: !!id,
  });
}

export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation<TimetableEntry, ApiError, TimetableEntryPayload>({
    mutationFn: createEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timetable"] }),
  });
}

export function useUpdateEntry(id: string) {
  const queryClient = useQueryClient();
  return useMutation<TimetableEntry, ApiError, TimetableEntryPayload>({
    mutationFn: (values) => updateEntry(id, values),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ["timetable"] });
      queryClient.setQueryData([...ENTRIES_KEY, "detail", id], entry);
    },
  });
}

export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timetable"] }),
  });
}

export function useMyTimetable() {
  return useQuery<TimetableEntry[], ApiError>({
    queryKey: ["timetable", "my-timetable"],
    queryFn: fetchMyTimetable,
  });
}

export function useBulkCreateEntries() {
  const queryClient = useQueryClient();
  return useMutation<TimetableEntry[], ApiError, { section: string; entries: TimetableEntryDraft[] }>({
    mutationFn: ({ section, entries }) => bulkCreateEntries(section, entries),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timetable"] }),
  });
}

export function useCopySection() {
  const queryClient = useQueryClient();
  return useMutation<CopySectionResult, ApiError, CopySectionPayload>({
    mutationFn: copySection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timetable"] }),
  });
}
