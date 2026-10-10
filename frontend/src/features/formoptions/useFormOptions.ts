import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { addFormOption, fetchFormOptions, type FormOption, type FormOptionField } from "./api";

const KEY = ["form-options"] as const;

/** The choices this school has added to a dropdown (the built-in ones live in the form itself). */
export function useFormOptions(field: FormOptionField) {
  return useQuery<FormOption[], ApiError>({
    queryKey: [...KEY, field],
    queryFn: () => fetchFormOptions(field),
    staleTime: 60_000,
  });
}

export function useAddFormOption(field: FormOptionField) {
  const queryClient = useQueryClient();
  return useMutation<FormOption, ApiError, string>({
    mutationFn: (label) => addFormOption(field, label),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...KEY, field] }),
  });
}
