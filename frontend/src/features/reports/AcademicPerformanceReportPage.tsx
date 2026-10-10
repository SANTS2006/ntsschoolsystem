import { Download, GraduationCap } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useHasPermission } from "@/features/auth/useAuth";
import { useExamList } from "@/features/examinations/useExaminationsCrud";
import type { ApiError } from "@/lib/api-client";

import { StatCard } from "../dashboard/StatCard";
import { useAcademicPerformanceReport, useDownloadReportCsv } from "./useReportsCrud";

export function AcademicPerformanceReportPage() {
  const [examId, setExamId] = useState("");

  const { data: exams } = useExamList({ page_size: 100 });
  const canExport = useHasPermission("reports.export");
  const downloadCsv = useDownloadReportCsv();

  const { data, isLoading, isFetching, isError, error } = useAcademicPerformanceReport(examId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Select value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Select an exam…</option>
            {exams?.results.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name} ({exam.term_name})
              </option>
            ))}
          </Select>
        </div>
        {canExport && (
          <Button
            variant="secondary"
            isLoading={downloadCsv.isPending}
            disabled={!examId}
            onClick={() => downloadCsv.mutate(["academic-performance", { exam_id: examId }, "academic_performance_report.csv"])}
          >
            {!downloadCsv.isPending && <Download className="size-4" aria-hidden="true" />}
            Export CSV
          </Button>
        )}
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {!examId ? (
        <EmptyState icon={GraduationCap} title="Select an exam" description="Choose an exam above to see its performance summary." />
      ) : isLoading ? (
        <FullPageSpinner />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              icon={GraduationCap}
              label="Overall average"
              value={data.overall_average_score === null ? "No data" : data.overall_average_score.toFixed(1)}
            />
            <StatCard icon={GraduationCap} label="Total results" value={data.total_results} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Subject</TableHeaderCell>
                    <TableHeaderCell className="text-right">Average</TableHeaderCell>
                    <TableHeaderCell className="text-right">Results</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {data.by_subject.map((row) => (
                    <TableRow key={row.exam_schedule__subject__name}>
                      <TableCell>{row.exam_schedule__subject__name}</TableCell>
                      <TableCell className="text-right">{row.average_score.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{row.result_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Class</TableHeaderCell>
                    <TableHeaderCell className="text-right">Average</TableHeaderCell>
                    <TableHeaderCell className="text-right">Results</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {data.by_class.map((row) => (
                    <TableRow key={row.exam_schedule__school_class__name}>
                      <TableCell>{row.exam_schedule__school_class__name}</TableCell>
                      <TableCell className="text-right">{row.average_score.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{row.result_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </div>
        </>
      ) : null}

      {isFetching && !isLoading && examId && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
