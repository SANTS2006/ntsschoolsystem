import { describe, expect, it } from "vitest";

import { formatValue } from "./format";

describe("formatValue", () => {
  it("shows a dash when there is nothing to calculate from", () => {
    expect(formatValue(null, "percent")).toBe("—");
  });
  it("formats percentages and currency", () => {
    expect(formatValue(92.5, "percent")).toBe("92.5%");
    expect(formatValue(1234.5, "currency")).toBe((1234.5).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  });
  it("passes text through", () => {
    expect(formatValue("n/a", "text")).toBe("n/a");
  });
});
