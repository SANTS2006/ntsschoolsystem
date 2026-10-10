export interface SchoolSummary {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  school_type: string;
  /** Top of the grade-point scale ("4.00" / "5.00") — tertiary institutions only. */
  grade_point_scale: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  slug: string;
  /** This role's own granted permission codes — distinct from CurrentUser.permissions (the
   * flat union across every role the user holds). Powers the role switcher's sidebar filtering
   * (useActiveRole) without touching what the backend actually authorizes, which always stays
   * the full union regardless of which role is "active" client-side. */
  permissions: string[];
}

export interface CurrentUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone_number: string;
  photo: string | null;
  user_type: string;
  is_platform_admin: boolean;
  is_email_verified: boolean;
  is_online: boolean;
  school: SchoolSummary | null;
  permissions: string[];
  /** The role being worked as (only that one, once chosen); everything the person holds is in `available_roles`. */
  roles: RoleSummary[];
  available_roles: { id: string; name: string; slug: string }[];
  active_role_slug: string | null;
  /** Holds several roles and hasn't chosen which to work as yet. */
  needs_role_choice: boolean;
  is_student: boolean;
  is_staff_member: boolean;
  two_factor_enabled: boolean;
  two_factor_required: boolean;
  must_change_password: boolean;
}

export interface UpdateProfilePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  photo?: File;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}
