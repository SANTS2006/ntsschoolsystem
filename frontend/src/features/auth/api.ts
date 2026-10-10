import { clearStoredActiveRole, getStoredActiveRoleOwner } from "@/lib/activeRole";
import { apiClient } from "@/lib/api-client";
import type { ChangePasswordPayload, CurrentUser, UpdateProfilePayload } from "@/types/auth";

interface ApiEnvelope {
  success: boolean;
  message: string;
  code: string;
  errors: Array<{ field: string | null; message: string }>;
}

interface UserEnvelope extends ApiEnvelope {
  user: CurrentUser;
}

interface LoginEnvelope extends ApiEnvelope {
  user?: CurrentUser;
  two_factor_token?: string;
}

/** A login either signs the user in, or (for accounts with - or required to have - two-factor
 * authentication) hands back a short-lived token for the second step. No session exists until that
 * second step succeeds. */
export type LoginResult =
  | { kind: "signed-in"; user: CurrentUser }
  | { kind: "two-factor"; mode: "verify" | "setup"; token: string };

export async function login(email: string, password: string, schoolSlug?: string | null): Promise<LoginResult> {
  // `school_slug` names the school whose sign-in page this is; the platform page leaves it out.
  const { data } = await apiClient.post<LoginEnvelope>("/auth/login/", {
    email,
    password,
    ...(schoolSlug ? { school_slug: schoolSlug } : {}),
  });
  if (data.code === "TWO_FACTOR_REQUIRED" && data.two_factor_token) {
    return { kind: "two-factor", mode: "verify", token: data.two_factor_token };
  }
  if (data.code === "TWO_FACTOR_SETUP_REQUIRED" && data.two_factor_token) {
    return { kind: "two-factor", mode: "setup", token: data.two_factor_token };
  }
  return { kind: "signed-in", user: data.user as CurrentUser };
}

export async function verifyTwoFactor(token: string, code: string): Promise<CurrentUser> {
  const { data } = await apiClient.post<UserEnvelope>("/auth/2fa/verify/", { two_factor_token: token, code });
  return data.user;
}

export interface TwoFactorEnrollment {
  secret: string;
  otpauth_uri: string;
}

export async function beginTwoFactorSetup(token: string): Promise<TwoFactorEnrollment> {
  const { data } = await apiClient.post<ApiEnvelope & TwoFactorEnrollment>("/auth/2fa/setup/begin/", {
    two_factor_token: token,
  });
  return { secret: data.secret, otpauth_uri: data.otpauth_uri };
}

export async function confirmTwoFactorSetup(
  token: string,
  code: string,
): Promise<{ user: CurrentUser; recovery_codes: string[] }> {
  const { data } = await apiClient.post<UserEnvelope & { recovery_codes: string[] }>("/auth/2fa/setup/confirm/", {
    two_factor_token: token,
    code,
  });
  return { user: data.user, recovery_codes: data.recovery_codes };
}

export interface TwoFactorStatus {
  enabled: boolean;
  required: boolean;
  /** The account's role is expected to use two-factor, even if the person has switched it off. */
  recommended: boolean;
  recovery_codes_remaining: number;
}

export async function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  const { data } = await apiClient.get<ApiEnvelope & TwoFactorStatus>("/auth/2fa/status/");
  return { enabled: data.enabled, required: data.required, recommended: data.recommended, recovery_codes_remaining: data.recovery_codes_remaining };
}

export async function enrollTwoFactor(password: string): Promise<TwoFactorEnrollment> {
  const { data } = await apiClient.post<ApiEnvelope & TwoFactorEnrollment>("/auth/2fa/enroll/", { password });
  return { secret: data.secret, otpauth_uri: data.otpauth_uri };
}

export async function enableTwoFactor(code: string): Promise<string[]> {
  const { data } = await apiClient.post<ApiEnvelope & { recovery_codes: string[] }>("/auth/2fa/enable/", { code });
  return data.recovery_codes;
}

export async function disableTwoFactor(password: string, code: string): Promise<void> {
  await apiClient.post("/auth/2fa/disable/", { password, code });
}

export async function regenerateRecoveryCodes(password: string, code: string): Promise<string[]> {
  const { data } = await apiClient.post<ApiEnvelope & { recovery_codes: string[] }>("/auth/2fa/recovery-codes/", {
    password,
    code,
  });
  return data.recovery_codes;
}

export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout/");
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const { data } = await apiClient.get<UserEnvelope>("/auth/me/");
  // A role choice belongs to the person who made it. If this device remembers one made by someone else (a shared
  // computer), forget it and ask again — never apply it to this person.
  const owner = getStoredActiveRoleOwner();
  if (owner !== null && owner !== data.user.id) {
    clearStoredActiveRole();
    const again = await apiClient.get<UserEnvelope>("/auth/me/");
    return again.data.user;
  }
  return data.user;
}

/** A liveness ping only — bumps `User.last_seen_at` server-side, nothing in the response body
 * to read. See `useHeartbeat()` for the interval that calls this. */
export async function sendHeartbeat(): Promise<void> {
  await apiClient.post("/auth/heartbeat/");
}

/** A plain JSON body can't carry a File — switch to multipart/form-data only when a new photo
 * was actually picked, matching Student/Assignment/Document's `toRequestBody()` pattern. */
function toRequestBody(values: UpdateProfilePayload): UpdateProfilePayload | FormData {
  if (!values.photo) {
    return values;
  }
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      formData.append(key, value);
    }
  }
  return formData;
}

export async function updateCurrentUser(values: UpdateProfilePayload): Promise<CurrentUser> {
  const { data } = await apiClient.patch<UserEnvelope>("/auth/me/", toRequestBody(values));
  return data.user;
}

/** The backend blacklists every outstanding refresh token for this user on a successful
 * password change (so it can't be reused if it was ever compromised) — the caller must treat
 * a successful change as an implicit logout and send the user back to /login. */
export async function changePassword(values: ChangePasswordPayload): Promise<void> {
  await apiClient.post("/auth/change-password/", values);
}

/** Always resolves with the same neutral message, whether or not the email exists. */
export async function requestPasswordReset(email: string): Promise<string> {
  const { data } = await apiClient.post<ApiEnvelope>("/auth/password-reset/", { email });
  return data.message;
}

export async function confirmPasswordReset(payload: { uid: string; token: string; new_password: string }): Promise<void> {
  await apiClient.post("/auth/password-reset/confirm/", payload);
}

export async function acceptInvitation(payload: { uid: string; token: string; password: string }): Promise<void> {
  await apiClient.post("/auth/accept-invitation/", payload);
}

export async function confirmEmailVerification(payload: { uid: string; token: string }): Promise<void> {
  await apiClient.post("/auth/email-verification/confirm/", payload);
}
