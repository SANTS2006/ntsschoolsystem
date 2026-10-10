import { AlertCircle, CheckCircle2, Wallet } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { StatCard } from "@/features/dashboard/StatCard";
import type { ApiError } from "@/lib/api-client";

import { useInvoiceStats } from "./useFeesCrud";

export function FinanceStatsPage() {
  const { data: stats, isLoading, isError, error } = useInvoiceStats();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !stats) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Could not load stats."}</Alert>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard icon={Wallet} label="Total invoiced" value={stats.total_invoiced} tone="neutral" />
      <StatCard icon={CheckCircle2} label="Total collected" value={stats.total_collected} tone="success" />
      <StatCard icon={AlertCircle} label="Total outstanding" value={stats.total_outstanding} tone="warning" />
    </div>
  );
}
