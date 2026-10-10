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

import { useBed, useCreateBed, useRoom, useUpdateBed } from "./useHostelCrud";

const schema = z.object({ bed_number: z.string().min(1, "Bed number is required") });
type FormValues = z.infer<typeof schema>;
const EMPTY_VALUES: FormValues = { bed_number: "" };
const FIELD_KEYS = new Set(["bed_number"]);

export function BedFormPage() {
  const { hostelId, roomId, id } = useParams<{ hostelId: string; roomId: string; id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: room } = useRoom(roomId);
  const { data: bed, isLoading: isLoadingBed } = useBed(id);
  const createBed = useCreateBed();
  const updateBed = useUpdateBed(id ?? "");
  const mutation = isEditMode ? updateBed : createBed;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (bed) {
      reset({ bed_number: bed.bed_number });
    }
  }, [bed, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      { room: roomId as string, bed_number: values.bed_number },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Bed updated" : "Bed added" });
          navigate(`/hostel/hostels/${hostelId}/rooms/${roomId}/beds`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save bed", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingBed) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit bed" : "New bed"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{room ? `In room ${room.room_number}` : "Bed details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Bed number" placeholder="A" error={errors.bed_number?.message} {...register("bed_number")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(`/hostel/hostels/${hostelId}/rooms/${roomId}/beds`)}
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
