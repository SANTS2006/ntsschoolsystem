import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

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

export async function fetchHostels(params: PageParams & HostelListParams): Promise<PaginatedResponse<Hostel>> {
  const { data } = await apiClient.get<PaginatedResponse<Hostel>>("/hostel/hostels/", { params });
  return data;
}

export async function getHostel(id: string): Promise<Hostel> {
  const { data } = await apiClient.get<Hostel>(`/hostel/hostels/${id}/`);
  return data;
}

export async function createHostel(values: HostelPayload): Promise<Hostel> {
  const { data } = await apiClient.post<Hostel>("/hostel/hostels/", values);
  return data;
}

export async function updateHostel(id: string, values: HostelPayload): Promise<Hostel> {
  const { data } = await apiClient.patch<Hostel>(`/hostel/hostels/${id}/`, values);
  return data;
}

export async function deleteHostel(id: string): Promise<void> {
  await apiClient.delete(`/hostel/hostels/${id}/`);
}

export async function fetchRooms(params: PageParams & RoomListParams): Promise<PaginatedResponse<Room>> {
  const { data } = await apiClient.get<PaginatedResponse<Room>>("/hostel/rooms/", { params });
  return data;
}

export async function getRoom(id: string): Promise<Room> {
  const { data } = await apiClient.get<Room>(`/hostel/rooms/${id}/`);
  return data;
}

export async function createRoom(values: RoomPayload): Promise<Room> {
  const { data } = await apiClient.post<Room>("/hostel/rooms/", values);
  return data;
}

export async function updateRoom(id: string, values: RoomPayload): Promise<Room> {
  const { data } = await apiClient.patch<Room>(`/hostel/rooms/${id}/`, values);
  return data;
}

export async function deleteRoom(id: string): Promise<void> {
  await apiClient.delete(`/hostel/rooms/${id}/`);
}

export async function fetchBeds(params: PageParams & BedListParams): Promise<PaginatedResponse<Bed>> {
  const { data } = await apiClient.get<PaginatedResponse<Bed>>("/hostel/beds/", { params });
  return data;
}

export async function getBed(id: string): Promise<Bed> {
  const { data } = await apiClient.get<Bed>(`/hostel/beds/${id}/`);
  return data;
}

export async function createBed(values: BedPayload): Promise<Bed> {
  const { data } = await apiClient.post<Bed>("/hostel/beds/", values);
  return data;
}

export async function updateBed(id: string, values: BedPayload): Promise<Bed> {
  const { data } = await apiClient.patch<Bed>(`/hostel/beds/${id}/`, values);
  return data;
}

export async function deleteBed(id: string): Promise<void> {
  await apiClient.delete(`/hostel/beds/${id}/`);
}

export async function fetchAllocations(
  params: PageParams & HostelAllocationListParams,
): Promise<PaginatedResponse<HostelAllocation>> {
  const { data } = await apiClient.get<PaginatedResponse<HostelAllocation>>("/hostel/allocations/", { params });
  return data;
}

/** `create()` is a custom action (calls `services.allocate_bed()`), not a plain
 * `ModelViewSet.create()` — the response is enveloped as `{allocation: {...}}`, verified against
 * `apps/hostel/views.py` directly (same shape as Library's loan checkout). */
export async function allocateBed(values: AllocationPayload): Promise<HostelAllocation> {
  const { data } = await apiClient.post<{ allocation: HostelAllocation }>("/hostel/allocations/", values);
  return data.allocation;
}

export async function checkOutAllocation(id: string): Promise<HostelAllocation> {
  const { data } = await apiClient.post<{ allocation: HostelAllocation }>(`/hostel/allocations/${id}/check-out/`);
  return data.allocation;
}
