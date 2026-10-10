import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect } from "react";
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
import { useAcademicYears, useSchoolClasses } from "@/features/academics/useAcademicsLookups";
import { useStaffLookup } from "@/features/staff/useStaffLookups";
import type { ApiError } from "@/lib/api-client";

import { useCreateSection, useSection, useUpdateSection } from "./useAcademicsCrud";

const schema = z.object({
  school_class: z.string().min(1, "Class is required"),
  academic_year: z.string().min(1, "Academic year is required"),
  name: z.string().min(1, "Name is required"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
  class_teacher: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  school_class: "",
  academic_year: "",
  name: "",
  capacity: 40,
  class_teacher: "",
};

export function SectionFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: section, isLoading: isLoadingSection } = useSection(id);
  const { data: schoolClasses } = useSchoolClasses();
  const { data: academicYears } = useAcademicYears();
  const { data: staff } = useStaffLookup("teacher");
  const createSection = useCreateSection();
  const updateSection = useUpdateSection(id ?? "");
  const mutation = isEditMode ? updateSection : createSection;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (section) {
      reset({
        school_class: section.school_class,
        academic_year: section.academic_year,
        name: section.name,
        capacity: section.capacity,
        class_teacher: section.class_teacher ?? "",
      });
    }
  }, [section, reset]);

  const onSubmit = (values: FormValues) => {
    mutation.mutate(
      {
        school_class: values.school_class,
        academic_year: values.academic_year,
        name: values.name,
        capacity: values.capacity,
        class_teacher: values.class_teacher || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Section updated" : "Section created" });
          navigate("/academics/sections");
        },
        onError: (err: ApiError) => {
          showToast({ title: "Could not save section", description: err.message, tone: "danger" });
        },
      },
    );
  };

  if (isEditMode && isLoadingSection) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit section" : "New section"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Section details</CardTitle>
        </CardHeader>
        <CardContent>
          {mutation.isError && (
            <Alert tone="danger" className="mb-4">
              {(mutation.error as ApiError).message}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Class" error={errors.school_class?.message} {...register("school_class")}>
                <option value="">Select a class</option>
                {schoolClasses?.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}
                  </option>
                ))}
              </Select>
              <Select label="Academic year" error={errors.academic_year?.message} {...register("academic_year")}>
                <option value="">Select an academic year</option>
                {academicYears?.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </Select>
            </div>
            <Input label="Name" placeholder="A" error={errors.name?.message} {...register("name")} />
            <Input type="number" label="Capacity" error={errors.capacity?.message} {...register("capacity")} />
            <Select label="Class teacher" error={errors.class_teacher?.message} {...register("class_teacher")}>
              <option value="">Not set</option>
              {staff?.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                </option>
              ))}
            </Select>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/academics/sections")}>
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
