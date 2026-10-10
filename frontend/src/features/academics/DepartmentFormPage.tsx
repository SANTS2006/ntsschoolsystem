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
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";

import { useCreateDepartment, useDepartment, useUpdateDepartment } from "./useAcademicsCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { name: "", code: "" };

export function DepartmentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: department, isLoading: isLoadingDepartment } = useDepartment(id);
  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment(id ?? "");
  const mutation = isEditMode ? updateDepartment : createDepartment;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (department) {
      reset({ name: department.name, code: department.code });
    }
  }, [department, reset]);

  const onSubmit = (values: FormValues) => {
    mutation.mutate(
      { name: values.name, code: values.code || undefined },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Department updated" : "Department created" });
          navigate("/academics/departments");
        },
        onError: (err: ApiError) => {
          showToast({ title: "Could not save department", description: err.message, tone: "danger" });
        },
      },
    );
  };

  if (isEditMode && isLoadingDepartment) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit department" : "New department"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Department details</CardTitle>
        </CardHeader>
        <CardContent>
          {mutation.isError && (
            <Alert tone="danger" className="mb-4">
              {(mutation.error as ApiError).message}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="Sciences" error={errors.name?.message} {...register("name")} />
            <Input label="Code" placeholder="SCI" error={errors.code?.message} {...register("code")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/academics/departments")}>
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
