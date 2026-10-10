import { Award, LayoutGrid, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRowLink,
} from "@/components/ui/Table";
import { useSchoolClassList } from "@/features/academics/useAcademicsCrud";
import { useDebounce } from "@/hooks/useDebounce";
import type { ApiError } from "@/lib/api-client";

const PAGE_SIZE = 25;

/** Examinations > Class results: pick a class to review its students' results, promote them and publish. Classes
 * themselves (adding, editing, deleting) are managed in Academics. */
export function ClassResultsListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const { data, isLoading, isError, error, isFetching } = useSchoolClassList({
    page,
    page_size: PAGE_SIZE,
    ordering: "order",
    search: debouncedSearch || undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Class results & publish"
        description="Choose a class to review its results, promote students and publish."
      />

      <div className="w-full max-w-xs">
        <Input
          icon={Search}
          placeholder="Search classes"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={LayoutGrid} title="No classes found" description="Try adjusting your search." />
      ) : data ? (
        <ScrollReveal>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Class</TableHeaderCell>
                  <TableHeaderCell>Next class</TableHeaderCell>
                  <TableHeaderCell>Progression</TableHeaderCell>
                  <TableHeaderCell className="text-right">Results</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {data.results.map((schoolClass) => (
                  <TableRowLink key={schoolClass.id} onClick={() => navigate(`/examinations/class-results/${schoolClass.id}`)}>
                    <TableCell className="font-medium">{schoolClass.name}</TableCell>
                    <TableCell>{schoolClass.next_class_name ?? <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        {schoolClass.is_public_exam_transition && <Badge tone="warning">Public exam</Badge>}
                        {schoolClass.is_graduation_level && <Badge tone="success">Graduation</Badge>}
                        {!schoolClass.is_public_exam_transition && !schoolClass.is_graduation_level && (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/examinations/class-results/${schoolClass.id}`);
                        }}
                        aria-label={`Results and promotion for ${schoolClass.name}`}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                      >
                        <Award className="size-4" aria-hidden="true" />
                        Open
                      </button>
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
