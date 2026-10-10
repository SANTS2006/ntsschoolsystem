import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreateRole } from "./useRolesCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
});
type FormValues = z.infer<typeof schema>;

const FIELD_KEYS = new Set(["name", "description"]);

/** New custom roles only — a system role's name can't be changed here (see RoleViewSet's
 * docstring), so editing one is done from its detail page's permission list instead. */
export function RoleFormPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createRole = useCreateRole();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: "", description: "" } });

  const onSubmit = (values: FormValues) => {
    createRole.mutate(
      { name: values.name, description: values.description || undefined },
      {
        onSuccess: (role) => {
          showToast({ title: "Role created" });
          navigate(`/roles/${role.id}`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            showToast({ title: "Could not create role", description: generalErrorMessage(err), tone: "danger" });
          }
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">New role</h1>

      <Card>
        <CardHeader>
          <CardTitle>Role details</CardTitle>
        </CardHeader>
        <CardContent>
          {createRole.isError && !Object.keys(errors).length && (
            <Alert tone="danger" className="mb-4">
              {generalErrorMessage(createRole.error as ApiError)}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="Librarian Assistant" error={errors.name?.message} {...register("name")} />
            <Input label="Description" error={errors.description?.message} {...register("description")} />
            <p className="text-xs text-[var(--color-text-muted)]">
              You'll choose which permissions this role grants on the next page.
            </p>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/roles")}>
                Cancel
              </Button>
              <Button type="submit" isLoading={createRole.isPending}>
                {!createRole.isPending && <Save className="size-4" aria-hidden="true" />}
                Create
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
