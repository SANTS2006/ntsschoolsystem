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

import { useCreateHostel, useHostel, useUpdateHostel } from "./useHostelCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  gender_restriction: z.enum(["male", "female", "mixed"]),
  warden: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { name: "", gender_restriction: "mixed", warden: "" };
const FIELD_KEYS = new Set(["name", "gender_restriction", "warden"]);

export function HostelFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: hostel, isLoading: isLoadingHostel } = useHostel(id);
  const { data: staff } = useStaffLookup("warden");
  const createHostel = useCreateHostel();
  const updateHostel = useUpdateHostel(id ?? "");
  const mutation = isEditMode ? updateHostel : createHostel;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (hostel) {
      reset({ name: hostel.name, gender_restriction: hostel.gender_restriction, warden: hostel.warden ?? "" });
    }
  }, [hostel, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        name: values.name,
        gender_restriction: values.gender_restriction,
        warden: values.warden || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Hostel updated" : "Hostel created" });
          navigate("/hostel/hostels");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save hostel", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingHostel) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit hostel" : "New hostel"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Hostel details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="Blue Hostel" error={errors.name?.message} {...register("name")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Gender restriction" error={errors.gender_restriction?.message} {...register("gender_restriction")}>
                <option value="mixed">Mixed</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </Select>
              <Select label="Warden" error={errors.warden?.message} {...register("warden")}>
                <option value="">Not set</option>
                {staff?.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/hostel/hostels")}>
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
