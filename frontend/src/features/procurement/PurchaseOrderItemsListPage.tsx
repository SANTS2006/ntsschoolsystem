import { ListChecks, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { StatRow } from "@/components/ui/StatRow";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRowLink,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { useDeletePurchaseOrderItem, usePurchaseOrder, usePurchaseOrderItemList } from "./useProcurementCrud";

export function PurchaseOrderItemsListPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { id } = useParams<{ id: string }>();
  const orderId = id as string;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("procurement.create");
  const canDelete = useHasPermission("procurement.delete");

  const { data: order, isLoading: isLoadingOrder } = usePurchaseOrder(orderId);
  const filterParams = { search: debouncedSearch || undefined, order: orderId };
  const { data, isLoading, isError, error } = usePurchaseOrderItemList({ ...filterParams, page_size: 100 });
  const { data: stats } = useSummaryStats("procurement/order-items", filterParams);
  const deleteItem = useDeletePurchaseOrderItem();

  // Same courtesy lock as purchase request items — the backend rejects add/edit/delete once the
  // order leaves draft (adding a line after sending would silently orphan it from the total).
  const isLocked = order ? order.status !== "draft" : false;

  const handleDelete = async (itemId: string, description: string) => {
    const ok = await confirm({
      title: `Remove this item (${description})?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteItem.mutate(
      { id: itemId, orderId },
      {
        onSuccess: () => showToast({ title: "Item removed" }),
        onError: (err: ApiError) =>
          showToast({ title: "Failed to remove", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  if (isLoadingOrder) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate(`/procurement/orders/${orderId}`)}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to order
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input icon={Search} placeholder="Search by item" aria-label="Search by item" value={search} onChange={(e) => { setSearch(e.target.value); }} />
        </div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Items for {order?.order_number ?? "this order"}
        </h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/procurement/order-items/" params={filterParams} filename="purchase_order_items.csv" />
          {canCreate && !isLocked && (
            <Button onClick={() => navigate(`/procurement/orders/${orderId}/items/new`)}>
              <Plus className="size-4" aria-hidden="true" />
              New item
            </Button>
          )}
        </div>
      </div>

      {isLocked && (
        <Alert tone="warning">
          This order is no longer a draft — items can no longer be added, edited, or removed.
        </Alert>
      )}

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total items", value: stats.total as number, icon: ListChecks }]} />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={ListChecks} title="No items yet" />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Description</TableHeaderCell>
                <TableHeaderCell>Inventory item</TableHeaderCell>
                <TableHeaderCell>Quantity</TableHeaderCell>
                <TableHeaderCell>Unit price</TableHeaderCell>
                {canDelete && !isLocked && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((item) => (
                <TableRowLink
                  key={item.id}
                  onClick={() => {
                    if (!isLocked) navigate(`/procurement/orders/${orderId}/items/${item.id}/edit`);
                  }}
                >
                  <TableCell className="font-medium">{item.description}</TableCell>
                  <TableCell>
                    {item.inventory_item_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>{item.quantity_ordered}</TableCell>
                  <TableCell>{item.unit_price}</TableCell>
                  {canDelete && !isLocked && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id, item.description);
                        }}
                        aria-label="Remove item"
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </TableCell>
                  )}
                </TableRowLink>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        </ScrollReveal>
      ) : null}
    </div>
  );
}
