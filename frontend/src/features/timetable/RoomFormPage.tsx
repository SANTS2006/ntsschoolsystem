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

import { useCreateRoom, useRoom, useUpdateRoom } from "./useTimetableCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { name: "", capacity: 30 };
const FIELD_KEYS = new Set(["name", "capacity"]);

export function RoomFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: room, isLoading: isLoadingRoom } = useRoom(id);
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom(id ?? "");
  const mutation = isEditMode ? updateRoom : createRoom;

  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (room) {
      reset({ name: room.name, capacity: room.capacity });
    }
  }, [room, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(values, {
      onSuccess: () => {
        showToast({ title: isEditMode ? "Room updated" : "Room created" });
        navigate("/timetable/rooms");
      },
      onError: (err: ApiError) => {
        if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
          const message = generalErrorMessage(err);
          setGeneralError(message);
          showToast({ title: "Could not save room", description: message, tone: "danger" });
        }
      },
    });
  };

  if (isEditMode && isLoadingRoom) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit room" : "New room"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Room details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="Room 12" error={errors.name?.message} {...register("name")} />
            <Input type="number" label="Capacity" error={errors.capacity?.message} {...register("capacity")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/timetable/rooms")}>
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
