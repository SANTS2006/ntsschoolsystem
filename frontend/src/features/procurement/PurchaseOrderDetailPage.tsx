import { Ban, ListChecks, PackageCheck, Printer, Send } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
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
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { orderStatusTone, statusLabel } from "./statusTone";
import { useCancelPurchaseOrder, usePurchaseOrder, usePurchaseOrderItemList, useSendPurchaseOrder } from "./useProcurementCrud";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-0.5 text-sm text-[var(--color-text)]">
        {value || <span className="text-[var(--color-text-muted)]">—</span>}
      </p>
    </div>
  );
}

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canUpdate = useHasPermission("procurement.update");

  const { data: order, isLoading, isError, error } = usePurchaseOrder(id);
  const { data: items } = usePurchaseOrderItemList({ order: id as string, page_size: 100 });
  const sendOrder = useSendPurchaseOrder();
  const cancelOrder = useCancelPurchaseOrder();

  const handleSend = () => {
    if (!order) return;
    sendOrder.mutate(order.id, {
      onSuccess: (result) => showToast({ title: result.message || "Order sent" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not send order", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleCancel = async () => {
    if (!order) return;
    const ok = await confirm({
      title: `Cancel order ${order.order_number}?`,
      tone: "danger",
    });
    if (!ok) return;
    cancelOrder.mutate(order.id, {
      onSuccess: () => showToast({ title: "Order cancelled" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not cancel order", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !order) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Purchase order not found."}</Alert>;
  }

  const canManageItems = canUpdate && order.status === "draft";
  const canSend = canUpdate && order.status === "draft" && order.item_count > 0;
  const canReceive = canUpdate && (order.status === "sent" || order.status === "partially_received");
  const canCancel = canUpdate && (order.status === "draft" || order.status === "sent");
  const canPrintReceipt = order.status !== "draft" && order.status !== "cancelled";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/procurement/orders")}
          className="back-button"
        >
          <BackArrowIcon className="size-4" />
          Back to orders
        </button>
        <div className="flex flex-wrap justify-end gap-2">
          {canManageItems && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/procurement/orders/${order.id}/items`)}>
              <ListChecks className="size-4" aria-hidden="true" />
              Items
            </Button>
          )}
          {canSend && (
            <Button size="sm" onClick={handleSend} isLoading={sendOrder.isPending}>
              <Send className="size-4" aria-hidden="true" />
              Send
            </Button>
          )}
          {canReceive && (
            <Button size="sm" onClick={() => navigate(`/procurement/orders/${order.id}/receive`)}>
              <PackageCheck className="size-4" aria-hidden="true" />
              Receive
            </Button>
          )}
          {canPrintReceipt && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/procurement/orders/${order.id}/receipt`)}>
              <Printer className="size-4" aria-hidden="true" />
              Receipt
            </Button>
          )}
          {canCancel && (
            <Button variant="danger" size="sm" onClick={handleCancel} isLoading={cancelOrder.isPending}>
              <Ban className="size-4" aria-hidden="true" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-[var(--color-text)]">{order.order_number}</CardTitle>
            <p className="text-sm text-[var(--color-text-muted)]">{order.supplier_name}</p>
          </div>
          <Badge tone={orderStatusTone(order.status)}>{statusLabel(order.status)}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Total amount" value={order.total_amount} />
          <Field label="Ordered at" value={order.ordered_at ? new Date(order.ordered_at).toLocaleString() : null} />
          <Field label="Created by" value={order.created_by_name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          {items && items.results.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No items added yet.</p>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Description</TableHeaderCell>
                    <TableHeaderCell>Inventory item</TableHeaderCell>
                    <TableHeaderCell>Ordered</TableHeaderCell>
                    <TableHeaderCell>Received</TableHeaderCell>
                    <TableHeaderCell>Unit price</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {items?.results.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.description}</TableCell>
                      <TableCell>
                        {item.inventory_item_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                      </TableCell>
                      <TableCell>{item.quantity_ordered}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {item.quantity_received}
                          {item.is_fully_received && <Badge tone="success">Complete</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{item.unit_price}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
