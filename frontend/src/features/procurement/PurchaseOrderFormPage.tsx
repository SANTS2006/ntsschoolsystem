import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreatePurchaseOrder, usePurchaseOrder, usePurchaseRequestList, useSupplierList, useUpdatePurchaseOrder } from "./useProcurementCrud";

const schema = z.object({
  order_number: z.string().min(1, "Order number is required"),
  supplier: z.string().min(1, "Supplier is required"),
  source_request: z.string(),
});

type FormValues = z.infer<typeof schema>;
const FIELD_KEYS = new Set(["order_number", "supplier", "source_request"]);

export function PurchaseOrderFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const [searchParams] = useSearchParams();
  const preselectedRequest = searchParams.get("source_request") ?? "";
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: order, isLoading: isLoadingOrder } = usePurchaseOrder(id);
  const { data: suppliers } = useSupplierList({ page_size: 100, is_active: true });
  const { data: approvedRequests } = usePurchaseRequestList({ page_size: 100, status: "approved" });
  const createOrder = useCreatePurchaseOrder();
  const updateOrder = useUpdatePurchaseOrder(id ?? "");
  const mutation = isEditMode ? updateOrder : createOrder;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { order_number: "", supplier: "", source_request: preselectedRequest },
  });

  useEffect(() => {
    // Re-fires once `suppliers`/`approvedRequests` finish loading, not just when `order` does (or,
    // in create mode, not just on mount) — a native <select> silently ignores a value assigned
    // before its matching <option> exists in the DOM (see Documents/Assignments/Communications for
    // the full root-cause writeup). In create mode the preselected `source_request` from the query
    // string is set via `defaultValues` at mount, before `approvedRequests` has necessarily loaded,
    // so without this effect re-applying it, the select would silently fall back to "Not set".
    if (order) {
      reset({
        order_number: order.order_number,
        supplier: order.supplier,
        source_request: order.source_request ?? "",
      });
    } else if (preselectedRequest) {
      reset({ order_number: "", supplier: "", source_request: preselectedRequest });
    }
  }, [order, suppliers, approvedRequests, reset, preselectedRequest]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        order_number: values.order_number,
        supplier: values.supplier,
        source_request: values.source_request || undefined,
      },
      {
        onSuccess: (saved) => {
          showToast({ title: isEditMode ? "Order updated" : "Order created" });
          navigate(`/procurement/orders/${saved.id}`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save order", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingOrder) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit purchase order" : "New purchase order"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Order details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Order number" error={errors.order_number?.message} {...register("order_number")} />
            <Select label="Supplier" error={errors.supplier?.message} {...register("supplier")}>
              <option value="">Select a supplier</option>
              {suppliers?.results.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
            <Select
              label="Source request"
              hint="Optional — only approved purchase requests can be linked."
              error={errors.source_request?.message}
              {...register("source_request")}
            >
              <option value="">Not set (standalone order)</option>
              {approvedRequests?.results.map((request) => (
                <option key={request.id} value={request.id}>
                  {request.title}
                </option>
              ))}
            </Select>

            <div className="mt-2 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(isEditMode ? `/procurement/orders/${id}` : "/procurement/orders")}
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
