import { describe, expect, it } from "vitest";

import { isNavItemVisible } from "@/features/auth/useAuth";
import type { CurrentUser } from "@/types/auth";

import { money, monthLabel } from "./money";

describe("money", () => {
  it("formats with two decimals and tolerates strings and blanks", () => {
    expect(money("1234.5")).toBe((1234.5).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(money(null)).toBe("0.00");
    expect(money("abc")).toBe("0.00");
  });
  it("labels months", () => {
    expect(monthLabel(2026, 3)).toBe("March 2026");
  });
});

describe("salaried nav gating", () => {
  const base = { roles: [], is_platform_admin: false } as unknown as CurrentUser;
  it("shows My salary only when the account has salary", () => {
    expect(isNavItemVisible({ ...base, has_salary: true }, { selfServiceFor: "salaried" })).toBe(true);
    expect(isNavItemVisible({ ...base, has_salary: false }, { selfServiceFor: "salaried" })).toBe(false);
  });
  it("shows My salary to every role except students", () => {
    expect(isNavItemVisible({ ...base, is_student: false }, { selfServiceFor: "non-student" })).toBe(true);
    expect(isNavItemVisible({ ...base, is_student: true }, { selfServiceFor: "non-student" })).toBe(false);
  });
});
