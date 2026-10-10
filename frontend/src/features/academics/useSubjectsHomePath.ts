import { useLocation } from "react-router-dom";

import { useCurrentUser } from "@/features/auth/useAuth";

/** Where "back" goes from a subject's roster / CA / results / communications pages: teachers land on
 * their own Subjects cards, administrators on the full Subject Offerings table — and the examinations
 * team, who open these pages from Examinations > Gradebook, go back there. */
export function useSubjectsHomePath(): string {
  const { data: user } = useCurrentUser();
  const { pathname } = useLocation();
  if (pathname.startsWith("/examinations")) return "/examinations/gradebook";
  return user?.roles.some((role) => role.slug === "teacher") ? "/subjects" : "/academics/subject-offerings";
}
