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
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreateMaintenanceRecord, useMaintenanceRecord, useUpdateMaintenanceRecord, useVehicle } from "./useTransportCrud";

const schema = z.object({
  date: z.string().min(1, "Date is required"),
  description: z.string().min(1, "Description is required"),
  cost: z.coerce.number().min(0, "Cost cannot be negative"),
  next_service_date: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { date: "", description: "", cost: 0, next_service_date: "" };
const FIELD_KEYS = new Set(["date", "description", "cost", "next_service_date"]);

export function VehicleMaintenanceFormPage() {
  const { vehicleId, id } = useParams<{ vehicleId: string; id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: vehicle } = useVehicle(vehicleId);
  const { data: record, isLoading: isLoadingRecord } = useMaintenanceRecord(id);
  const createRecord = useCreateMaintenanceRecord();
  const updateRecord = useUpdateMaintenanceRecord(id ?? "");
  const mutation = isEditMode ? updateRecord : createRecord;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (record) {
      reset({
        date: record.date,
        description: record.description,
        cost: Number(record.cost),
        next_service_date: record.next_service_date ?? "",
      });
    }
  }, [record, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        vehicle: vehicleId as string,
        date: values.date,
        description: values.description,
        cost: String(values.cost),
        next_service_date: values.next_service_date || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Record updated" : "Record added" });
          navigate(`/transport/vehicles/${vehicleId}/maintenance`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save record", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingRecord) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit maintenance record" : "New maintenance record"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>{vehicle ? `For ${vehicle.registration_number}` : "Record details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Description" placeholder="Oil change" error={errors.description?.message} {...register("description")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="date" label="Date" error={errors.date?.message} {...register("date")} />
              <Input type="number" step="0.01" label="Cost" error={errors.cost?.message} {...register("cost")} />
            </div>
            <Input
              type="date"
              label="Next service date"
              error={errors.next_service_date?.message}
              {...register("next_service_date")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(`/transport/vehicles/${vehicleId}/maintenance`)}
              >
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
