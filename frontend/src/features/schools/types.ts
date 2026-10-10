export type SchoolStatus = "pending" | "active" | "suspended";
export type SchoolType = "primary" | "secondary" | "combined" | "tertiary" | "other";
export type OwnershipType = "public" | "private" | "religious" | "ngo" | "other";

/** Every field a platform admin can see/edit about a school. `is_active` is deliberately not
 * modeled here — it's a backend Python property (`status === "active"`), never a real field, so
 * the frontend derives it the same way rather than carrying a second source of truth. */
export interface School {
  id: string;
  name: string;
  slug: string;
  motto: string;
  logo_url: string;
  logo: string | null;
  /** The school's two brand colours (#RRGGBB), chosen by the platform admin. */
  primary_color: string;
  secondary_color: string;
  email: string;
  phone_number: string;
  website: string;
  country: string;
  region: string;
  city: string;
  address: string;
  school_type: SchoolType;
  ownership_type: OwnershipType;
  currency: string;
  timezone: string;
  status: SchoolStatus;
  suspended_reason: string;
  settings: Record<string, unknown>;
  // The overall-percentage cut-off the promotion engine compares a student's three-term
  // average against — school-configured, never hard-coded (see academics Phase 2/7).
  promotion_threshold_percent: number;
  grade_point_scale: string;
  created_at: string;
  updated_at: string;
}

/** The narrow public shape served to a completely unauthenticated visitor (the branded-login
 * page and the "find your school" search) — deliberately just enough to brand a page, nothing
 * else about the school. */
export interface SchoolBranding {
  name: string;
  slug: string;
  logo: string | null;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
}

export interface SchoolListParams {
  search?: string;
  status?: SchoolStatus;
  school_type?: SchoolType;
  ownership_type?: OwnershipType;
  country?: string;
  ordering?: string;
}

/** `admin_email`/`admin_first_name`/`admin_last_name` are write-only — they invite the school's
 * first user (school-administrator role) in the same request, they're never read back as part of
 * the School record itself. The school always starts `status="pending"`; it isn't client-settable
 * here, an explicit `activate` action is required afterward. */
export interface SchoolCreatePayload {
  name: string;
  slug: string;
  motto?: string;
  logo?: File;
  primary_color?: string;
  secondary_color?: string;
  email?: string;
  phone_number?: string;
  website?: string;
  country?: string;
  region?: string;
  city?: string;
  address?: string;
  school_type?: SchoolType;
  ownership_type?: OwnershipType;
  currency?: string;
  timezone?: string;
  admin_email: string;
  admin_first_name: string;
  admin_last_name: string;
}

/** `logo_url` is only editable here (not at creation) — `status`/`suspended_reason` only change
 * through the `activate`/`suspend` actions, never a plain PATCH. */
export interface SchoolUpdatePayload {
  name?: string;
  slug?: string;
  motto?: string;
  logo_url?: string;
  logo?: File;
  primary_color?: string;
  secondary_color?: string;
  email?: string;
  phone_number?: string;
  website?: string;
  country?: string;
  region?: string;
  city?: string;
  address?: string;
  school_type?: SchoolType;
  ownership_type?: OwnershipType;
  currency?: string;
  timezone?: string;
}

/** What a school's own users may self-service edit via `/schools/me/` — narrower than
 * SchoolUpdatePayload (no slug/status/classification changes, matches SchoolSelfSerializer). */
export interface SchoolSelfUpdatePayload {
  name?: string;
  motto?: string;
  logo_url?: string;
  logo?: File;
  email?: string;
  phone_number?: string;
  website?: string;
  country?: string;
  region?: string;
  city?: string;
  address?: string;
  currency?: string;
  timezone?: string;
  promotion_threshold_percent?: number;
  grade_point_scale?: string;
}
