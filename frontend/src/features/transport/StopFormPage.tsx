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

import { useCreateStop, useRoute, useStop, useUpdateStop } from "./useTransportCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  order: z.coerce.number().int().min(0, "Order cannot be negative"),
  pickup_time: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { name: "", order: 0, pickup_time: "" };
const FIELD_KEYS = new Set(["name", "order", "pickup_time"]);

export function StopFormPage() {
  const { routeId, id } = useParams<{ routeId: string; id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: route } = useRoute(routeId);
  const { data: stop, isLoading: isLoadingStop } = useStop(id);
  const createStop = useCreateStop();
  const updateStop = useUpdateStop(id ?? "");
  const mutation = isEditMode ? updateStop : createStop;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (stop) {
      reset({ name: stop.name, order: stop.order, pickup_time: stop.pickup_time ?? "" });
    }
  }, [stop, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        route: routeId as string,
        name: values.name,
        order: values.order,
        pickup_time: values.pickup_time || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Stop updated" : "Stop added" });
          navigate(`/transport/routes/${routeId}/stops`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save stop", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingStop) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit stop" : "New stop"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{route ? `On ${route.name}` : "Stop details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="Main Gate" error={errors.name?.message} {...register("name")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="number" label="Order" error={errors.order?.message} {...register("order")} />
              <Input type="time" label="Pickup time" error={errors.pickup_time?.message} {...register("pickup_time")} />
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(`/transport/routes/${routeId}/stops`)}>
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
