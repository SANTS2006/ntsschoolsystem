import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  createPermission,
  createRole,
  deletePermission,
  deleteRole,
  fetchPermissions,
  fetchRolePermissions,
  fetchRoles,
  getRole,
  setRolePermissions,
  updatePermission,
  updateRole,
} from "./api";
import type {
  Permission,
  PermissionListParams,
  PermissionPayload,
  Role,
  RoleListParams,
  RolePayload,
  RolePermissionRow,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
  search?: string;
}

const ROLES_KEY = ["authorization", "roles", "records"] as const;
const PERMISSIONS_KEY = ["authorization", "permissions", "records"] as const;

export function useRoleList(params: PageParams & RoleListParams) {
  return useQuery({
    queryKey: [...ROLES_KEY, "list", params],
    queryFn: () => fetchRoles(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useRole(id: string | undefined) {
  return useQuery<Role, ApiError>({
    queryKey: [...ROLES_KEY, "detail", id],
    queryFn: () => getRole(id as string),
    enabled: !!id,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation<Role, ApiError, RolePayload>({
    mutationFn: createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
      queryClient.invalidateQueries({ queryKey: ["authorization", "roles"] });
    },
  });
}

export function useUpdateRole(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Role, ApiError, RolePayload>({
    mutationFn: (values) => updateRole(id, values),
    onSuccess: (role) => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
      queryClient.setQueryData([...ROLES_KEY, "detail", id], role);
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
      queryClient.invalidateQueries({ queryKey: ["authorization", "roles"] });
    },
  });
}

export function useRolePermissions(id: string | undefined) {
  return useQuery<RolePermissionRow[], ApiError>({
    queryKey: [...ROLES_KEY, id, "permissions"],
    queryFn: () => fetchRolePermissions(id as string),
    enabled: !!id,
  });
}

export function useSetRolePermissions(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Role, ApiError, string[]>({
    mutationFn: (permissionIds) => setRolePermissions(id, permissionIds),
    onSuccess: (role) => {
      queryClient.invalidateQueries({ queryKey: [...ROLES_KEY, id, "permissions"] });
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
      queryClient.setQueryData([...ROLES_KEY, "detail", id], role);
    },
  });
}

export function usePermissionList(params: PageParams & PermissionListParams) {
  return useQuery({
    queryKey: [...PERMISSIONS_KEY, "list", params],
    queryFn: () => fetchPermissions(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useCreatePermission() {
  const queryClient = useQueryClient();
  return useMutation<Permission, ApiError, PermissionPayload>({
    mutationFn: createPermission,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY }),
  });
}

export function useUpdatePermission(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Permission, ApiError, PermissionPayload>({
    mutationFn: (values) => updatePermission(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY }),
  });
}

export function useDeletePermission() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deletePermission,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY }),
  });
}
