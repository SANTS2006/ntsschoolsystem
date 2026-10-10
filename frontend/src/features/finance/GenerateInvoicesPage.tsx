import { Wand2 } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/toastContext";
import { useSchoolClasses } from "@/features/academics/useAcademicsLookups";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import type { GenerateInvoicesResponse } from "./types";
import { useFeeStructureList, useGenerateInvoices } from "./useFeesCrud";

export function GenerateInvoicesPage() {
  const { showToast } = useToast();
  const canCreate = useHasPermission("fees.create");

  const [feeStructureId, setFeeStructureId] = useState("");
  const [schoolClassId, setSchoolClassId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [result, setResult] = useState<GenerateInvoicesResponse | null>(null);

  const { data: structures } = useFeeStructureList({ page_size: 100 });
  const { data: schoolClasses } = useSchoolClasses();
  const generateInvoices = useGenerateInvoices();

  const handleSubmit = () => {
    setResult(null);
    generateInvoices.mutate(
      {
        fee_structure: feeStructureId,
        school_class: schoolClassId || undefined,
        due_date: dueDate || undefined,
      },
      {
        onSuccess: (response) => {
          setResult(response);
          showToast({ title: response.message });
        },
        onError: (err: ApiError) =>
          showToast({ title: "Could not generate invoices", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate invoices</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            Creates one invoice per active student from a fee structure's line items. Re-running this for the same
            structure skips any student who already has an invoice from it — safe to run again after enrolling new
            students.
          </p>

          {generateInvoices.isError && (
            <Alert tone="danger">{generalErrorMessage(generateInvoices.error as ApiError)}</Alert>
          )}

          <Select label="Fee structure" value={feeStructureId} onChange={(e) => setFeeStructureId(e.target.value)}>
            <option value="">Select a fee structure</option>
            {structures?.results.map((structure) => (
              <option key={structure.id} value={structure.id}>
                {structure.name}
              </option>
            ))}
          </Select>
          <Select
            label="Class"
            hint="Overrides the structure's own class, if it has one. Leave unset to use the structure's class (or all active students, if it has none)."
            value={schoolClassId}
            onChange={(e) => setSchoolClassId(e.target.value)}
          >
            <option value="">Use the structure's own class</option>
            {schoolClasses?.map((schoolClass) => (
              <option key={schoolClass.id} value={schoolClass.id}>
                {schoolClass.name}
              </option>
            ))}
          </Select>
          <Input type="date" label="Due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

          {canCreate && (
            <div className="flex justify-end">
              <Button onClick={handleSubmit} isLoading={generateInvoices.isPending} disabled={!feeStructureId}>
                <Wand2 className="size-4" aria-hidden="true" />
                Generate invoices
              </Button>
            </div>
          )}

          {result && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3 text-sm">
              <p className="font-medium text-[var(--color-text)]">{result.invoices.length} invoice(s) created</p>
              {result.skipped_student_ids.length > 0 && (
                <p className="mt-1 text-[var(--color-text-muted)]">
                  {result.skipped_student_ids.length} student(s) already had an invoice from this structure and were
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
