import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { YearBadge } from "./YearBadge";
import { YearRolloverPage } from "./YearRolloverPage";
import { YearSelect } from "./YearSelect";
import type { RolloverPreview, YearContext } from "./yearApi";

const y1 = { id: "y1", name: "2026/2027", start_date: "2026-09-01", end_date: "2027-07-31", status: "active", is_current: true, is_archived: false } as const;
const y2 = { id: "y2", name: "2027/2028", start_date: "2027-09-01", end_date: "2028-07-31", status: "upcoming", is_current: false, is_archived: false } as const;
const y0 = { id: "y0", name: "2025/2026", start_date: "2025-09-01", end_date: "2026-07-31", status: "closed", is_current: false, is_archived: true } as const;

let context: YearContext;
const preview: RolloverPreview = {
  source: y1,
  target: y2,
  run: null,
  students: [
    { student_id: "s1", name: "Ama Kamara", admission_number: "A1", class_id: "c1", class_name: "Grade 1", section_name: "A", proposed: "promote", reason: "70% (pass mark 50%).", next_class_id: "c2" },
    { student_id: "s2", name: "Joe Bangura", admission_number: "A2", class_id: "c1", class_name: "Grade 1", section_name: "A", proposed: "review", reason: "Results for the year are incomplete.", next_class_id: "c2" },
  ],
  counts: { promote: 1, review: 1 },
  configuration: {
    sections: { in_source: 2, in_target: 0 },
    subject_offerings: { in_source: 3, in_target: 0, needs_terms: false },
    fee_structures: { in_source: 1, in_target: 0 },
    timetables: "Not copied: build the new year's timetable from its sections and subject offerings.",
  },
  outstanding_balances: { invoices: 1, students: 1, total: "200.00" },
  warnings: [],
  ready: false,
};

const api = vi.hoisted(() => ({
  fetchYearContext: vi.fn(),
  previewRollover: vi.fn(),
  executeRollover: vi.fn(),
  activateYear: vi.fn(),
}));
vi.mock("./yearApi", () => api);
vi.mock("./useAcademicsLookups", () => ({ useSchoolClasses: () => ({ data: [{ id: "c2", name: "Grade 2" }] }) }));
vi.mock("@/components/ui/confirmContext", () => ({ useConfirm: () => async () => true }));
vi.mock("@/components/ui/toastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  context = { active: y1, current_term: { id: "t1", name: "Term 1" }, years: [y2, y1, y0] };
  api.fetchYearContext.mockImplementation(async () => context);
  api.previewRollover.mockResolvedValue(preview);
  api.executeRollover.mockResolvedValue({ id: "r1", status: "completed", summary: { students: { promoted: 1, repeated: 1 }, students_without_section: 0, skipped_already_enrolled: 0, configuration: {}, outstanding_balances: preview.outstanding_balances } });
  api.activateYear.mockResolvedValue({});
});

describe("YearBadge", () => {
  it("shows the active year and term exactly as the server reports them", async () => {
    wrap(<YearBadge />);
    expect(await screen.findByText("2026/2027")).toBeInTheDocument();
    expect(screen.getByText(/Term 1/)).toBeInTheDocument();
  });

  it("says plainly when there is no active year instead of guessing", async () => {
    context = { active: null, current_term: null, years: [y2] };
    wrap(<YearBadge />);
    expect(await screen.findByText("No active year")).toBeInTheDocument();
    expect(screen.queryByText("2027/2028")).toBeNull();
  });

  it("renders nothing when the year context cannot be loaded", async () => {
    api.fetchYearContext.mockRejectedValue(new Error("403"));
    const { container } = wrap(<YearBadge />);
    await waitFor(() => expect(api.fetchYearContext).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("YearSelect", () => {
  it("lists every year with its status and only reports the choice, never changes the active year", async () => {
    const onChange = vi.fn();
    wrap(<YearSelect value="" onChange={onChange} allLabel="Current students" />);
    const select = await screen.findByRole("combobox");
    expect(screen.getByRole("option", { name: "Current students" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2025/2026 (closed)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2027/2028 (upcoming)" })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "y0" } });
    expect(onChange).toHaveBeenCalledWith("y0");
    expect(api.activateYear).not.toHaveBeenCalled();
  });
});

describe("YearRolloverPage", () => {
  async function loadPreview() {
    wrap(<YearRolloverPage />);
    await screen.findByText("1. Choose the years");
    await userEvent.selectOptions(screen.getAllByRole("combobox")[1], "y2");
    await userEvent.click(screen.getByRole("button", { name: /Preview/ }));
    await screen.findByText("2. Review what will happen");
  }

  it("only offers upcoming years as the opening year", async () => {
    wrap(<YearRolloverPage />);
    await screen.findByText("1. Choose the years");
    const opening = screen.getAllByRole("combobox")[1];
    expect(opening).toHaveTextContent("2027/2028");
    expect(opening).not.toHaveTextContent("2025/2026");
  });

  it("will not run while a student still needs a decision, and sends exactly what was decided", async () => {
    await loadPreview();
    expect(screen.getByText(/1 student\(s\) need a decision/)).toBeInTheDocument();
    const run = screen.getByRole("button", { name: /Run the rollover/ });
    expect(run).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("Outcome for Joe Bangura"), "repeat");
    expect(run).toBeEnabled();
    await userEvent.click(run);

    await waitFor(() => expect(api.executeRollover).toHaveBeenCalledTimes(1));
    expect(api.executeRollover).toHaveBeenCalledWith({
      source: "y1",
      target: "y2",
      decisions: { s1: { outcome: "promote" }, s2: { outcome: "repeat" } },
      options: { sections: true, subject_offerings: true, fee_structures: true },
    });
    expect(await screen.findByText(/Make 2027\/2028 the active year/)).toBeInTheDocument();
  });

  it("activation is a separate step and only appears after the run", async () => {
    await loadPreview();
    expect(screen.queryByText(/Make 2027\/2028 the active year/)).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Outcome for Joe Bangura"), "graduate");
    await userEvent.click(screen.getByRole("button", { name: /Run the rollover/ }));
    const activate = await screen.findByRole("button", { name: /Make 2027\/2028 the active year/ });
    expect(api.activateYear).not.toHaveBeenCalled();
    await userEvent.click(activate);
    await waitFor(() => expect(api.activateYear).toHaveBeenCalled());
    expect(api.activateYear.mock.calls[0][0]).toBe("y2");
  });

  it("shows the outstanding balances and warns that they stay on their invoices", async () => {
    await loadPreview();
    expect(screen.getByText(/Outstanding balances stay on their original invoices: 200.00/)).toBeInTheDocument();
  });
});
