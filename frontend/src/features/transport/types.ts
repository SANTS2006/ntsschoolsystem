export type VehicleStatus = "active" | "maintenance" | "retired";

export interface Vehicle {
  id: string;
  registration_number: string;
  make_model: string;
  capacity: number;
  driver: string | null;
  driver_name: string | null;
  status: VehicleStatus;
  created_at: string;
  updated_at: string;
}

export interface VehiclePayload {
  registration_number: string;
  make_model?: string;
  capacity?: number;
  driver?: string;
  status?: VehicleStatus;
}

export interface VehicleListParams {
  status?: VehicleStatus;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface Stop {
  id: string;
  route: string;
  name: string;
  order: number;
  pickup_time: string | null;
}

export interface StopPayload {
  route: string;
  name: string;
  order?: number;
  pickup_time?: string | null;
}

export interface StopListParams {
  route?: string;
  page?: number;
  page_size?: number;
}

export interface Route {
  id: string;
  name: string;
  description: string;
  vehicle: string | null;
  vehicle_registration: string | null;
  stops: Stop[];
  created_at: string;
  updated_at: string;
}

export interface RoutePayload {
  name: string;
  description?: string;
  vehicle?: string;
}

export interface RouteListParams {
  search?: string;
  page?: number;
  page_size?: number;
}

export interface VehicleMaintenance {
  id: string;
  vehicle: string;
  vehicle_registration: string;
  date: string;
  description: string;
  cost: string;
  next_service_date: string | null;
}

export interface VehicleMaintenancePayload {
  vehicle: string;
  date: string;
  description: string;
  cost?: string;
  next_service_date?: string | null;
}

export interface VehicleMaintenanceListParams {
  vehicle?: string;
  page?: number;
  page_size?: number;
}

export interface StudentTransportAssignment {
  id: string;
  student: string;
  student_name: string;
  route: string;
  route_name: string;
  stop: string;
  stop_name: string;
}

export interface StudentTransportAssignmentPayload {
  student: string;
  route: string;
  stop: string;
}

export interface StudentTransportAssignmentListParams {
  route?: string;
  stop?: string;
  page?: number;
  page_size?: number;
}

export interface MyTransportAssignment extends StudentTransportAssignment {
  vehicle_registration: string | null;
  pickup_time: string | null;
}
