import { useQuery } from "@tanstack/react-query";

import { listStaff } from "./api";

/** `role`, when given, narrows the picker to staff holding that RBAC role slug (e.g. "teacher")
 * instead of every active staff member — for a picker where only that role legitimately makes
 * sense (a subject's teacher, a class's class teacher, a timetable entry's teacher). Leave it
 * unset for a picker that should show every staff member regardless of role. */
export function useStaffLookup(role?: string) {
  return useQuery({ queryKey: ["staff", "lookup", role], queryFn: () => listStaff(role) });
}
