import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, Package, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { useConfirm } from "@/components/ui/confirmContext";
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
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useCategoryList, useDeleteItem, useItemList, useLowStockItems } from "./useInventoryCrud";

const PAGE_SIZE = 25;

export function ItemsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("inventory.create");
  const canUpdate = useHasPermission("inventory.update");
  const canDelete = useHasPermission("inventory.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isActive, setIsActive] = useState<"" | "true" | "false">("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const debouncedSearch = useDebounce(search);

  const { data: categories } = useCategoryList({ page_size: 100 });
  const filterParams = {
    search: debouncedSearch || undefined,
    category: categoryId || undefined,
    is_active: isActive === "" ? undefined : isActive === "true",
  };
  const list = useItemList(
    {
      page,
      page_size: PAGE_SIZE,
      ...filterParams,
    },
    { enabled: !lowStockOnly },
  );
  const { data: stats } = useSummaryStats("inventory/items", filterParams);
  const lowStock = useLowStockItems({ enabled: lowStockOnly });
  const deleteItem = useDeleteItem();

  const isLoading = lowStockOnly ? lowStock.isLoading : list.isLoading;
  const isError = lowStockOnly ? lowStock.isError : list.isError;
  const error = lowStockOnly ? lowStock.error : list.error;
  const isFetching = lowStockOnly ? lowStock.isFetching : list.isFetching;
  const results = lowStockOnly ? (lowStock.data ?? []) : (list.data?.results ?? []);

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete item "${name}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteItem.mutate(id, {
      onSuccess: () => showToast({ title: `"${name}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total items", value: stats.total as number, icon: Package },
              { key: "active", label: "Active", value: stats.active as number, tone: "success", icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by name or SKU"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              disabled={lowStockOnly}
            />
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              disabled={lowStockOnly}
            >
              <option value="">All categories</option>
              {categories?.results.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full max-w-[160px]">
            <Select
              value={isActive}
              onChange={(e) => {
                setIsActive(e.target.value as "" | "true" | "false");
                setPage(1);
              }}
              disabled={lowStockOnly}
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </div>
          <Checkbox
            label="Low stock only"
            checked={lowStockOnly}
            onChange={(e) => {
              setLowStockOnly(e.target.checked);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/inventory/items/" params={filterParams} filename="inventory_items.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/inventory/items/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New item
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Package}
          title={lowStockOnly ? "No low-stock items" : "No items found"}
          description={lowStockOnly ? "Every active item is above its reorder level." : "Try adjusting your filters."}
        />
      ) : (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>SKU</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Stock</TableHeaderCell>
                <TableHeaderCell>Location</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {results.map((item) => (
                <TableRowLink key={item.id} onClick={() => navigate(`/inventory/items/${item.id}/edit`)}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.sku || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>
                    {item.category_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {item.quantity_in_stock} {item.unit}
                      {item.is_low_stock && <Badge tone="danger">Low</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{item.location || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>
                    <Badge tone={item.is_active ? "success" : "neutral"}>{item.is_active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canUpdate && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/inventory/items/${item.id}/stock-in`);
                            }}
                            aria-label={`Stock in ${item.name}`}
                            title="Stock in"
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-success)]"
                          >
                            <ArrowDownCircle className="size-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/inventory/items/${item.id}/stock-out`);
                            }}
                            aria-label={`Stock out ${item.name}`}
                            title="Stock out"
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-warning)]"
                          >
                            <ArrowUpCircle className="size-4" aria-hidden="true" />
                          </button>
                        </>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id, item.name);
                          }}
                          aria-label={`Delete ${item.name}`}
                          title="Delete"
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRowLink>
              ))}
            </TableBody>
          </Table>
          {!lowStockOnly && list.data && (
            <div className="border-t border-[var(--color-border)]">
              <Pagination page={page} pageSize={PAGE_SIZE} count={list.data.count} onPageChange={setPage} />
            </div>
          )}
        </TableContainer>
        </ScrollReveal>
      )}

      {isFetching && !isLoading && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
