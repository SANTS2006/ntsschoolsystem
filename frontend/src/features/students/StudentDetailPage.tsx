import { Archive, Pencil, ShieldOff, User, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { useConfirm } from "@/components/ui/confirmContext";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { relationshipLabel } from "@/features/parents/relationshipLabel";
import type { GuardianRelationship } from "@/features/parents/types";
import { useGuardianList } from "@/features/parents/useParentsCrud";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { studentStatusTone } from "./statusTone";
import {
  useArchiveStudent,
  useLinkGuardian,
  useRestoreStudentAccess,
  useRevokeStudentAccess,
  useStudent,
  useStudentGuardians,
  useUnlinkGuardian,
} from "./useStudents";

const RELATIONSHIPS: GuardianRelationship[] = ["mother", "father", "guardian", "other"];

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

/** Lets the principal / school administrator block a student's login (with a reason) and give it back later. */
function LoginAccessSection({ studentId, hasAccount, revoked, reason, since }: { studentId: string; hasAccount: boolean; revoked: boolean; reason: string; since: string | null }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const revoke = useRevokeStudentAccess(studentId);
  const restore = useRestoreStudentAccess(studentId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submitRevoke = () => {
    if (text.trim().length < 5) {
      setError("State why access is being revoked.");
      return;
    }
    setError(null);
    revoke.mutate(text.trim(), {
      onSuccess: () => {
        showToast({ title: "Login access revoked" });
        setOpen(false);
        setText("");
      },
      onError: (err: ApiError) => setError(generalErrorMessage(err)),
    });
  };

  const submitRestore = async () => {
    const ok = await confirm({ title: "Restore this student's login?", description: "They will be able to sign in again straight away." });
    if (!ok) return;
    restore.mutate(undefined, {
      onSuccess: () => showToast({ title: "Login access restored" }),
      onError: (err: ApiError) => showToast({ title: "Could not restore", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base font-semibold">Login access</CardTitle>
        <Badge tone={revoked ? "danger" : "success"}>{revoked ? "Revoked" : "Allowed"}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!hasAccount ? (
          <p className="text-sm text-[var(--color-text-muted)]">This student has no login account.</p>
        ) : revoked ? (
          <>
            <p className="text-sm text-[var(--color-text)]">
              This student cannot sign in{since ? ` (since ${new Date(since).toLocaleDateString()})` : ""}. Reason: {reason}
            </p>
            <div>
              <Button variant="secondary" size="sm" onClick={submitRestore} isLoading={restore.isPending}>
                <UserCheck className="size-4" aria-hidden="true" />
                Restore access
              </Button>
            </div>
          </>
        ) : open ? (
          <>
            <Input label="Reason" placeholder="e.g. Fees unpaid for two terms" value={text} onChange={(e) => setText(e.target.value)} error={error ?? undefined} />
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" size="sm" onClick={submitRevoke} isLoading={revoke.isPending}>
                Revoke access
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setOpen(false); setError(null); }}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">Revoking blocks this student from signing in or using the system. Their records are kept, and you can restore access at any time.</p>
            <div>
              <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
                <ShieldOff className="size-4" aria-hidden="true" />
                Revoke login access
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GuardiansSection({ studentId, canUpdate }: { studentId: string; canUpdate: boolean }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: guardians, isLoading } = useStudentGuardians(studentId);
  const { data: allGuardians } = useGuardianList({ page_size: 100 });
  const linkGuardian = useLinkGuardian(studentId);
  const unlinkGuardian = useUnlinkGuardian(studentId);

  const [selectedGuardianId, setSelectedGuardianId] = useState("");
  const [relationship, setRelationship] = useState<GuardianRelationship>("guardian");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isEmergencyContact, setIsEmergencyContact] = useState(false);

  const linkedIds = new Set((guardians ?? []).map((g) => g.guardian.id));
  const availableGuardians = (allGuardians?.results ?? []).filter((g) => !linkedIds.has(g.id));

  const handleLink = () => {
    if (!selectedGuardianId) return;
    linkGuardian.mutate(
      { guardian_id: selectedGuardianId, relationship, is_primary: isPrimary, is_emergency_contact: isEmergencyContact },
      {
        onSuccess: () => {
          showToast({ title: "Guardian linked" });
          setSelectedGuardianId("");
          setIsPrimary(false);
          setIsEmergencyContact(false);
        },
        onError: (err: ApiError) =>
          showToast({ title: "Could not link guardian", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  const handleUnlink = async (guardianId: string, name: string) => {
    const ok = await confirm({
      title: `Unlink ${name} from this student?`,
      tone: "danger",
    });
    if (!ok) return;
    unlinkGuardian.mutate(guardianId, {
      onSuccess: () => showToast({ title: "Guardian unlinked" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not unlink guardian", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guardians</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <Spinner />
        ) : guardians && guardians.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No guardians linked yet.</p>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Relationship</TableHeaderCell>
                  <TableHeaderCell>Contact</TableHeaderCell>
                  <TableHeaderCell>Flags</TableHeaderCell>
                  {canUpdate && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
                </tr>
              </TableHead>
              <TableBody>
                {guardians?.map((sg) => (
                  <TableRow key={sg.id}>
                    <TableCell className="font-medium">{sg.guardian.full_name}</TableCell>
                    <TableCell>{relationshipLabel(sg.relationship)}</TableCell>
                    <TableCell>
                      {sg.guardian.phone_number || sg.guardian.email || (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        {sg.is_primary && <Badge tone="primary">Primary</Badge>}
                        {sg.is_emergency_contact && <Badge tone="warning">Emergency</Badge>}
                      </div>
                    </TableCell>
                    {canUpdate && (
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={() => handleUnlink(sg.guardian.id, sg.guardian.full_name)}
                          aria-label={`Unlink ${sg.guardian.full_name}`}
                          className="ml-auto flex items-center rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                        >
                          <UserMinus className="size-4" aria-hidden="true" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {canUpdate && (
          <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
            <p className="text-sm font-medium text-[var(--color-text)]">Link a guardian</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select value={selectedGuardianId} onChange={(e) => setSelectedGuardianId(e.target.value)}>
                <option value="">Select a guardian</option>
                {availableGuardians.map((guardian) => (
                  <option key={guardian.id} value={guardian.id}>
                    {guardian.full_name}
                  </option>
                ))}
              </Select>
              <Select value={relationship} onChange={(e) => setRelationship(e.target.value as GuardianRelationship)}>
                {RELATIONSHIPS.map((option) => (
                  <option key={option} value={option}>
                    {relationshipLabel(option)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap gap-4">
              <Checkbox label="Primary contact" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
              <Checkbox
                label="Emergency contact"
                checked={isEmergencyContact}
                onChange={(e) => setIsEmergencyContact(e.target.checked)}
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={handleLink}
                disabled={!selectedGuardianId}
                isLoading={linkGuardian.isPending}
              >
                {!linkGuardian.isPending && <UserPlus className="size-4" aria-hidden="true" />}
                Link guardian
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canUpdate = useHasPermission("students.update");
  const canDelete = useHasPermission("students.delete");
  const canRevoke = useHasPermission("students.revoke_access");

  const { data: student, isLoading, isError, error } = useStudent(id);
  const archiveStudent = useArchiveStudent();

  const handleArchive = async () => {
    if (!student) return;
    const ok = await confirm({
      title: `Archive ${student.full_name}?`,
      description: "They will no longer appear in the active student list.",
      tone: "danger",
    });
    if (!ok) return;
    archiveStudent.mutate(student.id, {
      onSuccess: () => {
        showToast({ title: `${student.full_name} archived` });
        navigate("/students");
      },
      onError: (err) => showToast({ title: "Failed to archive student", description: err.message, tone: "danger" }),
    });
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !student) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Student not found."}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/students")}
          className="back-button"
        >
          <BackArrowIcon className="size-4" />
          Back to students
        </button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/academics/students/${student.id}/graduation-status`)}
          >
            Graduation status
          </Button>
          {canUpdate && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/students/${student.id}/edit`)}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
          )}
          {canDelete && student.status !== "archived" && (
            <Button variant="danger" size="sm" onClick={handleArchive} isLoading={archiveStudent.isPending}>
              <Archive className="size-4" aria-hidden="true" />
              Archive
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
              {student.photo ? (
                <img src={student.photo} alt="" className="size-full object-cover" />
              ) : (
                <User className="size-7 text-[var(--color-text-muted)]" aria-hidden="true" />
              )}
            </span>
            <div>
              <CardTitle className="text-base font-semibold text-[var(--color-text)]">{student.full_name}</CardTitle>
              <p className="text-sm text-[var(--color-text-muted)]">{student.admission_number}</p>
            </div>
          </div>
          <Badge tone={studentStatusTone(student.status)}>{student.status}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Gender" value={student.gender} />
          <Field label="Date of birth" value={student.date_of_birth} />
          <Field label="Admission date" value={student.admission_date} />
          <Field label="Previous school" value={student.previous_school} />
          <Field label="Academic year" value={student.current_academic_year_name} />
          <Field
            label="Class"
            value={
              student.current_class_name
                ? `${student.current_class_name}${student.current_section_name ? ` - ${student.current_section_name}` : ""}`
                : null
            }
          />
          <Field label="Address" value={student.address} />
        </CardContent>
      </Card>

      {canRevoke && (
        <LoginAccessSection
          studentId={student.id}
          hasAccount={!!student.user}
          revoked={student.access_revoked}
          reason={student.access_revoked_reason}
          since={student.access_revoked_at}
        />
      )}

      <GuardiansSection studentId={student.id} canUpdate={canUpdate} />
    </div>
  );
}
