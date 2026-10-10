import type { FieldValues, UseFormSetError } from "react-hook-form";

import type { ApiError } from "@/lib/api-client";

/** Maps a field-tagged API error onto the matching form field via react-hook-form's
 * `setError`, so a server-side conflict (e.g. a duplicate name, a scheduling clash) shows up
 * right under the offending input instead of only as a generic banner. Returns `true` when at
 * least one error was attached to a field — the caller should fall back to showing
 * `err.message` in an `Alert` when this returns `false` (an error with no field tag, or one
 * that doesn't match any known form field). */
export function applyFieldErrors<T extends FieldValues>(
  err: ApiError,
  setError: UseFormSetError<T>,
  knownFields: ReadonlySet<string>,
): boolean {
  const fieldErrors = err.errors.filter((e) => e.field && knownFields.has(e.field));
  for (const fieldError of fieldErrors) {
    setError(fieldError.field as never, { message: fieldError.message });
  }
  return fieldErrors.length > 0;
}

/** The best single message for a generic banner, when `applyFieldErrors` found nothing to
 * attach to a field. Prefers the first entry in `errors` over the top-level `message` — DRF's
 * exception handler reduces `message` to a generic "Validation failed." the moment *any* error
 * is tagged to a field, and that includes `non_field_errors` (a whole-form error, e.g. "this
 * record already exists," that's still specific — just not about one particular input). */
export function generalErrorMessage(err: ApiError): string {
  return err.errors[0]?.message ?? err.message;
}
