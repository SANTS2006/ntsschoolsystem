import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  approveReservation,
  borrowBook,
  cancelMyReservation,
  cancelReservation,
  fetchCatalog,
  fetchMyLibrary,
  rejectReservation,
  reserveBook,
  checkoutBook,
  createBook,
  createBookCategory,
  createBookCopy,
  createReservation,
  deleteBook,
  deleteBookCategory,
  deleteBookCopy,
  fetchBookCategories,
  fetchBookCopies,
  fetchBooks,
  fetchLoans,
  fetchReservations,
  fulfillReservation,
  getBook,
  getBookCategory,
  getBookCopy,
  getLoan,
  renewLoan,
  returnLoan,
  updateBook,
  updateBookCategory,
  updateBookCopy,
} from "./api";
import type {
  Book,
  CatalogBook,
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
  BookReservationListParams,
  CheckoutPayload,
  ReservationPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const CATEGORIES_KEY = ["library", "categories"] as const;
const BOOKS_KEY = ["library", "books"] as const;
const COPIES_KEY = ["library", "copies"] as const;
const LOANS_KEY = ["library", "loans"] as const;
const RESERVATIONS_KEY = ["library", "reservations"] as const;

export function useBookCategoryList(params: PageParams & { search?: string }) {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, "list", params],
    queryFn: () => fetchBookCategories(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useBookCategory(id: string | undefined) {
  return useQuery<BookCategory, ApiError>({
    queryKey: [...CATEGORIES_KEY, "detail", id],
    queryFn: () => getBookCategory(id as string),
    enabled: !!id,
  });
}

export function useCreateBookCategory() {
  const queryClient = useQueryClient();
  return useMutation<BookCategory, ApiError, BookCategoryPayload>({
    mutationFn: createBookCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useUpdateBookCategory(id: string) {
  const queryClient = useQueryClient();
  return useMutation<BookCategory, ApiError, BookCategoryPayload>({
    mutationFn: (values) => updateBookCategory(id, values),
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      queryClient.setQueryData([...CATEGORIES_KEY, "detail", id], category);
    },
  });
}

export function useDeleteBookCategory() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteBookCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useBookList(params: PageParams & BookListParams) {
  return useQuery({
    queryKey: [...BOOKS_KEY, "list", params],
    queryFn: () => fetchBooks(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useBook(id: string | undefined) {
  return useQuery<Book, ApiError>({
    queryKey: [...BOOKS_KEY, "detail", id],
    queryFn: () => getBook(id as string),
    enabled: !!id,
  });
}

export function useCreateBook() {
  const queryClient = useQueryClient();
  return useMutation<Book, ApiError, BookPayload>({
    mutationFn: createBook,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BOOKS_KEY }),
  });
}

export function useUpdateBook(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Book, ApiError, BookPayload>({
    mutationFn: (values) => updateBook(id, values),
    onSuccess: (book) => {
      queryClient.invalidateQueries({ queryKey: BOOKS_KEY });
      queryClient.setQueryData([...BOOKS_KEY, "detail", id], book);
    },
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteBook,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BOOKS_KEY }),
  });
}

export function useBookCopyList(params: PageParams & BookCopyListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...COPIES_KEY, "list", params],
    queryFn: () => fetchBookCopies(params),
    enabled: options?.enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useBookCopy(id: string | undefined) {
  return useQuery<BookCopy, ApiError>({
    queryKey: [...COPIES_KEY, "detail", id],
    queryFn: () => getBookCopy(id as string),
    enabled: !!id,
  });
}

export function useCreateBookCopy() {
  const queryClient = useQueryClient();
  return useMutation<BookCopy, ApiError, BookCopyPayload>({
    mutationFn: createBookCopy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COPIES_KEY }),
  });
}

export function useUpdateBookCopy(id: string) {
  const queryClient = useQueryClient();
  return useMutation<BookCopy, ApiError, BookCopyPayload>({
    mutationFn: (values) => updateBookCopy(id, values),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: COPIES_KEY });
      queryClient.setQueryData([...COPIES_KEY, "detail", id], copy);
    },
  });
}

export function useDeleteBookCopy() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteBookCopy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COPIES_KEY }),
  });
}

export function useLoanList(params: PageParams & BookLoanListParams) {
  return useQuery({
    queryKey: [...LOANS_KEY, "list", params],
    queryFn: () => fetchLoans(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useLoan(id: string | undefined) {
  return useQuery<BookLoan, ApiError>({
    queryKey: [...LOANS_KEY, "detail", id],
    queryFn: () => getLoan(id as string),
    enabled: !!id,
  });
}

export function useCheckoutBook() {
  const queryClient = useQueryClient();
  return useMutation<BookLoan, ApiError, CheckoutPayload>({
    mutationFn: checkoutBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LOANS_KEY });
      queryClient.invalidateQueries({ queryKey: COPIES_KEY });
      queryClient.invalidateQueries({ queryKey: BOOKS_KEY });
    },
  });
}

export function useReturnLoan() {
  const queryClient = useQueryClient();
  return useMutation<BookLoan, ApiError, string>({
    mutationFn: returnLoan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LOANS_KEY });
      queryClient.invalidateQueries({ queryKey: COPIES_KEY });
      queryClient.invalidateQueries({ queryKey: BOOKS_KEY });
    },
  });
}

export function useRenewLoan() {
  const queryClient = useQueryClient();
  return useMutation<BookLoan, ApiError, string>({
    mutationFn: renewLoan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LOANS_KEY }),
  });
}

export function useReservationList(params: PageParams & BookReservationListParams) {
  return useQuery({
    queryKey: [...RESERVATIONS_KEY, "list", params],
    queryFn: () => fetchReservations(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateReservation() {
  const queryClient = useQueryClient();
  return useMutation<BookReservation, ApiError, ReservationPayload>({
    mutationFn: createReservation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RESERVATIONS_KEY }),
  });
}

export function useCancelReservation() {
  const queryClient = useQueryClient();
  return useMutation<BookReservation, ApiError, string>({
    mutationFn: cancelReservation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RESERVATIONS_KEY }),
  });
}

export function useFulfillReservation() {
  const queryClient = useQueryClient();
  return useMutation<BookReservation, ApiError, string>({
    mutationFn: fulfillReservation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RESERVATIONS_KEY }),
  });
}

export function useApproveReservation() {
  const queryClient = useQueryClient();
  return useMutation<BookReservation, ApiError, { id: string; note?: string }>({
    mutationFn: ({ id, note }) => approveReservation(id, note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RESERVATIONS_KEY }),
  });
}

export function useRejectReservation() {
  const queryClient = useQueryClient();
  return useMutation<BookReservation, ApiError, { id: string; note?: string }>({
    mutationFn: ({ id, note }) => rejectReservation(id, note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RESERVATIONS_KEY }),
  });
}

const MY_LIBRARY_KEY = ["library", "my"] as const;

export function useCatalog(search: string) {
  return useQuery<CatalogBook[], ApiError>({
    queryKey: [...MY_LIBRARY_KEY, "catalog", search],
    queryFn: () => fetchCatalog({ search: search || undefined }),
  });
}

export function useMyLibrary() {
  return useQuery({ queryKey: [...MY_LIBRARY_KEY, "mine"], queryFn: fetchMyLibrary });
}

export function useReserveBook() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: reserveBook,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_LIBRARY_KEY }),
  });
}

export function useBorrowBook() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: borrowBook,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_LIBRARY_KEY }),
  });
}

export function useCancelMyReservation() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: cancelMyReservation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_LIBRARY_KEY }),
  });
}
