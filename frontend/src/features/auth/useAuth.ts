import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { clearStoredActiveRole, setStoredActiveRole } from "@/lib/activeRole";
import type { ApiError } from "@/lib/api-client";
import type { ChangePasswordPayload, CurrentUser, RoleSummary, UpdateProfilePayload } from "@/types/auth";

import {
  beginTwoFactorSetup,
  changePassword,
  confirmTwoFactorSetup,
  disableTwoFactor,
  enableTwoFactor,
  enrollTwoFactor,
  fetchCurrentUser,
  fetchGoogleConfig,
  fetchTwoFactorStatus,
  login,
  loginWithGoogle,
  logout,
  regenerateRecoveryCodes,
  sendHeartbeat,
  updateCurrentUser,
  verifyTwoFactor,
  type LoginResult,
  type TwoFactorEnrollment,
  type TwoFactorStatus,
} from "./api";

export const CURRENT_USER_QUERY_KEY = ["auth", "me"] as const;

const HEARTBEAT_INTERVAL_MS = 60_000;

export function useCurrentUser() {
  return useQuery<CurrentUser, ApiError>({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: fetchCurrentUser,
    // A 401/403 means "not signed in" and is final; anything else (dropped connection, a server waking up) is tried again.
    retry: (failures, error) => {
      const status = (error as { status?: number } | null)?.status;
      return status !== 401 && status !== 403 && failures < 2;
    },
    retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 6000),
  });
}

/** Pings the backend roughly once a minute so `User.last_seen_at` (and therefore the presence
 * dot everyone sees on this user's `Avatar`) stays fresh while the app is open. Mounted once in
 * `ProtectedRoute`, gated by `enabled` so an anonymous visitor (still loading `/auth/me/`, or
 * bounced to /login) never sends one. Errors are swallowed: a missed heartbeat should never
 * surface as a user-facing failure, it just lets the dot go stale. */
export function useHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const ping = () => {
      sendHeartbeat().catch(() => {});
    };
    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled]);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation<LoginResult, ApiError, { email: string; password: string; schoolSlug?: string | null }>({
    mutationFn: ({ email, password, schoolSlug }) => login(email, password, schoolSlug),
    onSuccess: (result) => {
      // A two-factor challenge is NOT a session: nothing to cache until the second step succeeds.
      if (result.kind === "signed-in") {
        clearStoredActiveRole(); // a new sign-in always starts by choosing a role again
        queryClient.setQueryData(CURRENT_USER_QUERY_KEY, result.user);
      }
    },
  });
}

export function useGoogleConfig() {
  return useQuery({ queryKey: ["auth", "google-config"], queryFn: fetchGoogleConfig, staleTime: 10 * 60 * 1000, retry: 1 });
}

export function useGoogleLogin() {
  const queryClient = useQueryClient();
  return useMutation<LoginResult, ApiError, { credential: string; schoolSlug?: string | null }>({
    mutationFn: ({ credential, schoolSlug }) => loginWithGoogle(credential, schoolSlug),
    onSuccess: (result) => {
      if (result.kind === "signed-in") {
        clearStoredActiveRole();
        queryClient.setQueryData(CURRENT_USER_QUERY_KEY, result.user);
      }
    },
  });
}

export function useVerifyTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation<CurrentUser, ApiError, { token: string; code: string }>({
    mutationFn: ({ token, code }) => verifyTwoFactor(token, code),
    onSuccess: (user) => {
      clearStoredActiveRole();
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, user);
    },
  });
}

export function useBeginTwoFactorSetup() {
  return useMutation<TwoFactorEnrollment, ApiError, string>({ mutationFn: beginTwoFactorSetup });
}

export function useConfirmTwoFactorSetup() {
  const queryClient = useQueryClient();
  return useMutation<{ recovery_codes: string[] }, ApiError, { token: string; code: string }>({
    mutationFn: async ({ token, code }) => {
      const result = await confirmTwoFactorSetup(token, code);
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, result.user);
      return { recovery_codes: result.recovery_codes };
    },
  });
}

const TWO_FACTOR_STATUS_KEY = ["auth", "2fa-status"] as const;

export function useTwoFactorStatus() {
  return useQuery<TwoFactorStatus, ApiError>({ queryKey: TWO_FACTOR_STATUS_KEY, queryFn: fetchTwoFactorStatus });
}

export function useEnrollTwoFactor() {
  return useMutation<TwoFactorEnrollment, ApiError, string>({ mutationFn: enrollTwoFactor });
}

export function useEnableTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation<string[], ApiError, string>({
    mutationFn: enableTwoFactor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TWO_FACTOR_STATUS_KEY });
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
    },
  });
}

export function useDisableTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { password: string; code: string }>({
    mutationFn: ({ password, code }) => disableTwoFactor(password, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TWO_FACTOR_STATUS_KEY });
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
    },
  });
}

export function useRegenerateRecoveryCodes() {
  const queryClient = useQueryClient();
  return useMutation<string[], ApiError, { password: string; code: string }>({
    mutationFn: ({ password, code }) => regenerateRecoveryCodes(password, code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TWO_FACTOR_STATUS_KEY }),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError>({
    mutationFn: logout,
    onSettled: () => {
      clearStoredActiveRole();
      // Clear everything, not just the user — every cached query belongs to the
      // session that just ended, and the next user (or an anonymous visitor)
      // must never see stale data left over from it.
      queryClient.clear();
    },
  });
}

export function useUpdateCurrentUser() {
  const queryClient = useQueryClient();
  return useMutation<CurrentUser, ApiError, UpdateProfilePayload>({
    mutationFn: updateCurrentUser,
    onSuccess: (user) => queryClient.setQueryData(CURRENT_USER_QUERY_KEY, user),
  });
}

/** Deliberately doesn't touch the query cache on success — the backend blacklists every
 * outstanding refresh token for this user, so the only correct follow-up is to log out and
 * redirect to /login (the component calling this handles that with useLogout + navigate). */
export function useChangePassword() {
  return useMutation<void, ApiError, ChangePasswordPayload>({
    mutationFn: changePassword,
  });
}

/** Plain (non-hook) check, reusable anywhere a `CurrentUser` is already in hand — e.g.
 * filtering a fixed list of nav items without calling a hook once per item. An array of codes
 * means "any of" — e.g. an Attendance nav item visible to someone with either `attendance.view`
 * or `staff_attendance.view`, since those are two genuinely separate permission sets. */
export function userHasPermission(user: CurrentUser | undefined, code?: string | string[]): boolean {
  if (!code || (Array.isArray(code) && code.length === 0)) return true;
  const codes = Array.isArray(code) ? code : [code];
  return !!user && (user.is_platform_admin || codes.some((c) => user.permissions.includes(c)));
}

export function useHasPermission(code: string | string[]): boolean {
  const { data: user } = useCurrentUser();
  return userHasPermission(user, code);
}

/** Checks the signed-in user's own role slugs directly, for the handful of things gated by
 * "are you a teacher" rather than by a permission code — e.g. a subject's private-message button,
 * which only the teacher (not a school-administrator or principal who can also reach the same
 * page) should see. */
export function useHasRole(slug: string): boolean {
  const { data: user } = useCurrentUser();
  return !!user?.roles.some((role) => role.slug === slug);
}

/** Which role a person with several is working as. The choice is sent to the server on every request
 * (see lib/activeRole.ts), which then gives them exactly that role's permissions and `/auth/me/` lists only that
 * role — so `activeRole` here is simply the one role the rest of the app sees. `null` for a person with one role (there
 * is nothing to switch) or one who hasn't chosen yet (they get the role picker first). */
export function useActiveRole(): { activeRole: RoleSummary | null; setActiveRoleSlug: (slug: string) => void } {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const activeRole =
    user && (user.available_roles?.length ?? 0) > 1 && user.active_role_slug
      ? (user.roles.find((role) => role.slug === user.active_role_slug) ?? null)
      : null;

  const setActiveRoleSlug = useCallback(
    (slug: string) => {
      if (!user) return;
      setStoredActiveRole(user.id, slug);
      // Everything on screen was loaded as the previous role; drop it and start from the new role's own home page.
      queryClient.clear();
      void queryClient.prefetchQuery({ queryKey: CURRENT_USER_QUERY_KEY, queryFn: fetchCurrentUser });
      navigate("/", { replace: true });
    },
    [user, queryClient, navigate],
  );

  return { activeRole, setActiveRoleSlug };
}

/** Layers a self-service identity check on top of `userHasPermission` — some nav items (My
 * Transcript, My Lessons, etc.) are meant only for student portal accounts, which hold zero RBAC
 * permissions and so can't be gated by a permission code at all (see `is_student` on
 * `CurrentUser` / `CurrentUserSerializer.get_is_student` for why). A plain `permission` item with
 * no `selfServiceFor` behaves exactly like `userHasPermission` always did. */
export function isNavItemVisible(
  user: CurrentUser | undefined,
  item: {
    permission?: string | string[];
    selfServiceFor?: "student" | "staff" | "student-or-staff" | "salaried";
    /** Role slugs that never see this item, even if they hold its permission (e.g. the Teacher
     * keeps `academics.view` for the subject-roster API but has no Academics sidebar module). */
    hideForRoles?: string[];
    /** When set, only accounts holding one of these role slugs see the item. */
    showForRoles?: string[];
  },
  /** The role switcher's current pick (useActiveRole) — when given, both the role-slug checks
   * and the permission check are scoped to just this one role instead of everything the user
   * holds, so the sidebar reads as if this were their only role. Purely cosmetic: omitting this
   * (or a 0-1-role user, for whom useActiveRole always returns null) falls back to the original
   * full-membership behavior, and the backend never sees or trusts this choice either way. */
  activeRole?: RoleSummary | null,
): boolean {
  const roleSlugs = activeRole ? [activeRole.slug] : (user?.roles?.map((role) => role.slug) ?? []);
  if (item.hideForRoles?.some((slug) => roleSlugs.includes(slug))) return false;
  if (item.showForRoles && !item.showForRoles.some((slug) => roleSlugs.includes(slug))) return false;

  if (activeRole) {
    const codes = item.permission ? (Array.isArray(item.permission) ? item.permission : [item.permission]) : [];
    if (codes.length > 0 && !(user?.is_platform_admin || codes.some((c) => activeRole.permissions.includes(c)))) {
      return false;
    }
  } else if (!userHasPermission(user, item.permission)) {
    return false;
  }

  if (item.selfServiceFor === "student" && !user?.is_student) return false;
  if (item.selfServiceFor === "staff" && !user?.is_staff_member) return false;
  if (item.selfServiceFor === "student-or-staff" && !(user?.is_student || user?.is_staff_member)) return false;
  if (item.selfServiceFor === "salaried" && !user?.has_salary) return false;
  return true;
}
