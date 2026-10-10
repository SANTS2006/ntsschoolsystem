import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  Permission,
  PermissionListParams,
  PermissionPayload,
  Role,
  RoleListParams,
  RoleLookup,
  RolePayload,
  RolePermissionRow,
} from "./types";

// A generous page_size — schools have a handful of seeded roles, so one request is enough
// to populate a dropdown; no pagination UI needed here.
const LOOKUP_PAGE_SIZE = { page_size: 100 };

export async function listRoles(): Promise<RoleLookup[]> {
  const { data } = await apiClient.get<PaginatedResponse<RoleLookup>>("/roles/", {
    params: LOOKUP_PAGE_SIZE,
  });
  return data.results;
}

interface PageParams {
  page?: number;
  page_size?: number;
  search?: string;
}

export async function fetchRoles(params: PageParams & RoleListParams): Promise<PaginatedResponse<Role>> {
  const { data } = await apiClient.get<PaginatedResponse<Role>>("/roles/", { params });
  return data;
}

export async function getRole(id: string): Promise<Role> {
  const { data } = await apiClient.get<Role>(`/roles/${id}/`);
  return data;
}

export async function createRole(values: RolePayload): Promise<Role> {
  const { data } = await apiClient.post<Role>("/roles/", values);
  return data;
}

export async function updateRole(id: string, values: RolePayload): Promise<Role> {
  const { data } = await apiClient.patch<Role>(`/roles/${id}/`, values);
  return data;
}

export async function deleteRole(id: string): Promise<void> {
  await apiClient.delete(`/roles/${id}/`);
}

export async function fetchRolePermissions(id: string): Promise<RolePermissionRow[]> {
  const { data } = await apiClient.get<{ permissions: RolePermissionRow[] }>(`/roles/${id}/permissions/`);
  return data.permissions;
}

export async function setRolePermissions(id: string, permissionIds: string[]): Promise<Role> {
  const { data } = await apiClient.post<{ role: Role }>(`/roles/${id}/set-permissions/`, {
    permission_ids: permissionIds,
  });
  return data.role;
}

export async function fetchPermissions(
  params: PageParams & PermissionListParams,
): Promise<PaginatedResponse<Permission>> {
  const { data } = await apiClient.get<PaginatedResponse<Permission>>("/roles/permissions/", { params });
  return data;
}

export async function createPermission(values: PermissionPayload): Promise<Permission> {
  const { data } = await apiClient.post<Permission>("/roles/permissions/", values);
  return data;
}

export async function updatePermission(id: string, values: PermissionPayload): Promise<Permission> {
  const { data } = await apiClient.patch<Permission>(`/roles/permissions/${id}/`, values);
  return data;
}

export async function deletePermission(id: string): Promise<void> {
  await apiClient.delete(`/roles/permissions/${id}/`);
}
