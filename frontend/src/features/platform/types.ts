import type { SchoolStatus } from "@/features/schools/types";

/** Platform admins are plain `User` rows filtered by `user_type="platform_admin"` — there is no
 * separate model. This is a fixed, fully read-only shape (the list/invite/disable/enable actions
 * all return exactly this). */
export interface PlatformAdmin {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface PlatformAdminListParams {
  search?: string;
}

export interface InvitePlatformAdminPayload {
  email: string;
  first_name: string;
  last_name: string;
}

/** `schools_by_status` is always fully populated with all three statuses (defaulted to 0), never
 * partial — the backend guarantees this via a dict comprehension over every `School.Status`. */
export interface PlatformStats {
  schools_total: number;
  schools_by_status: Record<SchoolStatus, number>;
  school_users_total: number;
  platform_admins_total: number;
}
