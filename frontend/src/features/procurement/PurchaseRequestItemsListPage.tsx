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

import { useDeletePurchaseRequestItem, usePurchaseRequest, usePurchaseRequestItemList } from "./useProcurementCrud";

export function PurchaseRequestItemsListPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { id } = useParams<{ id: string }>();
  const requestId = id as string;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("procurement.create");
  const canDelete = useHasPermission("procurement.delete");

  const { data: request, isLoading: isLoadingRequest } = usePurchaseRequest(requestId);
  const filterParams = { search: debouncedSearch || undefined, request: requestId };
  const { data, isLoading, isError, error } = usePurchaseRequestItemList({ ...filterParams, page_size: 100 });
  const { data: stats } = useSummaryStats("procurement/request-items", filterParams);
  const deleteItem = useDeletePurchaseRequestItem();

  // The backend rejects any add/edit/delete once the request leaves draft — hiding the actions
  // here is a courtesy, not the real enforcement (that stays server-side), same pattern as
  // Invoice's line items lock.
  const isLocked = request ? request.status !== "draft" : false;

  const handleDelete = async (itemId: string, description: string) => {
    const ok = await confirm({
      title: `Remove this item (${description})?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteItem.mutate(
      { id: itemId, requestId },
      {
        onSuccess: () => showToast({ title: "Item removed" }),
        onError: (err: ApiError) =>
          showToast({ title: "Failed to remove", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  if (isLoadingRequest) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate(`/procurement/requests/${requestId}`)}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to request
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input icon={Search} placeholder="Search by item" aria-label="Search by item" value={search} onChange={(e) => { setSearch(e.target.value); }} />
        </div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Items for {request?.title ?? "this request"}
        </h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/procurement/request-items/" params={filterParams} filename="purchase_request_items.csv" />
          {canCreate && !isLocked && (
            <Button onClick={() => navigate(`/procurement/requests/${requestId}/items/new`)}>
              <Plus className="size-4" aria-hidden="true" />
              New item
            </Button>
          )}
        </div>
      </div>

      {isLocked && (
        <Alert tone="warning">
          This request is no longer a draft — items can no longer be added, edited, or removed.
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
                <TableHeaderCell>Est. unit price</TableHeaderCell>
                {canDelete && !isLocked && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((item) => (
                <TableRowLink
                  key={item.id}
                  onClick={() => {
                    if (!isLocked) navigate(`/procurement/requests/${requestId}/items/${item.id}/edit`);
                  }}
                >
                  <TableCell className="font-medium">{item.description}</TableCell>
                  <TableCell>
                    {item.inventory_item_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>
                    {item.estimated_unit_price ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
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
