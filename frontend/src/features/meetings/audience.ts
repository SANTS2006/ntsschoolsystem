import type { MeetingAudience } from "./types";

export type GroupMode = "none" | "all" | "some";
export type GroupKey = "staff" | "parents" | "students";

export interface AudienceState {
  staff: { mode: GroupMode; ids: string[] };
  parents: { mode: GroupMode; ids: string[] };
  students: { mode: GroupMode; ids: string[] };
}

export const EMPTY_AUDIENCE: AudienceState = {
  staff: { mode: "none", ids: [] },
  parents: { mode: "none", ids: [] },
  students: { mode: "none", ids: [] },
};

export function toAudiencePayload(state: AudienceState): MeetingAudience {
  return {
    include_all_staff: state.staff.mode === "all",
    include_all_parents: state.parents.mode === "all",
    include_all_students: state.students.mode === "all",
    staff_ids: state.staff.mode === "some" ? state.staff.ids : [],
    guardian_ids: state.parents.mode === "some" ? state.parents.ids : [],
    student_ids: state.students.mode === "some" ? state.students.ids : [],
  };
}

export function hasAudience(state: AudienceState): boolean {
  return (Object.values(state) as AudienceState[GroupKey][]).some(
    (group) => group.mode === "all" || (group.mode === "some" && group.ids.length > 0),
  );
}
