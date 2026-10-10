import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
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
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreatePeriod, usePeriod, useUpdatePeriod } from "./useTimetableCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  start_time: z.string().min(1, "Start time is required"),
  end_time: z.string().min(1, "End time is required"),
  order: z.coerce.number().int().min(0, "Order must be zero or greater"),
  is_break: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { name: "", start_time: "", end_time: "", order: 0, is_break: false };
const FIELD_KEYS = new Set(["name", "start_time", "end_time", "order", "is_break"]);

export function PeriodFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: period, isLoading: isLoadingPeriod } = usePeriod(id);
  const createPeriod = useCreatePeriod();
  const updatePeriod = useUpdatePeriod(id ?? "");
  const mutation = isEditMode ? updatePeriod : createPeriod;

  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (period) {
      reset({
        name: period.name,
        start_time: period.start_time.slice(0, 5),
        end_time: period.end_time.slice(0, 5),
        order: period.order,
        is_break: period.is_break,
      });
    }
  }, [period, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(values, {
      onSuccess: () => {
        showToast({ title: isEditMode ? "Period updated" : "Period created" });
        navigate("/timetable/periods");
      },
      onError: (err: ApiError) => {
        if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
          const message = generalErrorMessage(err);
          setGeneralError(message);
          showToast({ title: "Could not save period", description: message, tone: "danger" });
        }
      },
    });
  };

  if (isEditMode && isLoadingPeriod) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit period" : "New period"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Period details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="Period 1" error={errors.name?.message} {...register("name")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="time" label="Start time" error={errors.start_time?.message} {...register("start_time")} />
              <Input type="time" label="End time" error={errors.end_time?.message} {...register("end_time")} />
            </div>
            <Input
              type="number"
              label="Order"
              hint="Controls display order in the schedule grid (lowest first)."
              error={errors.order?.message}
              {...register("order")}
            />
            <Checkbox label="This is a break (not a teaching period)" {...register("is_break")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/timetable/periods")}>
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
