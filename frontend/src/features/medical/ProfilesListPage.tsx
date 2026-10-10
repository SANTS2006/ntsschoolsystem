import { HeartPulse, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
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
  TableRowLink,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import type { BloodGroup } from "./types";
import { useDeleteProfile, useProfileList } from "./useMedicalCrud";

const PAGE_SIZE = 25;
const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"];

export function ProfilesListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("medical.create");
  const canDelete = useHasPermission("medical.delete");

  const [page, setPage] = useState(1);
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | "">("");

  const filterParams = { blood_group: bloodGroup || undefined };
  const { data, isLoading, isError, error, isFetching } = useProfileList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("medical/profiles", filterParams);
  const deleteProfile = useDeleteProfile();

  const handleDelete = async (id: string, student: string) => {
    const ok = await confirm({
      title: `Delete the medical profile for ${student}?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteProfile.mutate(id, {
      onSuccess: () => showToast({ title: "Medical profile deleted" }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total profiles", value: stats.total as number, icon: HeartPulse }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-[180px]">
          <Select
            value={bloodGroup}
            onChange={(e) => {
              setBloodGroup(e.target.value as BloodGroup | "");
              setPage(1);
            }}
          >
            <option value="">All blood groups</option>
            {BLOOD_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group === "unknown" ? "Unknown" : group}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/medical/profiles/" params={filterParams} filename="medical_profiles.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/medical/profiles/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New profile
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={HeartPulse} title="No medical profiles found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Blood group</TableHeaderCell>
                <TableHeaderCell>Allergies</TableHeaderCell>
                <TableHeaderCell>Emergency contact</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((profile) => (
                <TableRowLink key={profile.id} onClick={() => navigate(`/medical/profiles/${profile.id}/edit`)}>
                  <TableCell className="font-medium">{profile.student_name}</TableCell>
                  <TableCell>
                    <Badge tone={profile.blood_group === "unknown" ? "neutral" : "primary"}>
                      {profile.blood_group === "unknown" ? "Unknown" : profile.blood_group}
                    </Badge>
                  </TableCell>
                  <TableCell>{profile.allergies || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>
                    {profile.emergency_contact_name ? (
                      `${profile.emergency_contact_name}${profile.emergency_contact_phone ? ` (${profile.emergency_contact_phone})` : ""}`
                    ) : (
                      <span className="text-[var(--color-text-muted)]">—</span>
                    )}
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(profile.id, profile.student_name);
                        }}
                        aria-label={`Delete medical profile for ${profile.student_name}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </TableCell>
                  )}
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
