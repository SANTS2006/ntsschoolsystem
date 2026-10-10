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
import { useStateFromSource } from "@/hooks/useStateFromSource";

import { useCreateSubject, useDepartmentList, useSubject, useUpdateSubject } from "./useAcademicsCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { name: "", code: "" };

export function SubjectFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: subject, isLoading: isLoadingSubject } = useSubject(id);
  const { data: departments } = useDepartmentList({ page_size: 100 });
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject(id ?? "");
  const mutation = isEditMode ? updateSubject : createSubject;

  // A subject can be offered by more than one department, so this is a checkbox group rather
  // than a react-hook-form-registered field — the same pattern the photo picker elsewhere in
  // this app uses for a value that isn't a plain input.
  const [selectedDepartments, setSelectedDepartments] = useStateFromSource(subject, (loaded) => loaded?.departments ?? []);
  const toggleDepartment = (departmentId: string) => {
    setSelectedDepartments((current) =>
      current.includes(departmentId) ? current.filter((id) => id !== departmentId) : [...current, departmentId],
    );
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (subject) {
      reset({ name: subject.name, code: subject.code });
    }
  }, [subject, reset]);

  const onSubmit = (values: FormValues) => {
    mutation.mutate(
      {
        name: values.name,
        code: values.code || undefined,
        departments: selectedDepartments,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Subject updated" : "Subject created" });
          navigate("/academics/subjects");
        },
        onError: (err: ApiError) => {
          showToast({ title: "Could not save subject", description: err.message, tone: "danger" });
        },
      },
    );
  };

  if (isEditMode && isLoadingSubject) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit subject" : "New subject"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Subject details</CardTitle>
        </CardHeader>
        <CardContent>
          {mutation.isError && (
            <Alert tone="danger" className="mb-4">
              {(mutation.error as ApiError).message}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="Mathematics" error={errors.name?.message} {...register("name")} />
            <Input label="Code" placeholder="MATH" error={errors.code?.message} {...register("code")} />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-text)]">Departments</span>
              <p className="text-xs text-[var(--color-text-muted)]">
                Select every department that offers this subject.
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 sm:grid-cols-3">
                {departments?.results.map((dept) => (
                  <Checkbox
                    key={dept.id}
                    label={dept.name}
                    checked={selectedDepartments.includes(dept.id)}
                    onChange={() => toggleDepartment(dept.id)}
                  />
                ))}
              </div>
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/academics/subjects")}>
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
