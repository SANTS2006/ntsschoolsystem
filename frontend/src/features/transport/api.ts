import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  Route,
  RouteListParams,
  RoutePayload,
  Stop,
  StopListParams,
  StopPayload,
  StudentTransportAssignment,
  StudentTransportAssignmentListParams,
  StudentTransportAssignmentPayload,
  MyTransportAssignment,
  Vehicle,
  VehicleListParams,
  VehicleMaintenance,
  VehicleMaintenanceListParams,
  VehicleMaintenancePayload,
  VehiclePayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchVehicles(params: PageParams & VehicleListParams): Promise<PaginatedResponse<Vehicle>> {
  const { data } = await apiClient.get<PaginatedResponse<Vehicle>>("/transport/vehicles/", { params });
  return data;
}

export async function getVehicle(id: string): Promise<Vehicle> {
  const { data } = await apiClient.get<Vehicle>(`/transport/vehicles/${id}/`);
  return data;
}

export async function createVehicle(values: VehiclePayload): Promise<Vehicle> {
  const { data } = await apiClient.post<Vehicle>("/transport/vehicles/", values);
  return data;
}

export async function updateVehicle(id: string, values: VehiclePayload): Promise<Vehicle> {
  const { data } = await apiClient.patch<Vehicle>(`/transport/vehicles/${id}/`, values);
  return data;
}

export async function deleteVehicle(id: string): Promise<void> {
  await apiClient.delete(`/transport/vehicles/${id}/`);
}

export async function fetchRoutes(params: PageParams & RouteListParams): Promise<PaginatedResponse<Route>> {
  const { data } = await apiClient.get<PaginatedResponse<Route>>("/transport/routes/", { params });
  return data;
}

export async function getRoute(id: string): Promise<Route> {
  const { data } = await apiClient.get<Route>(`/transport/routes/${id}/`);
  return data;
}

export async function createRoute(values: RoutePayload): Promise<Route> {
  const { data } = await apiClient.post<Route>("/transport/routes/", values);
  return data;
}

export async function updateRoute(id: string, values: RoutePayload): Promise<Route> {
  const { data } = await apiClient.patch<Route>(`/transport/routes/${id}/`, values);
  return data;
}

export async function deleteRoute(id: string): Promise<void> {
  await apiClient.delete(`/transport/routes/${id}/`);
}

export async function fetchStops(params: PageParams & StopListParams): Promise<PaginatedResponse<Stop>> {
  const { data } = await apiClient.get<PaginatedResponse<Stop>>("/transport/stops/", { params });
  return data;
}

export async function getStop(id: string): Promise<Stop> {
  const { data } = await apiClient.get<Stop>(`/transport/stops/${id}/`);
  return data;
}

export async function createStop(values: StopPayload): Promise<Stop> {
  const { data } = await apiClient.post<Stop>("/transport/stops/", values);
  return data;
}

export async function updateStop(id: string, values: StopPayload): Promise<Stop> {
  const { data } = await apiClient.patch<Stop>(`/transport/stops/${id}/`, values);
  return data;
}

export async function deleteStop(id: string): Promise<void> {
  await apiClient.delete(`/transport/stops/${id}/`);
}

export async function fetchMaintenanceRecords(
  params: PageParams & VehicleMaintenanceListParams,
): Promise<PaginatedResponse<VehicleMaintenance>> {
  const { data } = await apiClient.get<PaginatedResponse<VehicleMaintenance>>("/transport/maintenance/", { params });
  return data;
}

export async function getMaintenanceRecord(id: string): Promise<VehicleMaintenance> {
  const { data } = await apiClient.get<VehicleMaintenance>(`/transport/maintenance/${id}/`);
  return data;
}

export async function createMaintenanceRecord(values: VehicleMaintenancePayload): Promise<VehicleMaintenance> {
  const { data } = await apiClient.post<VehicleMaintenance>("/transport/maintenance/", values);
  return data;
}

export async function updateMaintenanceRecord(
  id: string,
  values: VehicleMaintenancePayload,
): Promise<VehicleMaintenance> {
  const { data } = await apiClient.patch<VehicleMaintenance>(`/transport/maintenance/${id}/`, values);
  return data;
}

export async function deleteMaintenanceRecord(id: string): Promise<void> {
  await apiClient.delete(`/transport/maintenance/${id}/`);
}

export async function fetchAssignments(
  params: PageParams & StudentTransportAssignmentListParams,
): Promise<PaginatedResponse<StudentTransportAssignment>> {
  const { data } = await apiClient.get<PaginatedResponse<StudentTransportAssignment>>("/transport/assignments/", {
    params,
  });
  return data;
}

export async function createAssignment(
  values: StudentTransportAssignmentPayload,
): Promise<StudentTransportAssignment> {
  const { data } = await apiClient.post<StudentTransportAssignment>("/transport/assignments/", values);
  return data;
}

export async function deleteAssignment(id: string): Promise<void> {
  await apiClient.delete(`/transport/assignments/${id}/`);
}

export async function fetchMyTransport(): Promise<MyTransportAssignment | null> {
  const { data } = await apiClient.get<{ assignment: MyTransportAssignment | null }>("/transport/my-transport/");
  return data.assignment;
}
