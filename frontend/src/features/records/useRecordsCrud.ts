import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { createRecord, deleteRecord, fetchRecords, getRecord, updateRecord } from "./api";
import type { RecordListParams, RecordPayload, SchoolRecord } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const RECORDS_KEY = ["records", "records"] as const;

export function useRecordList(params: PageParams & RecordListParams) {
  return useQuery({
    queryKey: [...RECORDS_KEY, "list", params],
    queryFn: () => fetchRecords(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useRecord(id: string | undefined) {
  return useQuery<SchoolRecord, ApiError>({
    queryKey: [...RECORDS_KEY, "detail", id],
    queryFn: () => getRecord(id as string),
    enabled: !!id,
  });
}

export function useCreateRecord() {
  const queryClient = useQueryClient();
  return useMutation<SchoolRecord, ApiError, RecordPayload>({
    mutationFn: createRecord,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECORDS_KEY }),
  });
}

export function useUpdateRecord(id: string) {
  const queryClient = useQueryClient();
  return useMutation<SchoolRecord, ApiError, RecordPayload>({
    mutationFn: (values) => updateRecord(id, values),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: RECORDS_KEY });
      queryClient.setQueryData([...RECORDS_KEY, "detail", id], record);
    },
  });
}

export function useDeleteRecord() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteRecord,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECORDS_KEY }),
  });
}
