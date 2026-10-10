import { Layers, Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
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
  TableRowLink,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { copyStatusTone, statusLabel } from "./statusTone";
import { useBook, useBookCopyList, useDeleteBookCopy } from "./useLibraryCrud";

export function BookCopiesListPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("library.create");
  const canDelete = useHasPermission("library.delete");

  const { data: book, isLoading: isLoadingBook } = useBook(bookId);
  const filterParams = { book: bookId };
  const { data, isLoading, isError, error } = useBookCopyList(
    { ...filterParams, page_size: 100 },
    { enabled: !!bookId },
  );
  const { data: stats } = useSummaryStats("library/copies", filterParams);
  const deleteCopy = useDeleteBookCopy();

  const handleDelete = async (id: string, copyNumber: string) => {
    const ok = await confirm({
      title: `Delete copy "${copyNumber}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteCopy.mutate(id, {
      onSuccess: () => showToast({ title: `Copy "${copyNumber}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  if (isLoadingBook) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate("/library/books")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to books
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Copies of {book?.title ?? "this book"}</h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/library/copies/" params={filterParams} filename="library_book_copies.csv" />
          {canCreate && (
            <Button onClick={() => navigate(`/library/books/${bookId}/copies/new`)}>
              <Plus className="size-4" aria-hidden="true" />
              New copy
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total copies", value: stats.total as number, icon: Layers }]} />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Layers} title="No copies yet" description="Add a copy so this book can be checked out." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Copy #</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((copy) => (
                <TableRowLink
                  key={copy.id}
                  onClick={() => navigate(`/library/books/${bookId}/copies/${copy.id}/edit`)}
                >
                  <TableCell className="font-medium">{copy.copy_number}</TableCell>
                  <TableCell>
                    <Badge tone={copyStatusTone(copy.status)}>{statusLabel(copy.status)}</Badge>
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(copy.id, copy.copy_number);
                        }}
                        aria-label={`Delete copy ${copy.copy_number}`}
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
        </TableContainer>
        </ScrollReveal>
      ) : null}
    </div>
  );
}
