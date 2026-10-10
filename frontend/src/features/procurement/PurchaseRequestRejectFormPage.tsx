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

import { requestStatusTone, statusLabel } from "./statusTone";
import { usePurchaseRequest, useRejectPurchaseRequest } from "./useProcurementCrud";

const schema = z.object({ reason: z.string().min(1, "A reason is required") });
type FormValues = z.infer<typeof schema>;

export function PurchaseRequestRejectFormPage() {
  const { id } = useParams<{ id: string }>();
  const requestId = id as string;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: request, isLoading } = usePurchaseRequest(requestId);
  const rejectRequest = useRejectPurchaseRequest(requestId);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { reason: "" } });

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    rejectRequest.mutate(values.reason, {
      onSuccess: () => {
        showToast({ title: "Request rejected" });
        navigate(`/procurement/requests/${requestId}`);
      },
      onError: (err: ApiError) => {
        setGeneralError(err.message);
        showToast({ title: "Could not reject request", description: err.message, tone: "danger" });
      },
    });
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!request) {
    return <Alert tone="danger">Purchase request not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Reject request</h1>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-[var(--color-text)]">{request.title}</CardTitle>
          <Badge tone={requestStatusTone(request.status)}>{statusLabel(request.status)}</Badge>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input
              label="Reason"
              hint="Required — recorded on the request."
              error={errors.reason?.message}
              {...register("reason")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(`/procurement/requests/${requestId}`)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" isLoading={rejectRequest.isPending}>
                {!rejectRequest.isPending && <XCircle className="size-4" aria-hidden="true" />}
                Reject request
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
