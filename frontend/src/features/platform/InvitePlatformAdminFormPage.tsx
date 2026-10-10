import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useInvitePlatformAdmin } from "./usePlatformCrud";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
});
type FormValues = z.infer<typeof schema>;
const FIELD_KEYS = new Set(["email", "first_name", "last_name"]);

export function InvitePlatformAdminFormPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const inviteAdmin = useInvitePlatformAdmin();
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", first_name: "", last_name: "" },
  });

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    inviteAdmin.mutate(values, {
      onSuccess: (admin) => {
        showToast({ title: `Invitation sent to ${admin.email}` });
        navigate("/platform/admins");
      },
      onError: (err: ApiError) => {
        if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
          const message = generalErrorMessage(err);
          setGeneralError(message);
          showToast({ title: "Could not send invitation", description: message, tone: "danger" });
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Invite platform admin" description="They'll set their own password from the invitation email." />

      <Card>
        <CardHeader>
          <CardTitle>Administrator details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <p className="mb-4 text-sm text-[var(--color-text-muted)]">
            They'll receive an email invitation to set their own password — you never choose one for them.
          </p>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input type="email" label="Email" error={errors.email?.message} {...register("email")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="First name" error={errors.first_name?.message} {...register("first_name")} />
              <Input label="Last name" error={errors.last_name?.message} {...register("last_name")} />
            </div>

            <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => navigate("/platform/admins")}>
                Cancel
              </Button>
              <Button type="submit" isLoading={inviteAdmin.isPending}>
                {!inviteAdmin.isPending && <Send className="size-4" aria-hidden="true" />}
                Send invitation
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
