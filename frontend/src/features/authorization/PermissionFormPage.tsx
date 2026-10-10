import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreatePermission } from "./useRolesCrud";

const schema = z.object({
  code: z.string().min(1, "Code is required").regex(/^[a-z0-9_]+\.[a-z0-9_]+$/, "Use the form module.action, e.g. library.custom_action"),
  name: z.string().min(1, "Name is required"),
  module: z.string().min(1, "Module is required"),
  description: z.string(),
});
type FormValues = z.infer<typeof schema>;

const FIELD_KEYS = new Set(["code", "name", "module", "description"]);

export function PermissionFormPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createPermission = useCreatePermission();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: "", name: "", module: "", description: "" },
  });

  const onSubmit = (values: FormValues) => {
    createPermission.mutate(
      { code: values.code, name: values.name, module: values.module, description: values.description || undefined },
      {
        onSuccess: () => {
          showToast({ title: "Permission created" });
          navigate("/permissions");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            showToast({ title: "Could not create permission", description: generalErrorMessage(err), tone: "danger" });
          }
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">New permission</h1>

      <Card>
        <CardHeader>
          <CardTitle>Permission details</CardTitle>
        </CardHeader>
        <CardContent>
          {createPermission.isError && !Object.keys(errors).length && (
            <Alert tone="danger" className="mb-4">
              {generalErrorMessage(createPermission.error as ApiError)}
            </Alert>
          )}
          <p className="mb-4 text-sm text-[var(--color-text-muted)]">
            This only takes effect once the app's own code checks it somewhere — creating a permission here doesn't
            gate anything by itself.
          </p>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Code" placeholder="library.custom_action" hint="module.action, lowercase" error={errors.code?.message} {...register("code")} />
            <Input label="Name" placeholder="Custom action" error={errors.name?.message} {...register("name")} />
            <Input label="Module" placeholder="library" error={errors.module?.message} {...register("module")} />
            <Input label="Description" error={errors.description?.message} {...register("description")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/permissions")}>
                Cancel
              </Button>
              <Button type="submit" isLoading={createPermission.isPending}>
                {!createPermission.isPending && <Save className="size-4" aria-hidden="true" />}
                Create
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
