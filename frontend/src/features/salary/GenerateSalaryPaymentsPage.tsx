import { Wand2 } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import type { GenerateSalaryPaymentsResponse } from "./types";
import { useGenerateSalaryPayments } from "./useSalaryCrud";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const now = new Date();

export function GenerateSalaryPaymentsPage() {
  const { showToast } = useToast();
  const canCreate = useHasPermission("salary.create");

  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [result, setResult] = useState<GenerateSalaryPaymentsResponse | null>(null);

  const generatePayments = useGenerateSalaryPayments();

  const handleSubmit = () => {
    setResult(null);
    generatePayments.mutate(
      { period_year: periodYear, period_month: periodMonth },
      {
        onSuccess: (response) => {
          setResult(response);
          showToast({ title: response.message });
        },
        onError: (err: ApiError) =>
          showToast({ title: "Could not generate payments", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate salary payments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            Creates one pending salary payment for every staff member with an assigned salary structure, for the
            chosen month. Re-running for the same month skips anyone who already has a payment — safe to run again.
          </p>

          {generatePayments.isError && (
            <Alert tone="danger">{generalErrorMessage(generatePayments.error as ApiError)}</Alert>
          )}

          <div className="flex flex-wrap gap-4">
            <div className="w-full max-w-[200px]">
              <Select
                label="Month"
                value={periodMonth}
                onChange={(e) => setPeriodMonth(Number(e.target.value))}
              >
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full max-w-[140px]">
              <Select
                label="Year"
                value={periodYear}
                onChange={(e) => setPeriodYear(Number(e.target.value))}
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {canCreate && (
            <div className="flex justify-end">
              <Button onClick={handleSubmit} isLoading={generatePayments.isPending}>
                <Wand2 className="size-4" aria-hidden="true" />
                Generate payments
              </Button>
            </div>
          )}

          {result && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3 text-sm">
              <p className="font-medium text-[var(--color-text)]">{result.payments.length} payment(s) created</p>
              {result.skipped_staff_ids.length > 0 && (
                <p className="mt-1 text-[var(--color-text-muted)]">
                  {result.skipped_staff_ids.length} staff member(s) already had a payment for this month and were
                  skipped.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
