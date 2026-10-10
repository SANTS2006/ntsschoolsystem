import { GraduationCap } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrintableDocument } from "@/components/ui/PrintableDocument";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { LogoBadge } from "@/layouts/AppShell";
import type { ApiError } from "@/lib/api-client";

import { useMyTranscript } from "./useResultsCrud";

export function TranscriptPage() {
  const { data: transcript, isLoading, isError, error } = useMyTranscript();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  if (!transcript?.student) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No transcript available"
        description="Your transcript becomes available once your school links your account to a student record."
      />
    );
  }

  return (
    <PrintableDocument
      title="My Transcript"
      description={`Published and locked results only — official grades for ${transcript.student.name}.`}
      filename={`Transcript - ${transcript.student.name}.pdf`}
    >
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <LogoBadge logoUrl={transcript.school?.logo} className="size-12" />
          <div className="min-w-0">
            <CardTitle className="truncate text-base font-semibold text-[var(--color-text)]">
              {transcript.school?.name ?? "Official Transcript"}
            </CardTitle>
            <p className="truncate text-sm text-[var(--color-text-muted)]">{transcript.student.name}</p>
          </div>
        </CardHeader>
        <CardContent>
          {transcript.terms.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="No published results yet"
              description="Once your school publishes results, they'll appear here grouped by term."
            />
          ) : (
            <div className="flex flex-col gap-6">
              {transcript.terms.map((term) => (
                <div key={term.id}>
                  <h3 className="mb-2 text-sm font-semibold text-[var(--color-text)]">{term.name}</h3>
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <tr>
                          <TableHeaderCell>Subject</TableHeaderCell>
                          <TableHeaderCell>Exam</TableHeaderCell>
                          <TableHeaderCell>Exam score</TableHeaderCell>
                          <TableHeaderCell>CA</TableHeaderCell>
                          <TableHeaderCell>Final score</TableHeaderCell>
                          <TableHeaderCell>Grade</TableHeaderCell>
                          <TableHeaderCell>Comment</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {term.results.map((entry, index) => (
                          <TableRow key={`${entry.subject}-${entry.exam}-${index}`}>
                            <TableCell className="font-medium">{entry.subject}</TableCell>
                            <TableCell>{entry.exam}</TableCell>
                            <TableCell>{entry.exam_score ?? <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                            <TableCell>{entry.ca_score ?? <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                            <TableCell>
                              {entry.score ?? <span className="text-[var(--color-text-muted)]">—</span>} / {entry.max_score}
                            </TableCell>
                            <TableCell>{entry.grade || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                            <TableCell>
                              {entry.teacher_comment || <span className="text-[var(--color-text-muted)]">—</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PrintableDocument>
  );
}
