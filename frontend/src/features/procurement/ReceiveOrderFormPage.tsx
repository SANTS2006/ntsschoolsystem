import { PackageCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import type { PurchaseOrderItem } from "./types";
import { usePurchaseOrder, usePurchaseOrderItemList, useReceivePurchaseOrder } from "./useProcurementCrud";

/** Keyed by the order it was initialized for, so a fresh receive after a partial one remounts
 * with freshly-derived remaining quantities instead of syncing local state via an effect — same
 * pattern as Examinations' MarksEditor. */
function ReceiveEditor({ orderId, items }: { orderId: string; items: PurchaseOrderItem[] }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const receiveOrder = useReceivePurchaseOrder(orderId);

  const [quantities, setQuantities] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const item of items) {
      const remaining = item.quantity_ordered - item.quantity_received;
      initial[item.id] = remaining > 0 ? String(remaining) : "0";
    }
    return initial;
  });

  const handleSubmit = () => {
    const receipts = items
      .map((item) => ({ item_id: item.id, quantity: Number(quantities[item.id] || 0) }))
      .filter((line) => line.quantity > 0);

    if (receipts.length === 0) {
      showToast({ title: "Enter a quantity greater than zero for at least one item", tone: "danger" });
      return;
    }

    receiveOrder.mutate(receipts, {
      onSuccess: () => {
        showToast({ title: "Receipt recorded" });
        navigate(`/procurement/orders/${orderId}`);
      },
      onError: (err: ApiError) =>
        showToast({ title: "Could not record receipt", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  return (
    <>
      {receiveOrder.isError && <Alert tone="danger">{generalErrorMessage(receiveOrder.error as ApiError)}</Alert>}

      <TableContainer>
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Description</TableHeaderCell>
              <TableHeaderCell>Ordered</TableHeaderCell>
              <TableHeaderCell>Received so far</TableHeaderCell>
              <TableHeaderCell>Receive now</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {items.map((item) => {
              const remaining = item.quantity_ordered - item.quantity_received;
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.description}</TableCell>
                  <TableCell>{item.quantity_ordered}</TableCell>
                  <TableCell>{item.quantity_received}</TableCell>
                  <TableCell>
                    {item.is_fully_received ? (
                      <Badge tone="success">Complete</Badge>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        max={remaining}
                        value={quantities[item.id] ?? ""}
                        onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-24"
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <div className="mt-4 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => navigate(`/procurement/orders/${orderId}`)}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} isLoading={receiveOrder.isPending}>
          {!receiveOrder.isPending && <PackageCheck className="size-4" aria-hidden="true" />}
          Record receipt
        </Button>
      </div>
    </>
  );
}

export function ReceiveOrderFormPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id as string;

  const { data: order, isLoading: isLoadingOrder } = usePurchaseOrder(orderId);
  const { data: items, isLoading: isLoadingItems } = usePurchaseOrderItemList({ order: orderId, page_size: 100 });

  if (isLoadingOrder || isLoadingItems) {
    return <FullPageSpinner />;
  }

  if (!order) {
    return <Alert tone="danger">Purchase order not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Receive order</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[var(--color-text)]">{order.order_number}</CardTitle>
          <p className="text-sm text-[var(--color-text-muted)]">{order.supplier_name}</p>
        </CardHeader>
        <CardContent>
          {!items || items.results.length === 0 ? (
            <EmptyState icon={PackageCheck} title="No items on this order" />
          ) : (
            <ReceiveEditor key={orderId} orderId={orderId} items={items.results} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
