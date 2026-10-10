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
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useAcademicYears } from "@/features/academics/useAcademicsLookups";
import type { ApiError } from "@/lib/api-client";

import { useCreateTerm, useTerm, useUpdateTerm } from "./useAcademicsCrud";

const schema = z.object({
  academic_year: z.string().min(1, "Academic year is required"),
  name: z.string().min(1, "Name is required"),
  sequence: z.coerce.number().int().min(1, "Sequence must be at least 1"),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  is_current: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  academic_year: "",
  name: "",
  sequence: 1,
  start_date: "",
  end_date: "",
  is_current: false,
};

export function TermFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: term, isLoading: isLoadingTerm } = useTerm(id);
  const { data: academicYears } = useAcademicYears();
  const createTerm = useCreateTerm();
  const updateTerm = useUpdateTerm(id ?? "");
  const mutation = isEditMode ? updateTerm : createTerm;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (term) {
      reset({
        academic_year: term.academic_year,
        name: term.name,
        sequence: term.sequence,
        start_date: term.start_date,
        end_date: term.end_date,
        is_current: term.is_current,
      });
    }
  }, [term, reset]);

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values, {
      onSuccess: () => {
        showToast({ title: isEditMode ? "Term updated" : "Term created" });
        navigate("/academics/terms");
      },
      onError: (err: ApiError) => {
        showToast({ title: "Could not save term", description: err.message, tone: "danger" });
      },
    });
  };

  if (isEditMode && isLoadingTerm) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit term" : "New term"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Term details</CardTitle>
        </CardHeader>
        <CardContent>
          {mutation.isError && (
            <Alert tone="danger" className="mb-4">
              {(mutation.error as ApiError).message}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select label="Academic year" error={errors.academic_year?.message} {...register("academic_year")}>
              <option value="">Select an academic year</option>
              {academicYears?.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Name" placeholder="Term 1" error={errors.name?.message} {...register("name")} />
              <Input
                type="number"
                min={1}
                label="Sequence"
                hint="1st, 2nd, 3rd... within this academic year."
                error={errors.sequence?.message}
                {...register("sequence")}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="date" label="Start date" error={errors.start_date?.message} {...register("start_date")} />
              <Input type="date" label="End date" error={errors.end_date?.message} {...register("end_date")} />
            </div>
            <Checkbox
              label="Current term"
              hint="Marks this as the active term within its academic year."
              {...register("is_current")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/academics/terms")}>
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
