import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/toastContext";
import { useStaffList } from "@/features/staff/useStaffCrud";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";
import { MONTH_NAMES } from "@/lib/money";

import { useCreateAdjustment } from "./adjustments";

const schema = z.object({
  staff: z.string().min(1, "Choose a staff member"),
  kind: z.enum(["deduction", "addition"]),
  amount: z.string().refine((v) => Number(v) > 0, "Enter an amount above zero"),
  reason: z.string().trim().min(3, "State the reason"),
  period_year: z.coerce.number().int().min(2000).max(2100),
  period_month: z.coerce.number().int().min(1).max(12),
});

type FormValues = z.input<typeof schema>;

/** A one-off deduction (or addition) for one staff member and month, with the reason that the staff member will see. */
export function AdjustmentFormPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: staffMembers } = useStaffList({ page_size: 200, employment_status: "active" });
  const create = useCreateAdjustment();
  const [generalError, setGeneralError] = useState<string | null>(null);
  const now = new Date();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { staff: "", kind: "deduction", amount: "", reason: "", period_year: now.getFullYear(), period_month: now.getMonth() + 1 },
  });

  const onSubmit = (raw: FormValues) => {
    setGeneralError(null);
    const values = schema.parse(raw);
    create.mutate(values, {
      onSuccess: () => {
        showToast({ title: values.kind === "deduction" ? "Deduction saved — the staff member has been notified" : "Addition saved — the staff member has been notified" });
        navigate("/salary/adjustments");
      },
      onError: (err: ApiError) => {
        if (!applyFieldErrors(err, setError, new Set(["staff", "kind", "amount", "reason", "period_year", "period_month"]))) {
          const message = generalErrorMessage(err);
          setGeneralError(message);
          showToast({ title: "Could not save", description: message, tone: "danger" });
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Deduct from a salary</h1>
      {generalError && <Alert tone="danger">{generalError}</Alert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Select label="Staff member" error={errors.staff?.message} {...register("staff")}>
          <option value="">Select a staff member</option>
          {staffMembers?.results.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </Select>
        <Select label="Type" error={errors.kind?.message} {...register("kind")}>
          <option value="deduction">Deduction (takes money off)</option>
          <option value="addition">Addition (adds money)</option>
        </Select>
        <Input type="number" step="0.01" min="0" inputMode="decimal" label="Amount" error={errors.amount?.message} {...register("amount")} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Month" error={errors.period_month?.message} {...register("period_month")}>
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </Select>
          <Input type="number" label="Year" error={errors.period_year?.message} {...register("period_year")} />
        </div>
        <Input label="Reason" placeholder="Why is this being applied?" error={errors.reason?.message} {...register("reason")} />
        <p className="text-xs text-[var(--color-text-muted)]">
          The reason is shown to the staff member on their salary page, and they are notified as soon as you save.
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate("/salary/adjustments")}>
            Cancel
          </Button>
          <Button type="submit" isLoading={create.isPending}>
            {!create.isPending && <Save className="size-4" aria-hidden="true" />}
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
