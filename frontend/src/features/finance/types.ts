export type InvoiceStatus = "unpaid" | "partially_paid" | "paid" | "cancelled";
export type LineType = "charge" | "discount" | "scholarship" | "waiver";
export type PaymentMethod = "cash" | "bank_transfer" | "card" | "mobile_money" | "cheque" | "other";
export type PaymentStatus = "completed" | "partially_refunded" | "refunded";

export interface FeeCategory {
  id: string;
  name: string;
  code: string;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeeCategoryPayload {
  name: string;
  code?: string;
  is_recurring: boolean;
}

export interface FeeCategoryListParams {
  page?: number;
  page_size?: number;
  search?: string;
}

export interface FeeStructure {
  id: string;
  name: string;
  academic_year: string;
  academic_year_name: string;
  term: string | null;
  term_name: string | null;
  school_class: string | null;
  school_class_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeeStructurePayload {
  name: string;
  academic_year: string;
  term?: string;
  school_class?: string;
}

export interface FeeStructureListParams {
  page?: number;
  page_size?: number;
  search?: string;
  academic_year?: string;
  term?: string;
  school_class?: string;
}

export interface FeeStructureItem {
  id: string;
  fee_structure: string;
  fee_category: string;
  fee_category_name: string;
  amount: string;
}

export interface FeeStructureItemPayload {
  fee_structure: string;
  fee_category: string;
  amount: string;
}

/** Decimal fields (`amount`, `subtotal`, `total`, etc.) come back as strings from DRF — parse
 * with `Number()` only where an actual computation is needed. Unlike every other domain's raw-FK
 * + companion `*_name` pattern, `InvoiceSerializer` does NOT expose `academic_year_name`/
 * `term_name` — only `student_name` and the computed `is_overdue`. Resolve those two names
 * client-side from the existing academics lookups where a display label is needed. */
export interface Invoice {
  id: string;
  invoice_number: string;
  student: string;
  student_name: string;
  fee_structure: string | null;
  academic_year: string;
  term: string | null;
  due_date: string | null;
  status: InvoiceStatus;
  subtotal: string;
  discount_total: string;
  total: string;
  amount_paid: string;
  balance: string;
  is_overdue: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvoiceListParams {
  page?: number;
  page_size?: number;
  search?: string;
  student?: string;
  academic_year?: string;
  term?: string;
  status?: InvoiceStatus;
  fee_structure?: string;
}

export interface InvoiceLineItemInput {
  fee_category?: string;
  line_type: LineType;
  description?: string;
  amount: string;
}

/** The nested-create shape `POST /finance/invoices/` actually expects — not a plain
 * ModelSerializer create, since an invoice is meaningless without at least one line item. */
export interface InvoiceCreatePayload {
  student: string;
  academic_year: string;
  term?: string;
  due_date?: string;
  line_items: InvoiceLineItemInput[];
}

export interface InvoiceLineItem {
  id: string;
  invoice: string;
  fee_category: string | null;
  fee_category_name: string | null;
  line_type: LineType;
  description: string;
  amount: string;
}

export interface InvoiceLineItemPayload {
  invoice: string;
  fee_category?: string;
  line_type: LineType;
  description?: string;
  amount: string;
}

export interface GenerateInvoicesPayload {
  fee_structure: string;
  school_class?: string;
  due_date?: string;
}

export interface GenerateInvoicesResponse {
  message: string;
  invoices: Invoice[];
  skipped_student_ids: string[];
}

export interface InvoiceStats {
  total_invoiced: string;
  total_collected: string;
  total_outstanding: string;
}

export interface Payment {
  id: string;
  receipt_number: string;
  invoice: string;
  invoice_number: string;
  student_name: string;
  amount: string;
  method: PaymentMethod;
  reference: string;
  paid_at: string;
  recorded_by: string | null;
  recorded_by_name: string | null;
  status: PaymentStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentPayload {
  invoice: string;
  amount: string;
  method: PaymentMethod;
  reference?: string;
  paid_at?: string;
  notes?: string;
}

export interface PaymentListParams {
  page?: number;
  page_size?: number;
  invoice?: string;
  method?: PaymentMethod;
  status?: PaymentStatus;
}

export interface Refund {
  id: string;
  payment: string;
  amount: string;
  reason: string;
  refunded_by: string | null;
  refunded_at: string;
}

export interface RefundPayload {
  amount: string;
  reason: string;
}
