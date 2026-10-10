/** Backend model name is `Guardian` (the URL prefix is `/api/v1/parents/`, but the wire format —
 * field names, the `StudentGuardian` through-model — always says "guardian", never "parent"). */
export type GuardianRelationship = "mother" | "father" | "guardian" | "other";

/** `user` is nullable — most guardians are contact records only, with no portal login at all.
 * Linking one to a `User` account is a separate, manual step (`PATCH` with a user id) that this
 * frontend doesn't expose yet — there's no picker for "which existing User" and no invite flow
 * analogous to Staff/School-admin invites for this relationship, so building a half-finished
 * account-linking control isn't worth it until that's actually asked for. */
export interface Guardian {
  id: string;
  user: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone_number: string;
  address: string;
  occupation: string;
  photo: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuardianPayload {
  first_name: string;
  last_name: string;
  email?: string;
  phone_number?: string;
  address?: string;
  occupation?: string;
  photo?: File;
}

export interface GuardianListParams {
  search?: string;
}

/** Read-only shape returned by the student-side `guardians` action — there is no flat
 * `StudentGuardian` list endpoint, this only ever comes back nested under one student. */
export interface StudentGuardian {
  id: string;
  student: string;
  student_name: string;
  guardian: Guardian;
  relationship: GuardianRelationship;
  is_primary: boolean;
  is_emergency_contact: boolean;
}

export interface LinkGuardianPayload {
  guardian_id: string;
  relationship?: GuardianRelationship;
  is_primary?: boolean;
  is_emergency_contact?: boolean;
}
