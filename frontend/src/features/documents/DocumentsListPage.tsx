import { Download, Eye, FileText, Lock, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { OpenFileButton } from "@/components/ui/FileViewer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Input } from "@/components/ui/Input";
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
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";
import { triggerFileDownload } from "@/lib/fileDownload";

import { ownerTypeLabel, ownerTypeTone } from "./statusTone";
import type { OwnerType } from "./types";
import { useCategoryList, useDeleteDocument, useDocumentList } from "./useDocumentsCrud";

const PAGE_SIZE = 25;
const OWNER_TYPES: OwnerType[] = ["school", "student", "staff"];

export function DocumentsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("documents.create");
  const canDelete = useHasPermission("documents.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [ownerType, setOwnerType] = useState<OwnerType | "">("");
  const [categoryId, setCategoryId] = useState("");
  const debouncedSearch = useDebounce(search);

  const { data: categories } = useCategoryList({ page_size: 100 });
  const filterParams = {
    search: debouncedSearch || undefined,
    owner_type: ownerType || undefined,
    category: categoryId || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useDocumentList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("documents", filterParams);
  const deleteDocument = useDeleteDocument();

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: `Delete document "${title}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteDocument.mutate(id, {
      onSuccess: () => showToast({ title: `"${title}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total documents", value: stats.total as number, icon: FileText },
              { key: "confidential", label: "Confidential", value: stats.confidential as number, tone: "warning", icon: Lock },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by title or description"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[160px]">
            <Select
              value={ownerType}
              onChange={(e) => {
                setOwnerType(e.target.value as OwnerType | "");
                setPage(1);
              }}
            >
              <option value="">All owners</option>
              {OWNER_TYPES.map((option) => (
                <option key={option} value={option}>
                  {ownerTypeLabel(option)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {categories?.results.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/documents/" params={filterParams} filename="documents.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/documents/files/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New document
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={FileText} title="No documents found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Owner</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Confidential</TableHeaderCell>
                <TableHeaderCell>Uploaded by</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((document) => (
                <TableRowLink key={document.id} onClick={document.is_mine ? () => navigate(`/documents/files/${document.id}/edit`) : undefined}>
                  <TableCell className="font-medium">{document.title}</TableCell>
                  <TableCell>
                    <Badge tone={ownerTypeTone(document.owner_type)}>{ownerTypeLabel(document.owner_type)}</Badge>
                    {document.student_name && ` — ${document.student_name}`}
                    {document.staff_name && ` — ${document.staff_name}`}
                  </TableCell>
                  <TableCell>
                    {document.category_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>
                    {document.is_confidential ? (
                      <Badge tone="danger">Confidential</Badge>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {document.uploaded_by_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <OpenFileButton
                        url={document.file}
                        title={document.title}
                        ariaLabel={`View ${document.title}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                      >
                        <Eye className="size-4" aria-hidden="true" />
                      </OpenFileButton>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerFileDownload(document.file, document.title);
                        }}
                        aria-label={`Download ${document.title}`}
                        title="Download"
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                      >
                        <Download className="size-4" aria-hidden="true" />
                      </button>
                      {canDelete && document.is_mine && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(document.id, document.title);
                          }}
                          aria-label={`Delete ${document.title}`}
                          title="Delete"
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </TableCell>
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
