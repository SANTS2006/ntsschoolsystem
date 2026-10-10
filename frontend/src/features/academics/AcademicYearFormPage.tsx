import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";

import { useAcademicYear, useCreateAcademicYear, useUpdateAcademicYear } from "./useAcademicsCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  is_current: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { name: "", start_date: "", end_date: "", is_current: false };

export function AcademicYearFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: year, isLoading: isLoadingYear } = useAcademicYear(id);
  const createAcademicYear = useCreateAcademicYear();
  const updateAcademicYear = useUpdateAcademicYear(id ?? "");
  const mutation = isEditMode ? updateAcademicYear : createAcademicYear;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (year) {
      reset({ name: year.name, start_date: year.start_date, end_date: year.end_date, is_current: year.is_current });
    }
  }, [year, reset]);

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values, {
      onSuccess: () => {
        showToast({ title: isEditMode ? "Academic year updated" : "Academic year created" });
        navigate("/academics/years");
      },
      onError: (err: ApiError) => {
        showToast({ title: "Could not save academic year", description: err.message, tone: "danger" });
      },
    });
  };

  if (isEditMode && isLoadingYear) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit academic year" : "New academic year"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Academic year details</CardTitle>
        </CardHeader>
        <CardContent>
          {mutation.isError && (
            <Alert tone="danger" className="mb-4">
              {(mutation.error as ApiError).message}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="2025/2026" error={errors.name?.message} {...register("name")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="date" label="Start date" error={errors.start_date?.message} {...register("start_date")} />
              <Input type="date" label="End date" error={errors.end_date?.message} {...register("end_date")} />
            </div>
            <Checkbox
              label="Current academic year"
              hint="Marks this as the school's active academic year."
              {...register("is_current")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/academics/years")}>
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
