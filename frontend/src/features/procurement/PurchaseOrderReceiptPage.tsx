import { useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PrintableDocument } from "@/components/ui/PrintableDocument";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useCurrentUser } from "@/features/auth/useAuth";
import { LogoBadge } from "@/layouts/AppShell";
import type { ApiError } from "@/lib/api-client";

import { orderStatusTone, statusLabel } from "./statusTone";
import { usePurchaseOrder, usePurchaseOrderItemList } from "./useProcurementCrud";

export function PurchaseOrderReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, isError, error } = usePurchaseOrder(id);
  const { data: items } = usePurchaseOrderItemList({ order: id as string, page_size: 100 });
  const { data: user } = useCurrentUser();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !order) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Purchase order not found."}</Alert>;
  }

  return (
    <PrintableDocument
      title="Purchase order receipt"
      filename={`Purchase order ${order.order_number}.pdf`}
    >
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <LogoBadge logoUrl={user?.school?.logo} className="size-12" />
          <div className="min-w-0">
            <CardTitle className="truncate text-base font-semibold text-[var(--color-text)]">
              {user?.school?.name ?? "Purchase Order Receipt"}
            </CardTitle>
            <p className="truncate text-sm text-[var(--color-text-muted)]">
              Received-to-date totals as of this printout — quantities update live as further deliveries arrive.
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border)] pb-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Order #</p>
              <p className="mt-0.5 text-lg font-semibold text-[var(--color-text)]">{order.order_number}</p>
            </div>
            <Badge tone={orderStatusTone(order.status)}>{statusLabel(order.status)}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Supplier</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">{order.supplier_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Ordered at</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">
                {order.ordered_at ? new Date(order.ordered_at).toLocaleString() : <span className="text-[var(--color-text-muted)]">—</span>}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Created by</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">
                {order.created_by_name || <span className="text-[var(--color-text-muted)]">—</span>}
              </p>
            </div>
          </div>

          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Description</TableHeaderCell>
                  <TableHeaderCell>Ordered</TableHeaderCell>
                  <TableHeaderCell>Received to date</TableHeaderCell>
                  <TableHeaderCell>Unit price</TableHeaderCell>
                  <TableHeaderCell>Line total</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {items?.results.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.description}</TableCell>
                    <TableCell>{item.quantity_ordered}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {item.quantity_received}
                        {item.is_fully_received && <Badge tone="success">Complete</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{item.unit_price}</TableCell>
                    <TableCell>{(Number(item.unit_price) * item.quantity_ordered).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Total amount</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-text)]">{order.total_amount}</p>
          </div>
        </CardContent>
      </Card>
    </PrintableDocument>
  );
}
