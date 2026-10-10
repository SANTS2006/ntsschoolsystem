import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import type { SalaryLineType } from "./types";
import {
  useCreateSalaryStructureItem,
  useSalaryStructure,
  useSalaryStructureItem,
  useUpdateSalaryStructureItem,
} from "./useSalaryCrud";

const LINE_TYPE_OPTIONS: SalaryLineType[] = ["basic", "allowance", "deduction"];

const schema = z.object({
  line_type: z.enum(["basic", "allowance", "deduction"]),
  description: z.string().min(1, "Description is required"),
  amount: z.coerce.number().gt(0, "Amount must be greater than zero"),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { line_type: "basic", description: "", amount: 0 };
const FIELD_KEYS = new Set(["line_type", "description", "amount"]);

export function SalaryStructureItemFormPage() {
  const { structureId, id } = useParams<{ structureId: string; id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: structure } = useSalaryStructure(structureId);
  const { data: item, isLoading: isLoadingItem } = useSalaryStructureItem(id);
  const createItem = useCreateSalaryStructureItem();
  const updateItem = useUpdateSalaryStructureItem(id ?? "");
  const mutation = isEditMode ? updateItem : createItem;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (item) {
      reset({ line_type: item.line_type, description: item.description, amount: Number(item.amount) });
    }
  }, [item, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        salary_structure: structureId as string,
        line_type: values.line_type,
        description: values.description,
        amount: String(values.amount),
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Line item updated" : "Line item added" });
          navigate(`/salary/structures/${structureId}/items`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save line item", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingItem) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit line item" : "New line item"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>{structure ? `For ${structure.name}` : "Line item details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select label="Type" error={errors.line_type?.message} {...register("line_type")}>
              {LINE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "basic" ? "Basic Pay" : option === "allowance" ? "Allowance" : "Deduction"}
                </option>
              ))}
            </Select>
            <Input
              label="Description"
              placeholder="Housing allowance"
              error={errors.description?.message}
              {...register("description")}
            />
            <Input type="number" step="0.01" label="Amount" error={errors.amount?.message} {...register("amount")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(`/salary/structures/${structureId}/items`)}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={mutation.isPending}>
                {!mutation.isPending && <Save className="size-4" aria-hidden="true" />}
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
