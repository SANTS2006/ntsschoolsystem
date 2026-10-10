export type GenderRestriction = "male" | "female" | "mixed";
export type AllocationStatus = "active" | "checked_out";

export interface Hostel {
  id: string;
  name: string;
  gender_restriction: GenderRestriction;
  warden: string | null;
  warden_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface HostelPayload {
  name: string;
  gender_restriction?: GenderRestriction;
  warden?: string;
}

export interface HostelListParams {
  search?: string;
  page?: number;
  page_size?: number;
}

export interface Room {
  id: string;
  hostel: string;
  hostel_name: string;
  room_number: string;
  capacity: number;
  bed_count: number;
}

export interface RoomPayload {
  hostel: string;
  room_number: string;
  capacity?: number;
}

export interface RoomListParams {
  hostel?: string;
  page?: number;
  page_size?: number;
}

export interface Bed {
  id: string;
  room: string;
  room_number: string;
  hostel_name: string;
  bed_number: string;
  is_occupied: boolean;
}

export interface BedPayload {
  room: string;
  bed_number: string;
}

export interface BedListParams {
  room?: string;
  page?: number;
  page_size?: number;
}

/** `check_out_date`/`status` are server-computed — check-out is a dedicated action, never a
 * client-supplied field. `check_in_date` is optional on create; the backend defaults to today
 * when omitted (`services.allocate_bed()`). */
export interface HostelAllocation {
  id: string;
  student: string;
  student_name: string;
  bed: string;
  bed_label: string | null;
  check_in_date: string;
  check_out_date: string | null;
  status: AllocationStatus;
  created_at: string;
  updated_at: string;
}

export interface AllocationPayload {
  student: string;
  bed: string;
  check_in_date?: string;
}

export interface HostelAllocationListParams {
  bed?: string;
  student?: string;
  status?: AllocationStatus;
  page?: number;
  page_size?: number;
}
