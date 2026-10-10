import type { FormOptionField } from "./api";
import { OTHER_VALUE } from "./constants";
import { useAddFormOption } from "./useFormOptions";

/** Turns what the user left in a `CategorySelect` into the value to save. Anything other than "Other"
 * with text typed is returned as-is; "Other" with a name typed is first added to the school's list
 * (the backend reuses an existing entry if the name matches one) and the new option's value returned. */
export function useResolveCategory(field: FormOptionField) {
  const add = useAddFormOption(field);
  return async (value: string, otherText: string): Promise<string> => {
    const text = otherText.trim();
    if (value !== OTHER_VALUE || !text) return value;
    const option = await add.mutateAsync(text);
    return option.value;
  };
}
