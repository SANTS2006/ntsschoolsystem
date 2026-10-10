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

import { useCreateSupplier, useSupplier, useUpdateSupplier } from "./useProcurementCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  contact_person: z.string(),
  email: z.string().email("Enter a valid email address").or(z.literal("")),
  phone_number: z.string(),
  address: z.string(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  name: "",
  contact_person: "",
  email: "",
  phone_number: "",
  address: "",
  is_active: true,
};
const FIELD_KEYS = new Set(["name", "contact_person", "email", "phone_number", "address", "is_active"]);

export function SupplierFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: supplier, isLoading: isLoadingSupplier } = useSupplier(id);
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier(id ?? "");
  const mutation = isEditMode ? updateSupplier : createSupplier;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (supplier) {
      reset({
        name: supplier.name,
        contact_person: supplier.contact_person,
        email: supplier.email,
        phone_number: supplier.phone_number,
        address: supplier.address,
        is_active: supplier.is_active,
      });
    }
  }, [supplier, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        name: values.name,
        contact_person: values.contact_person || undefined,
        email: values.email || undefined,
        phone_number: values.phone_number || undefined,
        address: values.address || undefined,
        is_active: values.is_active,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Supplier updated" : "Supplier created" });
          navigate("/procurement/suppliers");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save supplier", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingSupplier) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit supplier" : "New supplier"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Supplier details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" error={errors.name?.message} {...register("name")} />
            <Input label="Contact person" error={errors.contact_person?.message} {...register("contact_person")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="email" label="Email" error={errors.email?.message} {...register("email")} />
              <Input label="Phone number" error={errors.phone_number?.message} {...register("phone_number")} />
            </div>
            <Input label="Address" error={errors.address?.message} {...register("address")} />
            <Checkbox label="Active" {...register("is_active")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/procurement/suppliers")}>
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
