import { describe, expect, it } from "vitest";

import { ordinal, rankByScore } from "./ranking";

describe("ordinal", () => {
  it("handles the usual suffixes and the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });
});

describe("rankByScore", () => {
  it("ranks highest first, shares ties, and leaves unscored items unranked", () => {
    const a = { s: 44.7 };
    const b = { s: 43.55 };
    const c = { s: 44.7 };
    const d = { s: null as number | null };
    const ranks = rankByScore([b, a, d, c], (x) => x.s);
    expect(ranks.get(a)).toBe(1);
    expect(ranks.get(c)).toBe(1);
    expect(ranks.get(b)).toBe(3);
    expect(ranks.get(d)).toBeNull();
  });
});
