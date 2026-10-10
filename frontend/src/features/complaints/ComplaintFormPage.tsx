import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { CategorySelect } from "@/components/ui/CategorySelect";
import { Checkbox } from "@/components/ui/Checkbox";
import { ImageField } from "@/components/ui/ImageField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/toastContext";
import { useResolveCategory } from "@/features/formoptions/useResolveCategory";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { categoryLabel, priorityLabel } from "./statusTone";
import type { BuiltinComplaintCategory, ComplaintPriority } from "./types";
import { useAddressableStaff, useCreateComplaint } from "./useComplaintsCrud";

const CATEGORIES: BuiltinComplaintCategory[] = ["academic", "facility", "behavioral", "administrative", "other"];
const PRIORITIES: ComplaintPriority[] = ["low", "normal", "high"];

const schema = z.object({
  category: z.string().min(1, "Choose a category"),
  subject: z.string().min(1, "Subject is required"),
  description: z.string().min(1, "Description is required"),
  priority: z.enum(["low", "normal", "high"]),
  is_anonymous: z.boolean(),
  addressed_to: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  category: "other",
  subject: "",
  description: "",
  priority: "normal",
  is_anonymous: false,
  addressed_to: "",
};
const FIELD_KEYS = new Set(["category", "subject", "description", "image", "priority", "is_anonymous", "addressed_to"]);

export function ComplaintFormPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createComplaint = useCreateComplaint();
  const { data: addressableStaff } = useAddressableStaff();
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [otherText, setOtherText] = useState("");
  const resolveCategory = useResolveCategory("complaints.category");

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  const onSubmit = async (values: FormValues) => {
    setGeneralError(null);
    let category: string;
    try {
      // "Other" + a typed name becomes a real option on the school's list first.
      category = await resolveCategory(values.category, otherText);
    } catch (err) {
      const message = generalErrorMessage(err as ApiError);
      setGeneralError(message);
      return;
    }
    createComplaint.mutate({ ...values, category, addressed_to: values.addressed_to || undefined, image: image ?? undefined }, {
      onSuccess: (complaint) => {
        showToast({ title: "Complaint submitted" });
        navigate(`/complaints/${complaint.id}`);
      },
      onError: (err: ApiError) => {
        if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
          const message = generalErrorMessage(err);
          setGeneralError(message);
          showToast({ title: "Could not submit complaint", description: message, tone: "danger" });
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">New complaint</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Report an issue or share a suggestion — staff will follow up here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Complaint details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <CategorySelect
                    field="complaints.category"
                    label="Category"
                    builtin={CATEGORIES.map((value) => ({ value, label: categoryLabel(value) }))}
                    value={field.value}
                    onChange={field.onChange}
                    otherText={otherText}
                    onOtherTextChange={setOtherText}
                    error={errors.category?.message}
                  />
                )}
              />
              <Select label="Priority" error={errors.priority?.message} {...register("priority")}>
                {PRIORITIES.map((option) => (
                  <option key={option} value={option}>
                    {priorityLabel(option)}
                  </option>
                ))}
              </Select>
            </div>
            <Input label="Subject" error={errors.subject?.message} {...register("subject")} />
            <Input label="Description" error={errors.description?.message} {...register("description")} />
            <ImageField
              label="Photo"
              value={image}
              onChange={setImage}
              hint="A picture of the problem can help. JPG, PNG, WEBP or GIF, up to 5MB."
            />
            <Select
              label="Address to (optional)"
              hint="Leave blank to let any staff member who handles complaints pick this up."
              error={errors.addressed_to?.message}
              {...register("addressed_to")}
            >
              <option value="">Anyone who handles complaints</option>
              {addressableStaff?.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </Select>
            <Checkbox
              label="Submit anonymously"
              hint="Staff won't see your name — only that a complaint was submitted."
              {...register("is_anonymous")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/complaints")}>
                Cancel
              </Button>
              <Button type="submit" isLoading={createComplaint.isPending}>
                {!createComplaint.isPending && <Send className="size-4" aria-hidden="true" />}
                Submit
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
