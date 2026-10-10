import { PasswordCard } from "@/features/settings/SettingsPage";

/** Shown instead of the app while the account still has a password somebody else chose. */
export function ForcedPasswordChangePage() {
  return <PasswordCard forced />;
}
