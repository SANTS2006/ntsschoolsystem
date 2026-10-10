import { zodResolver } from "@hookform/resolvers/zod";
import { XCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";

import { schoolStatusTone, statusLabel } from "./statusTone";
import { useSchool, useSuspendSchool } from "./useSchoolsCrud";

const schema = z.object({ reason: z.string() });
type FormValues = z.infer<typeof schema>;

export function SchoolSuspendFormPage() {
  const { id } = useParams<{ id: string }>();
  const schoolId = id as string;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: school, isLoading } = useSchool(schoolId);
  const suspendSchool = useSuspendSchool(schoolId);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { reason: "" } });

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    suspendSchool.mutate(values.reason, {
      onSuccess: () => {
        showToast({ title: "School suspended" });
        navigate(`/platform/schools/${schoolId}`);
      },
      onError: (err: ApiError) => {
        setGeneralError(err.message);
        showToast({ title: "Could not suspend school", description: err.message, tone: "danger" });
      },
    });
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!school) {
    return <Alert tone="danger">School not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Suspend school</h1>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-[var(--color-text)]">{school.name}</CardTitle>
          <Badge tone={schoolStatusTone(school.status)}>{statusLabel(school.status)}</Badge>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <Alert tone="warning" className="mb-4">
            Suspending blocks every user at this school from signing in until it's activated again.
          </Alert>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input
              label="Reason"
              hint="Optional — shown to this school's users as the reason their account is suspended."
              error={errors.reason?.message}
              {...register("reason")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(`/platform/schools/${schoolId}`)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" isLoading={suspendSchool.isPending}>
                {!suspendSchool.isPending && <XCircle className="size-4" aria-hidden="true" />}
                Suspend school
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
