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
import { useStaffLookup } from "@/features/staff/useStaffLookups";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreateVehicle, useUpdateVehicle, useVehicle } from "./useTransportCrud";

const schema = z.object({
  registration_number: z.string().min(1, "Registration number is required"),
  make_model: z.string(),
  capacity: z.coerce.number().int().min(0, "Capacity cannot be negative"),
  driver: z.string(),
  status: z.enum(["active", "maintenance", "retired"]),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  registration_number: "",
  make_model: "",
  capacity: 0,
  driver: "",
  status: "active",
};
const FIELD_KEYS = new Set(["registration_number", "make_model", "capacity", "driver", "status"]);

export function VehicleFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: vehicle, isLoading: isLoadingVehicle } = useVehicle(id);
  const { data: staff } = useStaffLookup("driver");
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle(id ?? "");
  const mutation = isEditMode ? updateVehicle : createVehicle;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (vehicle) {
      reset({
        registration_number: vehicle.registration_number,
        make_model: vehicle.make_model,
        capacity: vehicle.capacity,
        driver: vehicle.driver ?? "",
        status: vehicle.status,
      });
    }
  }, [vehicle, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        registration_number: values.registration_number,
        make_model: values.make_model || undefined,
        capacity: values.capacity,
        driver: values.driver || undefined,
        status: values.status,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Vehicle updated" : "Vehicle created" });
          navigate("/transport/vehicles");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save vehicle", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingVehicle) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit vehicle" : "New vehicle"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input
              label="Registration number"
              placeholder="KDA 123B"
              error={errors.registration_number?.message}
              {...register("registration_number")}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Make / model" placeholder="Toyota Hiace" error={errors.make_model?.message} {...register("make_model")} />
              <Input type="number" label="Capacity" error={errors.capacity?.message} {...register("capacity")} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Driver" error={errors.driver?.message} {...register("driver")}>
                <option value="">Not set</option>
                {staff?.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name}
                  </option>
                ))}
              </Select>
              <Select label="Status" error={errors.status?.message} {...register("status")}>
                <option value="active">Active</option>
                <option value="maintenance">In maintenance</option>
                <option value="retired">Retired</option>
              </Select>
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/transport/vehicles")}>
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
