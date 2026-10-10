import { Plus, Trash2, Users } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { FullPageSpinner } from "@/components/ui/Spinner";
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
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useAnnouncement, useDeleteRecipient, useRecipientList } from "./useCommunicationsCrud";

export function RecipientsListPage() {
  const { announcementId } = useParams<{ announcementId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("communications.create");
  const canDelete = useHasPermission("communications.delete");

  const { data: announcement, isLoading: isLoadingAnnouncement } = useAnnouncement(announcementId);
  const { data, isLoading, isError, error } = useRecipientList(
    { announcement: announcementId, page_size: 100 },
    { enabled: !!announcementId },
  );
  const { data: stats } = useSummaryStats("communications/announcement-recipients", { announcement: announcementId });
  const deleteRecipient = useDeleteRecipient();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Remove ${name} from the recipient list?`,
      tone: "danger",
    });
    if (!ok) return;
    deleteRecipient.mutate(id, {
      onSuccess: () => showToast({ title: "Recipient removed" }),
      onError: (err) => showToast({ title: "Failed to remove", description: err.message, tone: "danger" }),
    });
  };

  if (isLoadingAnnouncement) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate("/communications")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to announcements
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Recipients of {announcement?.title ?? "this announcement"}
        </h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton
            path="/communications/announcement-recipients/"
            params={{ announcement: announcementId }}
            filename="announcement_recipients.csv"
          />
          {canCreate && (
            <Button onClick={() => navigate(`/communications/${announcementId}/recipients/new`)}>
              <Plus className="size-4" aria-hidden="true" />
              Add recipient
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total recipients", value: stats.total as number, icon: Users }]} />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Users} title="No recipients yet" description="Add users to receive this announcement." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>User</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((recipient) => (
                <TableRow key={recipient.id}>
                  <TableCell className="font-medium">{recipient.user_name}</TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(recipient.id, recipient.user_name)}
                        aria-label={`Remove ${recipient.user_name}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        </ScrollReveal>
      ) : null}
    </div>
  );
}
