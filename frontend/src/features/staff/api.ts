import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type { Staff, StaffListParams, StaffLookup, StaffPayload } from "./types";

// A generous page_size — schools have a modest number of staff, so one request is enough
// to populate a dropdown; no pagination UI needed here.
const LOOKUP_PAGE_SIZE = { page_size: 100 };

export async function listStaff(role?: string): Promise<StaffLookup[]> {
  const { data } = await apiClient.get<PaginatedResponse<StaffLookup>>("/staff/", {
    params: { ...LOOKUP_PAGE_SIZE, employment_status: "active", role },
  });
  return data.results;
}

export async function fetchStaff(params: StaffListParams): Promise<PaginatedResponse<Staff>> {
  const { data } = await apiClient.get<PaginatedResponse<Staff>>("/staff/", { params });
  return data;
}

export async function getStaff(id: string): Promise<Staff> {
  const { data } = await apiClient.get<Staff>(`/staff/${id}/`);
  return data;
}

/** A plain JSON body can't carry a File — switch to multipart/form-data only when a new photo
 * was actually picked. The frontend-facing `photo` key is renamed to `photo_upload` on the wire —
 * the backend's `photo` field is read-only (mirrors `user.photo`), writes go through a distinct
 * write-only field since `Staff.photo` is a Python property, not a real assignable model field. */
function toRequestBody(values: StaffPayload): StaffPayload | FormData {
  if (!values.photo) {
    return values;
  }
  const { photo, ...rest } = values;
  const formData = new FormData();
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      formData.append(key, value);
    }
  }
  formData.append("photo_upload", photo);
  return formData;
}

export async function createStaff(values: StaffPayload): Promise<Staff> {
  const { data } = await apiClient.post<Staff>("/staff/", toRequestBody(values));
  return data;
}

export async function updateStaff(id: string, values: StaffPayload): Promise<Staff> {
  const { data } = await apiClient.patch<Staff>(`/staff/${id}/`, toRequestBody(values));
  return data;
}

/** A soft "terminate," not a real delete — the backend's `DELETE` sets
 * `employment_status=terminated` and keeps the row (see `apps.staff.views.StaffViewSet`). */
export async function terminateStaff(id: string): Promise<void> {
  await apiClient.delete(`/staff/${id}/`);
}

export async function reactivateStaff(id: string): Promise<Staff> {
  const { data } = await apiClient.post<{ staff: Staff }>(`/staff/${id}/enable/`);
  return data.staff;
}

/** A real, irreversible delete — only allowed once already terminated (see
 * apps.staff.views.StaffViewSet.delete_permanently). Removes the account and everything else
 * this staff member owns (assignments, attendance, lessons, salary records, ...). */
export async function deleteStaffPermanently(id: string): Promise<void> {
  await apiClient.post(`/staff/${id}/delete-permanently/`);
}

/** Resets the linked account's password back to the school's default (initials + creation
 * year) — returns the resulting password so the admin can relay it to the staff member. */
export async function resetStaffPassword(id: string): Promise<string> {
  const { data } = await apiClient.post<{ default_password: string }>(`/staff/${id}/reset-password/`);
  return data.default_password;
}

/** Replaces this staff member's full set of held roles with `roleIds` — a multi-select "manage
 * roles" call, not incremental add/remove (see apps.staff.views.StaffViewSet.roles). */
export async function setStaffRoles(id: string, roleIds: string[]): Promise<Staff> {
  const { data } = await apiClient.post<{ staff: Staff }>(`/staff/${id}/roles/`, { role_ids: roleIds });
  return data.staff;
}
