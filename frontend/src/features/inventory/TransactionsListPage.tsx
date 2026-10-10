import { History } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
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
  TableRow,
} from "@/components/ui/Table";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { transactionTypeLabel, transactionTypeTone } from "./statusTone";
import type { TransactionType } from "./types";
import { useItemList, useTransactionList } from "./useInventoryCrud";

const PAGE_SIZE = 25;
const TRANSACTION_TYPES: TransactionType[] = ["stock_in", "stock_out"];

export function TransactionsListPage() {
  const [page, setPage] = useState(1);
  const [itemId, setItemId] = useState("");
  const [transactionType, setTransactionType] = useState<TransactionType | "">("");

  const { data: items } = useItemList({ page_size: 100 });
  const filterParams = { item: itemId || undefined, transaction_type: transactionType || undefined };
  const { data, isLoading, isError, error, isFetching } = useTransactionList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("inventory/transactions", filterParams);

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total movements", value: stats.total as number, icon: History }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
        <div className="w-full max-w-[220px]">
          <Select
            value={itemId}
            onChange={(e) => {
              setItemId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All items</option>
            {items?.results.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full max-w-[160px]">
          <Select
            value={transactionType}
            onChange={(e) => {
              setTransactionType(e.target.value as TransactionType | "");
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {TRANSACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {transactionTypeLabel(type)}
              </option>
            ))}
          </Select>
        </div>
        </div>
        <ExportCsvButton path="/inventory/transactions/" params={filterParams} filename="inventory_transactions.csv" />
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={History} title="No stock movements found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Item</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Quantity</TableHeaderCell>
                <TableHeaderCell>Reason</TableHeaderCell>
                <TableHeaderCell>Recorded by</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell>{new Date(txn.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-medium">{txn.item_name}</TableCell>
                  <TableCell>
                    <Badge tone={transactionTypeTone(txn.transaction_type)}>
                      {transactionTypeLabel(txn.transaction_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>{txn.quantity}</TableCell>
                  <TableCell>{txn.reason || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>
                    {txn.recorded_by_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                </TableRow>
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
