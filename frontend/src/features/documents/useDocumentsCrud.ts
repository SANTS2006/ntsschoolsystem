import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  createCategory,
  createDocument,
  deleteCategory,
  deleteDocument,
  fetchCategories,
  fetchDocuments,
  fetchMyDocuments,
  getCategory,
  getDocument,
  updateCategory,
  updateDocument,
} from "./api";
import type {
  Document,
  DocumentCategory,
  DocumentCategoryListParams,
  DocumentCategoryPayload,
  DocumentListParams,
  DocumentPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const CATEGORIES_KEY = ["documents", "categories"] as const;
const DOCUMENTS_KEY = ["documents", "documents"] as const;

export function useCategoryList(params: PageParams & DocumentCategoryListParams) {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, "list", params],
    queryFn: () => fetchCategories(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useCategory(id: string | undefined) {
  return useQuery<DocumentCategory, ApiError>({
    queryKey: [...CATEGORIES_KEY, "detail", id],
    queryFn: () => getCategory(id as string),
    enabled: !!id,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation<DocumentCategory, ApiError, DocumentCategoryPayload>({
    mutationFn: createCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useUpdateCategory(id: string) {
  const queryClient = useQueryClient();
  return useMutation<DocumentCategory, ApiError, DocumentCategoryPayload>({
    mutationFn: (values) => updateCategory(id, values),
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      queryClient.setQueryData([...CATEGORIES_KEY, "detail", id], category);
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useDocumentList(params: PageParams & DocumentListParams) {
  return useQuery({
    queryKey: [...DOCUMENTS_KEY, "list", params],
    queryFn: () => fetchDocuments(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useDocument(id: string | undefined) {
  return useQuery<Document, ApiError>({
    queryKey: [...DOCUMENTS_KEY, "detail", id],
    queryFn: () => getDocument(id as string),
    enabled: !!id,
  });
}

export function useCreateDocument(onProgress?: (percent: number) => void) {
  const queryClient = useQueryClient();
  return useMutation<Document, ApiError, DocumentPayload>({
    mutationFn: (values) => createDocument(values, onProgress),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY }),
  });
}

export function useUpdateDocument(id: string, onProgress?: (percent: number) => void) {
  const queryClient = useQueryClient();
  return useMutation<Document, ApiError, DocumentPayload>({
    mutationFn: (values) => updateDocument(id, values, onProgress),
    onSuccess: (document) => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY });
      queryClient.setQueryData([...DOCUMENTS_KEY, "detail", id], document);
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY }),
  });
}

export function useMyDocuments() {
  return useQuery<Document[], ApiError>({
    queryKey: ["documents", "my-documents"],
    queryFn: fetchMyDocuments,
  });
}
