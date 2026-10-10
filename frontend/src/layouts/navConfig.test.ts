import { describe, expect, it } from "vitest";

import { isNavItemVisible } from "@/features/auth/useAuth";
import type { CurrentUser } from "@/types/auth";

import { NAV_CONFIG } from "./navConfig";

function userWith(slug: string, permissions: string[], extra: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "u",
    roles: [{ id: "r", name: slug, slug, permissions }],
    permissions,
    is_platform_admin: false,
    is_student: false,
    is_staff_member: true,
    ...extra,
  } as unknown as CurrentUser;
}

/** Top-level sidebar labels (and "Parent > Child" for children) this person would see. */
function visible(user: CurrentUser): string[] {
  const out: string[] = [];
  for (const item of NAV_CONFIG) {
    if (!isNavItemVisible(user, item)) continue;
    out.push(item.label);
    for (const child of item.children ?? []) if (isNavItemVisible(user, child)) out.push(`${item.label} > ${child.label}`);
  }
  return out;
}

describe("sidebar by role", () => {
  const examsDirector = userWith("exams-director", [
    "examinations.view", "exam_timetable.view", "exam_timetable.update", "results.view", "academics.view", "ca.manage",
    // a school that customised the role may still hold these; the sidebar must hide them anyway
    "attendance.view", "staff_attendance.view", "timetable.view",
  ]);

  it("gives the exams director the exam timetable, and no attendance or class timetable module", () => {
    const items = visible(examsDirector);
    expect(items).toContain("Examinations > Exam timetable");
    expect(items).toContain("Examinations > Gradebook");
    expect(items).not.toContain("Attendance");
    expect(items.some((i) => i.startsWith("Attendance >"))).toBe(false);
    expect(items).not.toContain("Timetable");
    expect(items).not.toContain("Exam timetable"); // the student/teacher page
  });

  it("shows the gradebook and class results in the principal's Examinations module", () => {
    const principal = userWith("principal", ["examinations.view", "results.view", "academics.view", "exam_timetable.view"]);
    const items = visible(principal);
    expect(items).toContain("Examinations > Gradebook");
    expect(items).toContain("Examinations > Class results & publish");
  });

  it("gives students and teachers their own exam timetable page", () => {
    const student = userWith("student", ["timetable.view"], { is_student: true, is_staff_member: false });
    expect(visible(student)).toContain("Exam timetable");
    const teacher = userWith("teacher", ["academics.view"]);
    expect(visible(teacher)).toContain("Exam timetable");
    const accountant = userWith("accountant", ["fees.view"]);
    expect(visible(accountant)).not.toContain("Exam timetable");
  });
});

describe("timetable and assignments in the sidebar", () => {
  it("keeps the timetable for teachers and students, not the Medical or Librarian roles", () => {
    const teacher = userWith("teacher", ["academics.view", "assignments.view"]);
    expect(visible(teacher)).toContain("Timetable");
    const student = userWith("student", ["timetable.view", "assignments.submit"], { is_student: true, is_staff_member: false });
    expect(visible(student)).toContain("Timetable");
    for (const slug of ["medical", "librarian"]) {
      const user = userWith(slug, ["timetable.view", "timetable.create", "medical.view", "library.view"]);
      expect(visible(user)).not.toContain("Timetable");
    }
  });

  it("shows Assignments to students (to submit) and to teachers (to set and mark)", () => {
    const student = userWith("student", ["assignments.submit"], { is_student: true, is_staff_member: false });
    expect(visible(student)).toContain("Assignments");
    const teacher = userWith("teacher", ["assignments.view", "assignments.create"]);
    expect(visible(teacher)).toContain("Assignments");
    expect(visible(userWith("student", [], { is_student: true, is_staff_member: false }))).not.toContain("Assignments");
  });
});
