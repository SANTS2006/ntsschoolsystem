import { Plus, Search, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
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
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { orderStatusTone, statusLabel } from "./statusTone";
import type { PurchaseOrderStatus } from "./types";
import { usePurchaseOrderList } from "./useProcurementCrud";

const PAGE_SIZE = 25;
const STATUS_OPTIONS: PurchaseOrderStatus[] = ["draft", "sent", "partially_received", "received", "cancelled"];

export function PurchaseOrdersListPage() {
  const navigate = useNavigate();
  const canCreate = useHasPermission("procurement.create");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PurchaseOrderStatus | "">("");
  const debouncedSearch = useDebounce(search);

  const filterParams = { search: debouncedSearch || undefined, status: status || undefined };
  const { data, isLoading, isError, error, isFetching } = usePurchaseOrderList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("procurement/orders", filterParams);

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total orders", value: stats.total as number, icon: ShoppingCart }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by order number"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as PurchaseOrderStatus | "");
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(option)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/procurement/orders/" params={filterParams} filename="purchase_orders.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/procurement/orders/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New order
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No purchase orders found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Order #</TableHeaderCell>
                <TableHeaderCell>Supplier</TableHeaderCell>
                <TableHeaderCell>Items</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((order) => (
                <TableRowLink key={order.id} onClick={() => navigate(`/procurement/orders/${order.id}`)}>
                  <TableCell className="font-medium">{order.order_number}</TableCell>
                  <TableCell>{order.supplier_name}</TableCell>
                  <TableCell>{order.item_count}</TableCell>
                  <TableCell>{order.total_amount}</TableCell>
                  <TableCell>
                    <Badge tone={orderStatusTone(order.status)}>{statusLabel(order.status)}</Badge>
                  </TableCell>
                </TableRowLink>
              ))}
            </TableBody>
          </Table>
          <div className="border-t border-[var(--color-border)]">
            <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage} />
          </div>
        </TableContainer>
        </ScrollReveal>
      ) : null}

      {isFetching && !isLoading && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
