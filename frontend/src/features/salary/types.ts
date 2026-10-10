export type SalaryLineType = "basic" | "allowance" | "deduction";
export type SalaryPaymentStatus = "pending" | "paid" | "cancelled";
export type SalaryPaymentMethod = "cash" | "bank_transfer" | "card" | "mobile_money" | "cheque" | "other";

export interface SalaryStructure {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface SalaryStructurePayload {
  name: string;
}

export interface SalaryStructureListParams {
  page?: number;
  page_size?: number;
  search?: string;
}

export interface SalaryStructureItem {
  id: string;
  salary_structure: string;
  line_type: SalaryLineType;
  description: string;
  amount: string;
}

export interface SalaryStructureItemPayload {
  salary_structure: string;
  line_type: SalaryLineType;
  description: string;
  amount: string;
}

export interface StaffSalaryAssignment {
  id: string;
  staff: string;
  staff_name: string;
  salary_structure: string;
  salary_structure_name: string;
  effective_from: string;
  created_at: string;
  updated_at: string;
}

export interface StaffSalaryAssignmentPayload {
  staff: string;
  salary_structure: string;
  effective_from: string;
}

/** Decimal fields (`gross_amount`, `deductions_total`, `net_amount`) come back as strings from
 * DRF — parse with `Number()` only where an actual computation is needed. All three, plus
 * `salary_structure`, are snapshotted at generation time — editing a structure afterward never
 * retroactively changes an already-generated payment, see SalaryPayment's backend docstring. */
export interface SalaryPayment {
  id: string;
  staff: string;
  staff_name: string;
  salary_structure: string | null;
  salary_structure_name: string | null;
  period_year: number;
  period_month: number;
  payment_number: string;
  gross_amount: string;
  deductions_total: string;
  net_amount: string;
  status: SalaryPaymentStatus;
  paid_at: string | null;
  method: SalaryPaymentMethod | "";
  reference: string;
  recorded_by: string | null;
  recorded_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalaryPaymentListParams {
  page?: number;
  page_size?: number;
  search?: string;
  staff?: string;
  salary_structure?: string;
  status?: SalaryPaymentStatus;
  period_year?: number;
  period_month?: number;
}

export interface GenerateSalaryPaymentsPayload {
  period_year: number;
  period_month: number;
}

export interface GenerateSalaryPaymentsResponse {
  message: string;
  payments: SalaryPayment[];
  skipped_staff_ids: string[];
}

export interface RecordSalaryPaymentPayload {
  method: SalaryPaymentMethod;
  reference?: string;
}
