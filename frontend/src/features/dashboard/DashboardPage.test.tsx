import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { RoleDashboard } from "./types";

const accountant: RoleDashboard = {
  role: "accountant",
  title: "Finance overview",
  subtitle: "Billing, collections and balances.",
  kpis: [
    { key: "billed", label: "Fees billed", value: 1000, format: "currency", tone: "neutral", hint: "", link: "/finance/invoices" },
    { key: "rate", label: "Collection rate", value: null, format: "percent", tone: "neutral", hint: "Paid ÷ billed", link: null },
  ],
  charts: [
    { key: "c1", title: "Collections by month", kind: "line", data: [{ label: "Jan 2026", value: 10 }, { label: "Feb 2026", value: 25.5 }, { label: "Mar 2026", value: 0 }], format: "currency", empty: "none" },
    { key: "c2", title: "Outstanding", kind: "bar", data: [{ label: "Grade 1", value: 1200.5 }, { label: "Grade 2", value: 80 }], format: "currency", empty: "No data" },
    { key: "c3", title: "Methods", kind: "pie", data: [{ label: "Cash", value: 5 }, { label: "Cheque", value: 0 }, { label: "Card", value: 9 }], format: "currency", empty: "none" },
  ],
  tables: [{ key: "t1", title: "Recent payments", columns: ["Receipt", "Amount"], rows: [["R1", "10.00"]], link: "/finance/invoices", empty: "none" }],
  alerts: [{ tone: "warning", message: "2 invoices are overdue", link: "/finance/invoices" }],
  actions: [{ label: "Invoices", to: "/finance/invoices" }],
  unavailable: [{ label: "Expenses", reason: "none recorded" }],
  filters: {
    options: { terms: [{ id: "t", name: "2026 · Term 1", is_current: true }], classes: [{ id: "c", name: "Grade 1" }] },
    applied: { term: null, school_class: null },
  },
  comparison: {
    current: { id: "t", name: "Term 2", year: "2026" },
    previous: { id: "p", name: "Term 1", year: "2025" },
    rows: [{ key: "collection", label: "Fee collection rate", format: "percent", current: 80, previous: 40, delta: 40, delta_pct: 100 }],
  },
};

vi.mock("./api", () => ({ fetchRoleDashboard: vi.fn(async () => accountant) }));
vi.mock("@/features/auth/useAuth", () => ({ useCurrentUser: () => ({ data: { first_name: "Esther" } }) }));

beforeAll(() => {
  // recharts measures its container; jsdom has no ResizeObserver
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("DashboardPage", () => {
  it("renders a full accountant payload, with empty and missing values, without crashing", async () => {
    const { DashboardPage } = await import("./DashboardPage");
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Fees billed")).toBeTruthy();
    expect(screen.getByText("Recent payments")).toBeTruthy();
    expect(screen.getByText(/Term 2 \(2026\) compared with Term 1 \(2025\)/)).toBeTruthy();
  });
});
