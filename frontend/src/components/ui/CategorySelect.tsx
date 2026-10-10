import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { type FormOptionField } from "@/features/formoptions/api";
import { type CategoryChoice, OTHER_VALUE } from "@/features/formoptions/constants";
import { useFormOptions } from "@/features/formoptions/useFormOptions";

/** A category dropdown that can grow: the built-in choices, then whatever this school has added, then
 * "Other". Choosing "Other" opens a text box right under the dropdown; the parent form turns that text
 * into a real option when it saves (see `useResolveCategory`) — so it joins the list for every later
 * form — and uses it as the value. `builtin` should include the model's own "other" entry or not; it's
 * always shown last as "Other" either way. */
export function CategorySelect({
  field,
  label,
  builtin,
  value,
  onChange,
  otherText,
  onOtherTextChange,
  error,
  allLabel,
}: {
  field: FormOptionField;
  label?: string;
  builtin: CategoryChoice[];
  value: string;
  onChange: (value: string) => void;
  otherText: string;
  onOtherTextChange: (text: string) => void;
  error?: string;
  /** For filter dropdowns: adds a leading empty "All categories" entry and hides the "Other" text box. */
  allLabel?: string;
}) {
  const { data: custom } = useFormOptions(field);
  const isFilter = allLabel !== undefined;
  const known = new Set(builtin.map((choice) => choice.value));
  const extras = (custom ?? []).filter((option) => !known.has(option.value));

  return (
    <div className="flex flex-col gap-3">
      <Select
        label={label}
        aria-label={label ? undefined : "Category"}
        value={value}
        error={error}
        onChange={(e) => onChange(e.target.value)}
      >
        {isFilter && <option value="">{allLabel}</option>}
        {builtin
          .filter((choice) => choice.value !== OTHER_VALUE)
          .map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        {extras.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        <option value={OTHER_VALUE}>Other</option>
      </Select>
      {!isFilter && value === OTHER_VALUE && (
        <Input
          label="Name this category"
          placeholder="e.g. Canteen food"
          value={otherText}
          maxLength={100}
          onChange={(e) => onOtherTextChange(e.target.value)}
          hint="It's saved to this list, so you and others can pick it next time. Leave blank to file it under plain “Other”."
        />
      )}
    </div>
  );
}
