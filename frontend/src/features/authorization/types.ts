/** Enough of a Role to populate a dropdown (e.g. assigning a role while inviting a new
 * staff member) — not the full model with its permission list. */
export interface RoleLookup {
  id: string;
  name: string;
  slug: string;
}

export interface Role {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_system: boolean;
  is_active: boolean;
  permission_codes: string[];
  /** How many people currently hold this role. */
  user_count: number;
}

export interface RolePayload {
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface RoleListParams {
  page?: number;
  page_size?: number;
  search?: string;
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string;
}

export interface PermissionPayload {
  code: string;
  name: string;
  module: string;
  description?: string;
}

export interface PermissionListParams {
  page?: number;
  page_size?: number;
  search?: string;
}

/** One row of GET /roles/{id}/permissions/ — the whole catalog, each flagged with whether the
 * role currently grants it. */
export interface RolePermissionRow extends Permission {
  granted: boolean;
}
