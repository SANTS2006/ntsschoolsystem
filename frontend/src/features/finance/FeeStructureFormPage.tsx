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
import { useTermList } from "@/features/academics/useAcademicsCrud";
import { useAcademicYears, useSchoolClasses } from "@/features/academics/useAcademicsLookups";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreateFeeStructure, useFeeStructure, useUpdateFeeStructure } from "./useFeesCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  academic_year: z.string().min(1, "Academic year is required"),
  term: z.string(),
  school_class: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { name: "", academic_year: "", term: "", school_class: "" };
const FIELD_KEYS = new Set(["name", "academic_year", "term", "school_class"]);

export function FeeStructureFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: structure, isLoading: isLoadingStructure } = useFeeStructure(id);
  const { data: academicYears } = useAcademicYears();
  const { data: terms } = useTermList({ page_size: 100 });
  const { data: schoolClasses } = useSchoolClasses();
  const createStructure = useCreateFeeStructure();
  const updateStructure = useUpdateFeeStructure(id ?? "");
  const mutation = isEditMode ? updateStructure : createStructure;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (structure) {
      reset({
        name: structure.name,
        academic_year: structure.academic_year,
        term: structure.term ?? "",
        school_class: structure.school_class ?? "",
      });
    }
  }, [structure, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        name: values.name,
        academic_year: values.academic_year,
        term: values.term || undefined,
        school_class: values.school_class || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Fee structure updated" : "Fee structure created" });
          navigate("/finance/structures");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save fee structure", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingStructure) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit fee structure" : "New fee structure"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Fee structure details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="2025/2026 Tuition Plan" error={errors.name?.message} {...register("name")} />
            <Select label="Academic year" error={errors.academic_year?.message} {...register("academic_year")}>
              <option value="">Select an academic year</option>
              {academicYears?.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </Select>
            <Select
              label="Term"
              hint="Leave unset for a structure that applies across the whole academic year."
              error={errors.term?.message}
              {...register("term")}
            >
              <option value="">Not set</option>
              {terms?.results.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name} ({term.academic_year_name})
                </option>
              ))}
            </Select>
            <Select
              label="Class"
              hint="Leave unset to apply this structure to all classes."
              error={errors.school_class?.message}
              {...register("school_class")}
            >
              <option value="">All classes</option>
              {schoolClasses?.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {schoolClass.name}
                </option>
              ))}
            </Select>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/finance/structures")}>
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
