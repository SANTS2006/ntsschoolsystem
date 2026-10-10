import { apiClient } from "@/lib/api-client";

/** Dropdowns that let a school add its own choices — keys match backend `formoptions.registry.FIELDS`. */
export type FormOptionField = "complaints.category" | "events.category" | "discipline.category";

export interface FormOption {
  value: string;
  label: string;
}

export async function fetchFormOptions(field: FormOptionField): Promise<FormOption[]> {
  const { data } = await apiClient.get<{ options: FormOption[] }>("/form-options/", { params: { field } });
  return data.options;
}

export async function addFormOption(field: FormOptionField, label: string): Promise<FormOption> {
  const { data } = await apiClient.post<{ option: FormOption }>("/form-options/", { field, label });
  return data.option;
}
