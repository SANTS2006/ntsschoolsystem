import { useCurrentUser } from "@/features/auth/useAuth";

import { AppShell } from "./AppShell";
import { PlatformShell } from "./PlatformShell";

/** `/settings` and `/notifications` are pages every authenticated account needs to reach,
 * regardless of type — but `AppShell` bounces platform admins out and `PlatformShell` bounces
 * school users out (see each shell's own guard comment), so this layout picks whichever real
 * shell fits the current account and delegates to it, rather than rendering its own bespoke
 * chrome. Both shells render `<Outlet />` internally, so `SettingsPage`/`NotificationsListPage`
 * end up inside the exact same sidebar+header every other page gets — not a look-alike. */
export function AccountLayout() {
  const { data: user } = useCurrentUser();
  return user?.is_platform_admin ? <PlatformShell /> : <AppShell />;
}
