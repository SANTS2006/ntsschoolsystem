import { Layers, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
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
import { useAcademicYears, useSchoolClasses } from "@/features/academics/useAcademicsLookups";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useDeleteSection, useSectionList } from "./useAcademicsCrud";

const PAGE_SIZE = 25;

export function SectionsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("academics.create");
  const canDelete = useHasPermission("academics.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [schoolClass, setSchoolClass] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const debouncedSearch = useDebounce(search);
  const { data: schoolClasses } = useSchoolClasses();
  const { data: academicYears } = useAcademicYears();

  const filterParams = {
    search: debouncedSearch || undefined,
    school_class: schoolClass || undefined,
    academic_year: academicYear || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useSectionList({
    page,
    page_size: PAGE_SIZE,
    ordering: "name",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("academics/sections", filterParams);
  const deleteSection = useDeleteSection();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete section "${name}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteSection.mutate(id, {
      onSuccess: () => showToast({ title: `"${name}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total sections", value: stats.total as number, icon: Layers }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by name"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={schoolClass}
              onChange={(e) => {
                setSchoolClass(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All classes</option>
              {schoolClasses?.map((schoolClassOption) => (
                <option key={schoolClassOption.id} value={schoolClassOption.id}>
                  {schoolClassOption.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full max-w-[200px]">
            <Select
              value={academicYear}
              onChange={(e) => {
                setAcademicYear(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All academic years</option>
              {academicYears?.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/academics/sections/" params={filterParams} filename="sections.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/academics/sections/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New section
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Layers} title="No sections found" description="Try adjusting your filters, or create one." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Class</TableHeaderCell>
                <TableHeaderCell>Academic year</TableHeaderCell>
                <TableHeaderCell>Class teacher</TableHeaderCell>
                <TableHeaderCell>Capacity</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((section) => (
                <TableRowLink key={section.id} onClick={() => navigate(`/academics/sections/${section.id}/edit`)}>
                  <TableCell className="font-medium">{section.name}</TableCell>
                  <TableCell>{section.school_class_name}</TableCell>
                  <TableCell>{section.academic_year_name}</TableCell>
                  <TableCell>
                    {section.class_teacher_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>{section.capacity}</TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(section.id, section.name);
                        }}
                        aria-label={`Delete ${section.name}`}
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
