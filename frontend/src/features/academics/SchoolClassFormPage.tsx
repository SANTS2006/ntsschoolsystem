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
import type { ApiError } from "@/lib/api-client";

import { useSchoolClasses } from "./useAcademicsLookups";
import { useCreateSchoolClass, useSchoolClass, useUpdateSchoolClass } from "./useAcademicsCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  order: z.coerce.number().int().min(0, "Order must be zero or greater"),
  next_class: z.string(),
  is_public_exam_transition: z.boolean(),
  is_graduation_level: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  name: "", order: 0, next_class: "", is_public_exam_transition: false, is_graduation_level: false,
};

export function SchoolClassFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: schoolClass, isLoading: isLoadingClass } = useSchoolClass(id);
  const { data: allClasses } = useSchoolClasses();
  const createSchoolClass = useCreateSchoolClass();
  const updateSchoolClass = useUpdateSchoolClass(id ?? "");
  const mutation = isEditMode ? updateSchoolClass : createSchoolClass;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (schoolClass) {
      reset({
        name: schoolClass.name,
        order: schoolClass.order,
        next_class: schoolClass.next_class ?? "",
        is_public_exam_transition: schoolClass.is_public_exam_transition,
        is_graduation_level: schoolClass.is_graduation_level,
      });
    }
  }, [schoolClass, reset]);

  const onSubmit = (values: FormValues) => {
    mutation.mutate(
      {
        name: values.name,
        order: values.order,
        next_class: values.next_class || null,
        is_public_exam_transition: values.is_public_exam_transition,
        is_graduation_level: values.is_graduation_level,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Class updated" : "Class created" });
          navigate("/academics/classes");
        },
        onError: (err: ApiError) => {
          showToast({ title: "Could not save class", description: err.message, tone: "danger" });
        },
      },
    );
  };

  if (isEditMode && isLoadingClass) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit class" : "New class"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Class details</CardTitle>
        </CardHeader>
        <CardContent>
          {mutation.isError && (
            <Alert tone="danger" className="mb-4">
              {(mutation.error as ApiError).message}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="Grade 7" error={errors.name?.message} {...register("name")} />
            <Input
              type="number"
              label="Order"
              hint="Controls display order among classes (lowest first)."
              error={errors.order?.message}
              {...register("order")}
            />
            <Select
              label="Next class"
              hint="The class a passing student normally progresses into. Leave unset for a terminal class or if progression isn't configured yet."
              error={errors.next_class?.message}
              {...register("next_class")}
            >
              <option value="">Not set</option>
              {allClasses?.filter((c) => c.id !== id).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Checkbox
              label="Requires a public examination before promotion"
              hint="Internal results are shown but never auto-promote a student out of this class — promotion must be a deliberate manual action after the external exam."
              {...register("is_public_exam_transition")}
            />
            <Checkbox
              label="Graduation level"
              hint="A student completing this class graduates rather than progressing to another class."
              {...register("is_graduation_level")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/academics/classes")}>
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
