import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/toastContext";
import { useTermList } from "@/features/academics/useAcademicsCrud";
import { useAcademicYears } from "@/features/academics/useAcademicsLookups";
import { useFeeCategoryList } from "@/features/finance/useFeesCrud";
import { listStudents } from "@/features/students/api";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { useCreateInvoice } from "./useFeesCrud";

const LINE_TYPE_OPTIONS = ["charge", "discount", "scholarship", "waiver"] as const;

const lineItemSchema = z.object({
  fee_category: z.string(),
  line_type: z.enum(LINE_TYPE_OPTIONS),
  description: z.string(),
  amount: z.coerce.number().refine((value) => value !== 0, "Amount cannot be zero"),
});

const schema = z.object({
  student: z.string().min(1, "Student is required"),
  academic_year: z.string().min(1, "Academic year is required"),
  term: z.string(),
  due_date: z.string(),
  line_items: z.array(lineItemSchema).min(1, "Add at least one line item"),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_LINE_ITEM = { fee_category: "", line_type: "charge" as const, description: "", amount: 0 };

const EMPTY_VALUES: FormValues = {
  student: "",
  academic_year: "",
  term: "",
  due_date: "",
  line_items: [EMPTY_LINE_ITEM],
};

export function InvoiceFormPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: students } = useQuery({
    queryKey: ["students", "lookup", "active"],
    queryFn: () => listStudents({ status: "active", page_size: 100, ordering: "last_name" }),
  });
  const { data: academicYears } = useAcademicYears();
  const { data: terms } = useTermList({ page_size: 100 });
  const { data: categories } = useFeeCategoryList({ page_size: 100 });
  const createInvoice = useCreateInvoice();
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  const { fields, append, remove } = useFieldArray({ control, name: "line_items" });

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    createInvoice.mutate(
      {
        student: values.student,
        academic_year: values.academic_year,
        term: values.term || undefined,
        due_date: values.due_date || undefined,
        line_items: values.line_items.map((item) => ({
          fee_category: item.fee_category || undefined,
          line_type: item.line_type,
          description: item.description || undefined,
          amount: String(item.amount),
        })),
      },
      {
        onSuccess: (invoice) => {
          showToast({ title: "Invoice created" });
          navigate(`/finance/invoices/${invoice.id}`);
        },
        onError: (err: ApiError) => {
          // Nested line-item errors don't map cleanly onto a single form field (the create
          // endpoint takes a repeatable array, unlike every other form in this codebase), so
          // this always falls back to the general banner rather than guessing a field to
          // attach a nested error to.
          const message = generalErrorMessage(err);
          setGeneralError(message);
          showToast({ title: "Could not create invoice", description: message, tone: "danger" });
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">New invoice</h1>

      <Card>
        <CardHeader>
          <CardTitle>Invoice details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select label="Student" error={errors.student?.message} {...register("student")}>
              <option value="">Select a student</option>
              {students?.results.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name} ({student.admission_number})
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Academic year" error={errors.academic_year?.message} {...register("academic_year")}>
                <option value="">Select an academic year</option>
                {academicYears?.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </Select>
              <Select label="Term" error={errors.term?.message} {...register("term")}>
                <option value="">Not set</option>
                {terms?.results.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name} ({term.academic_year_name})
                  </option>
                ))}
              </Select>
            </div>
            <Input type="date" label="Due date" error={errors.due_date?.message} {...register("due_date")} />

            <div className="mt-2 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-[var(--color-text)]">Line items</h2>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => append(EMPTY_LINE_ITEM)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Add line
                </Button>
              </div>
              {errors.line_items?.message && (
                <p className="text-sm text-[var(--color-danger)]">{errors.line_items.message}</p>
              )}
              {fields.map((field, index) => (
                <div key={field.id} className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 sm:flex-row sm:items-end">
                  <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                    <Select label="Category" {...register(`line_items.${index}.fee_category`)}>
                      <option value="">Not set</option>
                      {categories?.results.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                    <Select label="Type" {...register(`line_items.${index}.line_type`)}>
                      {LINE_TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>
                          {type[0].toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </Select>
                    <Input label="Description" {...register(`line_items.${index}.description`)} />
                    <Input
                      type="number"
                      step="0.01"
                      label="Amount"
                      hint="Negative for a discount/scholarship/waiver."
                      error={errors.line_items?.[index]?.amount?.message}
                      {...register(`line_items.${index}.amount`)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                    aria-label="Remove line item"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/finance/invoices")}>
                Cancel
              </Button>
              <Button type="submit" isLoading={createInvoice.isPending}>
                {!createInvoice.isPending && <Save className="size-4" aria-hidden="true" />}
                Create invoice
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
