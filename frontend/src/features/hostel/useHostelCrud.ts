import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  allocateBed,
  checkOutAllocation,
  createBed,
  createHostel,
  createRoom,
  deleteBed,
  deleteHostel,
  deleteRoom,
  fetchAllocations,
  fetchBeds,
  fetchHostels,
  fetchRooms,
  getBed,
  getHostel,
  getRoom,
  updateBed,
  updateHostel,
  updateRoom,
} from "./api";
import type {
  AllocationPayload,
  Bed,
  BedListParams,
  BedPayload,
  Hostel,
  HostelAllocation,
  HostelAllocationListParams,
  HostelListParams,
  HostelPayload,
  Room,
  RoomListParams,
  RoomPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const HOSTELS_KEY = ["hostel", "hostels"] as const;
const ROOMS_KEY = ["hostel", "rooms"] as const;
const BEDS_KEY = ["hostel", "beds"] as const;
const ALLOCATIONS_KEY = ["hostel", "allocations"] as const;

export function useHostelList(params: PageParams & HostelListParams) {
  return useQuery({
    queryKey: [...HOSTELS_KEY, "list", params],
    queryFn: () => fetchHostels(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useHostel(id: string | undefined) {
  return useQuery<Hostel, ApiError>({
    queryKey: [...HOSTELS_KEY, "detail", id],
    queryFn: () => getHostel(id as string),
    enabled: !!id,
  });
}

export function useCreateHostel() {
  const queryClient = useQueryClient();
  return useMutation<Hostel, ApiError, HostelPayload>({
    mutationFn: createHostel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HOSTELS_KEY }),
  });
}

export function useUpdateHostel(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Hostel, ApiError, HostelPayload>({
    mutationFn: (values) => updateHostel(id, values),
    onSuccess: (hostel) => {
      queryClient.invalidateQueries({ queryKey: HOSTELS_KEY });
      queryClient.setQueryData([...HOSTELS_KEY, "detail", id], hostel);
    },
  });
}

export function useDeleteHostel() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteHostel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HOSTELS_KEY }),
  });
}

export function useRoomList(params: PageParams & RoomListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...ROOMS_KEY, "list", params],
    queryFn: () => fetchRooms(params),
    enabled: options?.enabled,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROOMS_KEY }),
  });
}

export function useUpdateRoom(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Room, ApiError, RoomPayload>({
    mutationFn: (values) => updateRoom(id, values),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
      queryClient.setQueryData([...ROOMS_KEY, "detail", id], room);
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteRoom,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROOMS_KEY }),
  });
}

export function useBedList(params: PageParams & BedListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...BEDS_KEY, "list", params],
    queryFn: () => fetchBeds(params),
    enabled: options?.enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useBed(id: string | undefined) {
  return useQuery<Bed, ApiError>({
    queryKey: [...BEDS_KEY, "detail", id],
    queryFn: () => getBed(id as string),
    enabled: !!id,
  });
}

export function useCreateBed() {
  const queryClient = useQueryClient();
  return useMutation<Bed, ApiError, BedPayload>({
    mutationFn: createBed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BEDS_KEY });
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
    },
  });
}

export function useUpdateBed(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Bed, ApiError, BedPayload>({
    mutationFn: (values) => updateBed(id, values),
    onSuccess: (bed) => {
      queryClient.invalidateQueries({ queryKey: BEDS_KEY });
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
      queryClient.setQueryData([...BEDS_KEY, "detail", id], bed);
    },
  });
}

export function useDeleteBed() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteBed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BEDS_KEY });
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
    },
  });
}

export function useAllocationList(params: PageParams & HostelAllocationListParams) {
  return useQuery({
    queryKey: [...ALLOCATIONS_KEY, "list", params],
    queryFn: () => fetchAllocations(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useAllocateBed() {
  const queryClient = useQueryClient();
  return useMutation<HostelAllocation, ApiError, AllocationPayload>({
    mutationFn: allocateBed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ALLOCATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: BEDS_KEY });
    },
  });
}

export function useCheckOutAllocation() {
  const queryClient = useQueryClient();
  return useMutation<HostelAllocation, ApiError, string>({
    mutationFn: checkOutAllocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ALLOCATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: BEDS_KEY });
    },
  });
}
