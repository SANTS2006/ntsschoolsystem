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
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreateRoute, useRoute, useUpdateRoute, useVehicleList } from "./useTransportCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  vehicle: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { name: "", description: "", vehicle: "" };
const FIELD_KEYS = new Set(["name", "description", "vehicle"]);

export function RouteFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: route, isLoading: isLoadingRoute } = useRoute(id);
  const { data: vehicles } = useVehicleList({ page_size: 100 });
  const createRoute = useCreateRoute();
  const updateRoute = useUpdateRoute(id ?? "");
  const mutation = isEditMode ? updateRoute : createRoute;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (route) {
      reset({ name: route.name, description: route.description, vehicle: route.vehicle ?? "" });
    }
  }, [route, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        name: values.name,
        description: values.description || undefined,
        vehicle: values.vehicle || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Route updated" : "Route created" });
          navigate("/transport/routes");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save route", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingRoute) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit route" : "New route"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Route details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="North Loop" error={errors.name?.message} {...register("name")} />
            <Input label="Description" error={errors.description?.message} {...register("description")} />
            <Select label="Vehicle" error={errors.vehicle?.message} {...register("vehicle")}>
              <option value="">Not set</option>
              {vehicles?.results.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.registration_number}
                </option>
              ))}
            </Select>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/transport/routes")}>
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
