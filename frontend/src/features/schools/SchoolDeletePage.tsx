import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";

import { schoolStatusTone, statusLabel } from "./statusTone";
import { useDeleteSchool, useSchool } from "./useSchoolsCrud";

/** Permanently deletes a suspended school. Deliberately a full page with a typed confirmation: this cannot be undone. */
export function SchoolDeletePage() {
  const { id } = useParams<{ id: string }>();
  const schoolId = id as string;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: school, isLoading } = useSchool(schoolId);
  const deleteSchool = useDeleteSchool(schoolId);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <FullPageSpinner />;
  if (!school) return <Alert tone="danger">School not found.</Alert>;

  const suspended = school.status === "suspended";
  const matches = typed.trim() === school.slug;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!matches || !suspended) return;
    setError(null);
    deleteSchool.mutate(typed.trim(), {
      onSuccess: () => {
        showToast({ title: "School deleted", description: `${school.name} and its data were permanently removed.` });
        navigate("/platform/schools", { replace: true });
      },
      onError: (err: ApiError) => {
        setError(err.message);
        showToast({ title: "Could not delete school", description: err.message, tone: "danger" });
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Delete school</h1>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-[var(--color-text)]">{school.name}</CardTitle>
          <Badge tone={schoolStatusTone(school.status)}>{statusLabel(school.status)}</Badge>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert tone="danger" className="mb-4">
              {error}
            </Alert>
          )}
          {!suspended ? (
            <Alert tone="warning">A school can only be deleted after it has been suspended. Suspend it first, then come back here.</Alert>
          ) : (
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              <Alert tone="danger">
                This permanently deletes the school and everything it owns: its users and sign-in accounts, students, staff, academic records, results, fees and
                payments, messages and settings. It cannot be undone. Take a backup first if you might need any of it.
              </Alert>
              <Input
                label={`Type the school's address (${school.slug}) to confirm`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <div className="mt-2 flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => navigate(`/platform/schools/${schoolId}`)}>
                  Cancel
                </Button>
                <Button type="submit" variant="danger" disabled={!matches} isLoading={deleteSchool.isPending}>
                  {!deleteSchool.isPending && <Trash2 className="size-4" aria-hidden="true" />}
                  Delete school permanently
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
