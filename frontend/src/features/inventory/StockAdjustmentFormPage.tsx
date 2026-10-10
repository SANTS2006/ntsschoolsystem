import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";

import { useItem, useStockIn, useStockOut } from "./useInventoryCrud";

const schema = z.object({
  quantity: z.coerce.number().int().gt(0, "Quantity must be greater than zero"),
  reason: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function StockAdjustmentFormPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const direction = location.pathname.endsWith("/stock-out") ? "out" : "in";

  const { data: item, isLoading } = useItem(id);
  const stockIn = useStockIn(id ?? "");
  const stockOut = useStockOut(id ?? "");
  const mutation = direction === "in" ? stockIn : stockOut;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: { quantity: 1, reason: "" } });

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      { quantity: values.quantity, reason: values.reason || undefined },
      {
        onSuccess: () => {
          showToast({ title: direction === "in" ? "Stock added" : "Stock removed" });
          navigate("/inventory/items");
        },
        onError: (err: ApiError) => {
          setGeneralError(err.message);
          showToast({
            title: direction === "in" ? "Could not add stock" : "Could not remove stock",
            description: err.message,
            tone: "danger",
          });
        },
      },
    );
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!item) {
    return <Alert tone="danger">Item not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{direction === "in" ? "Stock in" : "Stock out"}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[var(--color-text)]">{item.name}</CardTitle>
          <p className="text-sm text-[var(--color-text-muted)]">
            Currently {item.quantity_in_stock} {item.unit} in stock.
          </p>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input
              type="number"
              label="Quantity"
              error={errors.quantity?.message}
              {...register("quantity")}
            />
            <Input
              label="Reason"
              hint="Optional — recorded on the stock movement ledger."
              error={errors.reason?.message}
              {...register("reason")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/inventory/items")}>
                Cancel
              </Button>
              <Button type="submit" isLoading={mutation.isPending}>
                {!mutation.isPending && <Save className="size-4" aria-hidden="true" />}
                {direction === "in" ? "Add stock" : "Remove stock"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
