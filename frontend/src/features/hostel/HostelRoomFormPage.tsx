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

import { useCreateRoom, useHostel, useRoom, useUpdateRoom } from "./useHostelCrud";

const schema = z.object({
  room_number: z.string().min(1, "Room number is required"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { room_number: "", capacity: 4 };
const FIELD_KEYS = new Set(["room_number", "capacity"]);

export function HostelRoomFormPage() {
  const { hostelId, id } = useParams<{ hostelId: string; id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: hostel } = useHostel(hostelId);
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
      reset({ room_number: room.room_number, capacity: room.capacity });
    }
  }, [room, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      { hostel: hostelId as string, room_number: values.room_number, capacity: values.capacity },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Room updated" : "Room created" });
          navigate(`/hostel/hostels/${hostelId}/rooms`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save room", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingRoom) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit room" : "New room"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{hostel ? `In ${hostel.name}` : "Room details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Room number" placeholder="101" error={errors.room_number?.message} {...register("room_number")} />
            <Input type="number" label="Capacity" error={errors.capacity?.message} {...register("capacity")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(`/hostel/hostels/${hostelId}/rooms`)}>
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
