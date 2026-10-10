import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import { employmentStatusTone } from "./employmentStatusTone";
import { useReactivateStaff, useStaffMember, useTerminateStaff } from "./useStaffCrud";

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

export function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canUpdate = useHasPermission("staff.update");
  const canDelete = useHasPermission("staff.delete");

  const { data: staff, isLoading, isError, error } = useStaffMember(id);
  const terminateStaff = useTerminateStaff();
  const reactivateStaff = useReactivateStaff();

  const handleTerminate = async () => {
    if (!staff) return;
    const ok = await confirm({
      title: `Terminate ${staff.full_name}'s staff profile?`,
      description: 'This can be reversed with "Reactivate."',
      tone: "danger",
    });
    if (!ok) return;
    terminateStaff.mutate(staff.id, {
      onSuccess: () => showToast({ title: `${staff.full_name} terminated` }),
      onError: (err) => showToast({ title: "Failed to terminate", description: err.message, tone: "danger" }),
    });
  };

  const handleReactivate = () => {
    if (!staff) return;
    reactivateStaff.mutate(staff.id, {
      onSuccess: () => showToast({ title: `${staff.full_name} reactivated` }),
      onError: (err) => showToast({ title: "Failed to reactivate", description: err.message, tone: "danger" }),
    });
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !staff) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Staff member not found."}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/staff")}
          className="back-button"
        >
          <BackArrowIcon className="size-4" />
          Back to staff
        </button>
        <div className="flex gap-2">
          {canUpdate && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/staff/${staff.id}/edit`)}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
          )}
          {staff.employment_status === "terminated"
            ? canUpdate && (
                <Button variant="secondary" size="sm" onClick={handleReactivate} isLoading={reactivateStaff.isPending}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Reactivate
                </Button>
              )
            : canDelete && (
                <Button variant="danger" size="sm" onClick={handleTerminate} isLoading={terminateStaff.isPending}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Terminate
                </Button>
              )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar src={staff.photo} size="lg" isOnline={staff.is_online} />
            <div>
              <CardTitle className="text-base font-semibold text-[var(--color-text)]">{staff.full_name}</CardTitle>
              <p className="text-sm text-[var(--color-text-muted)]">{staff.email}</p>
            </div>
          </div>
          <Badge tone={employmentStatusTone(staff.employment_status)}>
            {staff.employment_status === "on_leave" ? "On leave" : staff.employment_status}
          </Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Staff ID" value={staff.staff_id} />
          <Field label="Job title" value={staff.job_title} />
          <Field label="Department" value={staff.department_name} />
          <Field label="Qualification" value={staff.qualification} />
          <Field label="Hire date" value={staff.hire_date} />
          <Field label="Emergency contact" value={staff.emergency_contact_name} />
          <Field label="Emergency phone" value={staff.emergency_contact_phone} />
        </CardContent>
      </Card>
    </div>
  );
}
