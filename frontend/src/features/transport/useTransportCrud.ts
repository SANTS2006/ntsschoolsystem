import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  createAssignment,
  createMaintenanceRecord,
  createRoute,
  createStop,
  createVehicle,
  deleteAssignment,
  deleteMaintenanceRecord,
  deleteRoute,
  deleteStop,
  deleteVehicle,
  fetchAssignments,
  fetchMaintenanceRecords,
  fetchRoutes,
  fetchStops,
  fetchMyTransport,
  fetchVehicles,
  getMaintenanceRecord,
  getRoute,
  getStop,
  getVehicle,
  updateMaintenanceRecord,
  updateRoute,
  updateStop,
  updateVehicle,
} from "./api";
import type {
  MyTransportAssignment,
  Route,
  RouteListParams,
  RoutePayload,
  Stop,
  StopListParams,
  StopPayload,
  StudentTransportAssignment,
  StudentTransportAssignmentListParams,
  StudentTransportAssignmentPayload,
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

const VEHICLES_KEY = ["transport", "vehicles"] as const;
const ROUTES_KEY = ["transport", "routes"] as const;
const STOPS_KEY = ["transport", "stops"] as const;
const MAINTENANCE_KEY = ["transport", "maintenance"] as const;
const ASSIGNMENTS_KEY = ["transport", "assignments"] as const;

export function useVehicleList(params: PageParams & VehicleListParams) {
  return useQuery({
    queryKey: [...VEHICLES_KEY, "list", params],
    queryFn: () => fetchVehicles(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useVehicle(id: string | undefined) {
  return useQuery<Vehicle, ApiError>({
    queryKey: [...VEHICLES_KEY, "detail", id],
    queryFn: () => getVehicle(id as string),
    enabled: !!id,
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation<Vehicle, ApiError, VehiclePayload>({
    mutationFn: createVehicle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VEHICLES_KEY }),
  });
}

export function useUpdateVehicle(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Vehicle, ApiError, VehiclePayload>({
    mutationFn: (values) => updateVehicle(id, values),
    onSuccess: (vehicle) => {
      queryClient.invalidateQueries({ queryKey: VEHICLES_KEY });
      queryClient.setQueryData([...VEHICLES_KEY, "detail", id], vehicle);
    },
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteVehicle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VEHICLES_KEY }),
  });
}

export function useRouteList(params: PageParams & RouteListParams) {
  return useQuery({
    queryKey: [...ROUTES_KEY, "list", params],
    queryFn: () => fetchRoutes(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useRoute(id: string | undefined) {
  return useQuery<Route, ApiError>({
    queryKey: [...ROUTES_KEY, "detail", id],
    queryFn: () => getRoute(id as string),
    enabled: !!id,
  });
}

export function useCreateRoute() {
  const queryClient = useQueryClient();
  return useMutation<Route, ApiError, RoutePayload>({
    mutationFn: createRoute,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROUTES_KEY }),
  });
}

export function useUpdateRoute(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Route, ApiError, RoutePayload>({
    mutationFn: (values) => updateRoute(id, values),
    onSuccess: (route) => {
      queryClient.invalidateQueries({ queryKey: ROUTES_KEY });
      queryClient.setQueryData([...ROUTES_KEY, "detail", id], route);
    },
  });
}

export function useDeleteRoute() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteRoute,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROUTES_KEY }),
  });
}

export function useStopList(params: PageParams & StopListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...STOPS_KEY, "list", params],
    queryFn: () => fetchStops(params),
    enabled: options?.enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useStop(id: string | undefined) {
  return useQuery<Stop, ApiError>({
    queryKey: [...STOPS_KEY, "detail", id],
    queryFn: () => getStop(id as string),
    enabled: !!id,
  });
}

export function useCreateStop() {
  const queryClient = useQueryClient();
  return useMutation<Stop, ApiError, StopPayload>({
    mutationFn: createStop,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STOPS_KEY });
      queryClient.invalidateQueries({ queryKey: ROUTES_KEY });
    },
  });
}

export function useUpdateStop(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Stop, ApiError, StopPayload>({
    mutationFn: (values) => updateStop(id, values),
    onSuccess: (stop) => {
      queryClient.invalidateQueries({ queryKey: STOPS_KEY });
      queryClient.invalidateQueries({ queryKey: ROUTES_KEY });
      queryClient.setQueryData([...STOPS_KEY, "detail", id], stop);
    },
  });
}

export function useDeleteStop() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteStop,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STOPS_KEY });
      queryClient.invalidateQueries({ queryKey: ROUTES_KEY });
    },
  });
}

export function useMaintenanceList(params: PageParams & VehicleMaintenanceListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...MAINTENANCE_KEY, "list", params],
    queryFn: () => fetchMaintenanceRecords(params),
    enabled: options?.enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useMaintenanceRecord(id: string | undefined) {
  return useQuery<VehicleMaintenance, ApiError>({
    queryKey: [...MAINTENANCE_KEY, "detail", id],
    queryFn: () => getMaintenanceRecord(id as string),
    enabled: !!id,
  });
}

export function useCreateMaintenanceRecord() {
  const queryClient = useQueryClient();
  return useMutation<VehicleMaintenance, ApiError, VehicleMaintenancePayload>({
    mutationFn: createMaintenanceRecord,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MAINTENANCE_KEY }),
  });
}

export function useUpdateMaintenanceRecord(id: string) {
  const queryClient = useQueryClient();
  return useMutation<VehicleMaintenance, ApiError, VehicleMaintenancePayload>({
    mutationFn: (values) => updateMaintenanceRecord(id, values),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: MAINTENANCE_KEY });
      queryClient.setQueryData([...MAINTENANCE_KEY, "detail", id], record);
    },
  });
}

export function useDeleteMaintenanceRecord() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteMaintenanceRecord,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MAINTENANCE_KEY }),
  });
}

export function useAssignmentList(params: PageParams & StudentTransportAssignmentListParams) {
  return useQuery({
    queryKey: [...ASSIGNMENTS_KEY, "list", params],
    queryFn: () => fetchAssignments(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation<StudentTransportAssignment, ApiError, StudentTransportAssignmentPayload>({
    mutationFn: createAssignment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY }),
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteAssignment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY }),
  });
}

export function useMyTransport() {
  return useQuery<MyTransportAssignment | null, ApiError>({
    queryKey: ["transport", "my-transport"],
    queryFn: fetchMyTransport,
  });
}
