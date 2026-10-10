export type BookCopyStatus = "available" | "borrowed" | "reserved" | "lost" | "damaged";
export type LoanStatus = "borrowed" | "returned" | "lost";
export type ReservationStatus = "pending" | "approved" | "rejected" | "fulfilled" | "cancelled";

export interface BookCategory {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface BookCategoryPayload {
  name: string;
}

export interface Book {
  id: string;
  title: string;
  isbn: string;
  author: string;
  publisher: string;
  category: string | null;
  category_name: string | null;
  description: string;
  available_copies: number;
  created_at: string;
  updated_at: string;
}

export interface BookPayload {
  title: string;
  isbn?: string;
  author?: string;
  publisher?: string;
  category?: string;
  description?: string;
  /** New books only: how many copies the library holds, and its own number for each (blank ones are generated). */
  copy_count?: number;
  copy_numbers?: string[];
}

export interface BookListParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: string;
}

export interface BookCopy {
  id: string;
  book: string;
  book_title: string;
  copy_number: string;
  status: BookCopyStatus;
  created_at: string;
  updated_at: string;
}

export interface BookCopyPayload {
  book: string;
  copy_number: string;
}

export interface BookCopyListParams {
  book?: string;
  status?: BookCopyStatus;
  page?: number;
  page_size?: number;
}

/** `borrowed_date`/`due_date`/`status`/`renewal_count`/`fine_amount` are all server-computed —
 * `borrowed_date` is today and `due_date` is today+14 days, decided by `services.checkout_book()`,
 * never client-supplied. Creating a loan (checkout) only ever sends `copy` + exactly one of
 * `student`/`staff`. */
export interface BookLoan {
  id: string;
  copy: string;
  book_title: string;
  copy_number: string;
  student: string | null;
  staff: string | null;
  borrower_name: string;
  borrowed_date: string;
  due_date: string;
  returned_date: string | null;
  status: LoanStatus;
  renewal_count: number;
  fine_amount: string;
  is_overdue: boolean;
  created_at: string;
  updated_at: string;
}

export interface CheckoutPayload {
  copy: string;
  student?: string;
  staff?: string;
}

export interface BookLoanListParams {
  copy?: string;
  student?: string;
  staff?: string;
  status?: LoanStatus;
  page?: number;
  page_size?: number;
}

export interface BookReservation {
  id: string;
  book: string;
  book_title: string;
  student: string | null;
  staff: string | null;
  requester_name: string | null;
  reserved_at: string;
  status: ReservationStatus;
  decision_note: string;
  decided_at: string | null;
}

export interface ReservationPayload {
  book: string;
  student?: string;
  staff?: string;
}

export interface BookReservationListParams {
  book?: string;
  student?: string;
  staff?: string;
  status?: ReservationStatus;
  page?: number;
  page_size?: number;
}

/** One book as a student or teacher sees it in the library catalogue. */
export interface CatalogBook {
  id: string;
  title: string;
  author: string;
  isbn: string;
  category_name: string | null;
  description: string;
  available_copies: number;
  total_copies: number;
  my_reservation: "pending" | "approved" | null;
  my_loan_due: string | null;
}

export interface MyLoan {
  id: string;
  book_title: string;
  copy_number: string;
  borrowed_date: string;
  due_date: string;
  returned_date: string | null;
  status: LoanStatus;
  is_overdue: boolean;
  fine_amount: string;
}
