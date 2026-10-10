import { Navigate } from "react-router-dom";

import { useHasPermission } from "@/features/auth/useAuth";

/** `/attendance` alone has no page of its own — send the visitor to the first tab they can
 * actually see, rather than assuming everyone can view student attendance (a role with only
 * `staff_attendance.view` would otherwise land on a tab hidden from their own nav). */
export function AttendanceIndexRedirect() {
  const canViewStudentAttendance = useHasPermission("attendance.view");
  const canViewStaffAttendance = useHasPermission("staff_attendance.view");

  if (canViewStudentAttendance) return <Navigate to="take" replace />;
  if (canViewStaffAttendance) return <Navigate to="staff" replace />;
  return <Navigate to="take" replace />;
}
