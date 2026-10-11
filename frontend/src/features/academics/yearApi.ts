import { apiClient } from "@/lib/api-client";

import type { AcademicYear } from "./types";

export type YearStatus = "upcoming" | "active" | "closed";

export interface YearSummary {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: YearStatus;
  is_current: boolean;
  is_archived: boolean;
}

/** The school's active year (authoritative, from the server) and the years a person may choose to *view*. */
export interface YearContext {
  active: YearSummary | null;
  current_term: { id: string; name: string } | null;
  years: YearSummary[];
}

export type Outcome = "promote" | "repeat" | "graduate" | "withdraw" | "transfer";

export interface PreviewStudent {
  student_id: string;
  name: string;
  admission_number: string;
  class_id: string;
  class_name: string;
  section_name: string;
  proposed: Outcome | "review";
  reason: string;
  next_class_id: string | null;
}

export interface RolloverPreview {
  source: YearSummary;
  target: YearSummary;
  run: { status: "running" | "completed" | "failed"; summary: RolloverSummary; error: string } | null;
  students: PreviewStudent[];
  counts: Record<string, number>;
  configuration: {
    sections: { in_source: number; in_target: number };
    subject_offerings: { in_source: number; in_target: number; needs_terms: boolean };
    fee_structures: { in_source: number; in_target: number };
    timetables: string;
  };
  outstanding_balances: { invoices: number; students: number; total: string };
  warnings: string[];
  ready: boolean;
}

export interface RolloverSummary {
  students: Record<string, number>;
  students_without_section: number;
  skipped_already_enrolled: number;
  configuration: Record<string, Record<string, number>>;
  outstanding_balances: { invoices: number; students: number; total: string };
}

export interface RolloverOptions {
  sections: boolean;
  subject_offerings: boolean;
  fee_structures: boolean;
}

export type Decisions = Record<string, { outcome: Outcome; class?: string }>;

export async function fetchYearContext(): Promise<YearContext> {
  const { data } = await apiClient.get<YearContext>("/academics/year-context/");
  return data;
}

export async function activateYear(id: string): Promise<AcademicYear> {
  const { data } = await apiClient.post<{ academic_year: AcademicYear }>(`/academics/academic-years/${id}/activate/`);
  return data.academic_year;
}

export async function previewRollover(source: string, target: string): Promise<RolloverPreview> {
  const { data } = await apiClient.post<{ preview: RolloverPreview }>("/academics/year-rollover/preview/", { source, target });
  return data.preview;
}

export async function executeRollover(body: { source: string; target: string; decisions: Decisions; options: RolloverOptions }) {
  const { data } = await apiClient.post<{ run: { id: string; status: string; summary: RolloverSummary } }>("/academics/year-rollover/execute/", body);
  return data.run;
}
