import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  Book,
  BookCategory,
  BookCategoryPayload,
  BookCopy,
  BookCopyListParams,
  BookCopyPayload,
  BookListParams,
  BookLoan,
  BookLoanListParams,
  BookPayload,
  BookReservation,
  CatalogBook,
  MyLoan,
  BookReservationListParams,
  CheckoutPayload,
  ReservationPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchBookCategories(params: PageParams & { search?: string }): Promise<PaginatedResponse<BookCategory>> {
  const { data } = await apiClient.get<PaginatedResponse<BookCategory>>("/library/categories/", { params });
  return data;
}

export async function getBookCategory(id: string): Promise<BookCategory> {
  const { data } = await apiClient.get<BookCategory>(`/library/categories/${id}/`);
  return data;
}

export async function createBookCategory(values: BookCategoryPayload): Promise<BookCategory> {
  const { data } = await apiClient.post<BookCategory>("/library/categories/", values);
  return data;
}

export async function updateBookCategory(id: string, values: BookCategoryPayload): Promise<BookCategory> {
  const { data } = await apiClient.patch<BookCategory>(`/library/categories/${id}/`, values);
  return data;
}

export async function deleteBookCategory(id: string): Promise<void> {
  await apiClient.delete(`/library/categories/${id}/`);
}

export async function fetchBooks(params: PageParams & BookListParams): Promise<PaginatedResponse<Book>> {
  const { data } = await apiClient.get<PaginatedResponse<Book>>("/library/books/", { params });
  return data;
}

export async function getBook(id: string): Promise<Book> {
  const { data } = await apiClient.get<Book>(`/library/books/${id}/`);
  return data;
}

export async function createBook(values: BookPayload): Promise<Book> {
  const { data } = await apiClient.post<Book>("/library/books/", values);
  return data;
}

export async function updateBook(id: string, values: BookPayload): Promise<Book> {
  const { data } = await apiClient.patch<Book>(`/library/books/${id}/`, values);
  return data;
}

export async function deleteBook(id: string): Promise<void> {
  await apiClient.delete(`/library/books/${id}/`);
}

export async function fetchBookCopies(params: PageParams & BookCopyListParams): Promise<PaginatedResponse<BookCopy>> {
  const { data } = await apiClient.get<PaginatedResponse<BookCopy>>("/library/copies/", { params });
  return data;
}

export async function getBookCopy(id: string): Promise<BookCopy> {
  const { data } = await apiClient.get<BookCopy>(`/library/copies/${id}/`);
  return data;
}

export async function createBookCopy(values: BookCopyPayload): Promise<BookCopy> {
  const { data } = await apiClient.post<BookCopy>("/library/copies/", values);
  return data;
}

export async function updateBookCopy(id: string, values: BookCopyPayload): Promise<BookCopy> {
  const { data } = await apiClient.patch<BookCopy>(`/library/copies/${id}/`, values);
  return data;
}

export async function deleteBookCopy(id: string): Promise<void> {
  await apiClient.delete(`/library/copies/${id}/`);
}

export async function fetchLoans(params: PageParams & BookLoanListParams): Promise<PaginatedResponse<BookLoan>> {
  const { data } = await apiClient.get<PaginatedResponse<BookLoan>>("/library/loans/", { params });
  return data;
}

export async function getLoan(id: string): Promise<BookLoan> {
  const { data } = await apiClient.get<BookLoan>(`/library/loans/${id}/`);
  return data;
}

export async function checkoutBook(values: CheckoutPayload): Promise<BookLoan> {
  const { data } = await apiClient.post<{ loan: BookLoan }>("/library/loans/", values);
  return data.loan;
}

export async function returnLoan(id: string): Promise<BookLoan> {
  const { data } = await apiClient.post<{ loan: BookLoan }>(`/library/loans/${id}/return/`);
  return data.loan;
}

export async function renewLoan(id: string): Promise<BookLoan> {
  const { data } = await apiClient.post<{ loan: BookLoan }>(`/library/loans/${id}/renew/`);
  return data.loan;
}

export async function fetchReservations(
  params: PageParams & BookReservationListParams,
): Promise<PaginatedResponse<BookReservation>> {
  const { data } = await apiClient.get<PaginatedResponse<BookReservation>>("/library/reservations/", { params });
  return data;
}

/** Unlike loan checkout (a custom `create()` that calls a service function), reservation
 * creation is the default `ModelViewSet.create()` — a plain, unwrapped serializer response, not
 * `{reservation: {...}}` like the `cancel`/`fulfill` actions below. */
export async function createReservation(values: ReservationPayload): Promise<BookReservation> {
  const { data } = await apiClient.post<BookReservation>("/library/reservations/", values);
  return data;
}

export async function cancelReservation(id: string): Promise<BookReservation> {
  const { data } = await apiClient.post<{ reservation: BookReservation }>(`/library/reservations/${id}/cancel/`);
  return data.reservation;
}

export async function fulfillReservation(id: string): Promise<BookReservation> {
  const { data } = await apiClient.post<{ reservation: BookReservation }>(`/library/reservations/${id}/fulfill/`);
  return data.reservation;
}

export async function approveReservation(id: string, note = ""): Promise<BookReservation> {
  const { data } = await apiClient.post<{ reservation: BookReservation }>(`/library/reservations/${id}/approve/`, { note });
  return data.reservation;
}

export async function rejectReservation(id: string, note = ""): Promise<BookReservation> {
  const { data } = await apiClient.post<{ reservation: BookReservation }>(`/library/reservations/${id}/reject/`, { note });
  return data.reservation;
}

// ---- a student's or teacher's own library ----------------------------------------------------------------------

export async function fetchCatalog(params: { search?: string }): Promise<CatalogBook[]> {
  const { data } = await apiClient.get<{ books: CatalogBook[] }>("/library/catalog/", { params });
  return data.books;
}

export async function reserveBook(bookId: string): Promise<void> {
  await apiClient.post(`/library/catalog/${bookId}/reserve/`);
}

export async function borrowBook(bookId: string): Promise<void> {
  await apiClient.post(`/library/catalog/${bookId}/borrow/`);
}

export async function fetchMyLibrary(): Promise<{ reservations: BookReservation[]; loans: MyLoan[] }> {
  const { data } = await apiClient.get<{ reservations: BookReservation[]; loans: MyLoan[] }>("/library/my/");
  return data;
}

export async function cancelMyReservation(id: string): Promise<void> {
  await apiClient.post(`/library/my/reservations/${id}/cancel/`);
}
