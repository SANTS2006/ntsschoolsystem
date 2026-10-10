import { Ban, Check, FilePlus, ListChecks, ShoppingCart, XCircle } from "lucide-react";
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

import { requestStatusTone, statusLabel } from "./statusTone";
import {
  useApprovePurchaseRequest,
  useCancelPurchaseRequest,
  usePurchaseRequest,
  usePurchaseRequestItemList,
  useSubmitPurchaseRequest,
} from "./useProcurementCrud";

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

export function PurchaseRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canUpdate = useHasPermission("procurement.update");
  const canApprove = useHasPermission("procurement.approve");
  const canCreateOrder = useHasPermission("procurement.create");

  const { data: request, isLoading, isError, error } = usePurchaseRequest(id);
  const { data: items } = usePurchaseRequestItemList({ request: id as string, page_size: 100 });
  const submitRequest = useSubmitPurchaseRequest();
  const approveRequest = useApprovePurchaseRequest();
  const cancelRequest = useCancelPurchaseRequest();

  const handleSubmit = () => {
    if (!request) return;
    submitRequest.mutate(request.id, {
      onSuccess: () => showToast({ title: "Request submitted" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not submit request", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleApprove = () => {
    if (!request) return;
    approveRequest.mutate(request.id, {
      onSuccess: () => showToast({ title: "Request approved" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not approve request", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleCancel = async () => {
    if (!request) return;
    const ok = await confirm({
      title: `Cancel request "${request.title}"?`,
      tone: "danger",
    });
    if (!ok) return;
    cancelRequest.mutate(request.id, {
      onSuccess: () => showToast({ title: "Request cancelled" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not cancel request", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !request) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Purchase request not found."}</Alert>;
  }

  const canEdit = canUpdate && request.status === "draft";
  const canSubmit = canUpdate && request.status === "draft" && request.item_count > 0;
  const canCancel = canUpdate && (request.status === "draft" || request.status === "submitted");
  const canReject = canApprove && request.status === "submitted";
  const canApproveNow = canApprove && request.status === "submitted";
  const canOrder = canCreateOrder && request.status === "approved";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/procurement/requests")}
          className="back-button"
        >
          <BackArrowIcon className="size-4" />
          Back to requests
        </button>
        <div className="flex flex-wrap justify-end gap-2">
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/procurement/requests/${request.id}/edit`)}>
              Edit
            </Button>
          )}
          {canUpdate && request.status === "draft" && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/procurement/requests/${request.id}/items`)}>
              <ListChecks className="size-4" aria-hidden="true" />
              Items
            </Button>
          )}
          {canSubmit && (
            <Button size="sm" onClick={handleSubmit} isLoading={submitRequest.isPending}>
              <FilePlus className="size-4" aria-hidden="true" />
              Submit
            </Button>
          )}
          {canApproveNow && (
            <Button size="sm" onClick={handleApprove} isLoading={approveRequest.isPending}>
              <Check className="size-4" aria-hidden="true" />
              Approve
            </Button>
          )}
          {canReject && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => navigate(`/procurement/requests/${request.id}/reject`)}
            >
              <XCircle className="size-4" aria-hidden="true" />
              Reject
            </Button>
          )}
          {canOrder && (
            <Button size="sm" onClick={() => navigate(`/procurement/orders/new?source_request=${request.id}`)}>
              <ShoppingCart className="size-4" aria-hidden="true" />
              Create order
            </Button>
          )}
          {canCancel && (
            <Button variant="danger" size="sm" onClick={handleCancel} isLoading={cancelRequest.isPending}>
              <Ban className="size-4" aria-hidden="true" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-[var(--color-text)]">{request.title}</CardTitle>
            <p className="text-sm text-[var(--color-text-muted)]">{request.requested_by_name}</p>
          </div>
          <Badge tone={requestStatusTone(request.status)}>{statusLabel(request.status)}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Notes" value={request.notes} />
          <Field label="Approved by" value={request.approved_by_name} />
          <Field label="Approved at" value={request.approved_at ? new Date(request.approved_at).toLocaleString() : null} />
          {request.status === "rejected" && (
            <Field label="Rejection reason" value={request.rejection_reason} />
          )}
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
                    <TableHeaderCell>Quantity</TableHeaderCell>
                    <TableHeaderCell>Est. unit price</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {items?.results.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.description}</TableCell>
                      <TableCell>
                        {item.inventory_item_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>
                        {item.estimated_unit_price ?? <span className="text-[var(--color-text-muted)]">—</span>}
                      </TableCell>
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
