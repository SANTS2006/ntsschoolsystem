import { ArrowUpDown, Award, CheckCircle2, ClipboardCheck, Lock, Send } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
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
import type { ApiError } from "@/lib/api-client";

import type { PromotionRecord, PromotionStatus, TermResultPublicationStatus } from "./types";
import { useAcademicYears, useSchoolClasses } from "./useAcademicsLookups";
import {
  useBulkPromote,
  useClassOverallResults,
  useClassTermResults,
  useLockTermResults,
  useManualPromote,
  usePromotionRecords,
  usePublishTermResults,
  useTermList,
  useTermResultPublications,
  useVerifyTermResults,
} from "./useAcademicsCrud";

const PROMOTION_STATUS_LABEL: Record<PromotionStatus, string> = {
  promoted: "PROMOTED",
  repeated: "FAILED — REPEAT",
  public_exam_required: "PUBLIC EXAMINATION REQUIRED",
};

const PROMOTION_STATUS_TONE: Record<PromotionStatus, BadgeTone> = {
  promoted: "success",
  repeated: "danger",
  public_exam_required: "warning",
};

const PUBLICATION_STATUS_LABEL: Record<TermResultPublicationStatus, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  ready_for_review: "Ready For Review",
  verified: "Verified",
  published: "Published",
  locked: "Locked",
};

const PUBLICATION_STATUS_TONE: Record<TermResultPublicationStatus, BadgeTone> = {
  draft: "neutral",
  in_progress: "neutral",
  ready_for_review: "warning",
  verified: "primary",
  published: "success",
  locked: "success",
};

function ResolvePendingForm({ record }: { record: PromotionRecord }) {
  const { showToast } = useToast();
  const { data: schoolClasses } = useSchoolClasses();
  const { data: academicYears } = useAcademicYears();
  const manualPromote = useManualPromote();

  const [newClass, setNewClass] = useState("");
  const [newYear, setNewYear] = useState("");
  const [decisionStatus, setDecisionStatus] = useState<"promoted" | "repeated">("promoted");
  const [examStatus, setExamStatus] = useState<"passed" | "failed">("passed");

  const handleResolve = () => {
    if (!newClass || !newYear) return;
    manualPromote.mutate(
      {
        student: record.student,
        new_class: newClass,
        new_academic_year: newYear,
        status: decisionStatus,
        external_exam_status: examStatus,
      },
      {
        onSuccess: () => showToast({ title: "Promotion resolved" }),
        onError: (err: ApiError) => showToast({ title: "Could not resolve", description: err.message, tone: "danger" }),
      },
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3">
      <div className="w-40">
        <Select label="New class" value={newClass} onChange={(e) => setNewClass(e.target.value)}>
          <option value="">Select</option>
          {schoolClasses?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>
      <div className="w-40">
        <Select label="New year" value={newYear} onChange={(e) => setNewYear(e.target.value)}>
          <option value="">Select</option>
          {academicYears?.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </Select>
      </div>
      <div className="w-32">
        <Select label="Result" value={decisionStatus} onChange={(e) => setDecisionStatus(e.target.value as "promoted" | "repeated")}>
          <option value="promoted">Promoted</option>
          <option value="repeated">Repeated</option>
        </Select>
      </div>
      <div className="w-32">
        <Select label="Exam" value={examStatus} onChange={(e) => setExamStatus(e.target.value as "passed" | "failed")}>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
        </Select>
      </div>
      <Button size="sm" onClick={handleResolve} disabled={!newClass || !newYear} isLoading={manualPromote.isPending}>
        Resolve
      </Button>
    </div>
  );
}

export function ClassResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Opened from Examinations > Class results (rather than Academics > Classes)?
  const fromExams = useLocation().pathname.startsWith("/examinations");
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canPromote = useHasPermission("academics.update");
  const canVerify = useHasPermission("results.approve");
  const canPublish = useHasPermission("results.publish");
  const canLock = useHasPermission("results.lock");

  const { data: schoolClasses } = useSchoolClasses();
  const schoolClass = schoolClasses?.find((c) => c.id === id);
  const { data: academicYears } = useAcademicYears();

  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("");
  const [targetYear, setTargetYear] = useState("");

  const { data: terms } = useTermList({ page_size: 100, academic_year: academicYear || undefined });
  const { data: termResults, isLoading: isLoadingTermResults } = useClassTermResults(id, term || undefined);
  const { data: overallResults, isLoading: isLoadingOverall } = useClassOverallResults(id, academicYear || undefined);
  const { data: promotionRecords } = usePromotionRecords({
    page_size: 100,
    previous_class: id,
    previous_academic_year: academicYear || undefined,
  });
  const { data: publications } = useTermResultPublications({
    page_size: 100,
    school_class: id,
    term: term || undefined,
  });
  const bulkPromote = useBulkPromote();
  const verifyResults = useVerifyTermResults();
  const publishResults = usePublishTermResults();
  const lockResults = useLockTermResults();

  const runTransition = async (
    mutation: typeof verifyResults,
    label: string,
    description: string,
  ) => {
    if (!id || !term) return;
    const ok = await confirm({ title: label, description });
    if (!ok) return;
    mutation.mutate(
      { school_classes: [id], term },
      {
        onSuccess: (result) =>
          showToast({
            title: "Done",
            description: `${result.processed_count} processed, ${result.skipped_count} not ready.`,
          }),
        onError: (err: ApiError) => showToast({ title: "Could not complete", description: err.message, tone: "danger" }),
      },
    );
  };

  const handleBulkPromote = async () => {
    if (!id || !academicYear || !targetYear) return;
    const ok = await confirm({
      title: "Run promotion for this class?",
      description: "Each student's Overall % will be compared against the school's threshold. This cannot be undone.",
    });
    if (!ok) return;
    bulkPromote.mutate(
      { school_class: id, academic_year: academicYear, target_academic_year: targetYear },
      {
        onSuccess: (result) =>
          showToast({
            title: "Promotion complete",
            description: `${result.records.length} processed, ${result.skipped_count} already decided.`,
          }),
        onError: (err: ApiError) => showToast({ title: "Could not promote", description: err.message, tone: "danger" }),
      },
    );
  };

  const pendingRecords = promotionRecords?.results.filter((r) => r.status === "public_exam_required") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(fromExams ? "/examinations/class-results" : "/academics/classes")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to classes
      </button>

      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          {schoolClass?.name ?? "Class"} — Results & Promotion
        </h1>
        {schoolClass?.is_public_exam_transition && (
          <Badge tone="warning" className="mt-2">Public examination transition class</Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <Select
            label="Academic year"
            value={academicYear}
            onChange={(e) => { setAcademicYear(e.target.value); setTerm(""); }}
          >
            <option value="">Select a year</option>
            {academicYears?.map((y) => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select label="Term" value={term} onChange={(e) => setTerm(e.target.value)} hint={!academicYear ? "Select a year first." : undefined}>
            <option value="">Select a term</option>
            {terms?.results.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpDown className="size-4" aria-hidden="true" />
            Class positions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!term ? (
            <p className="text-sm text-[var(--color-text-muted)]">Select a term to view rankings.</p>
          ) : isLoadingTermResults ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : !termResults || termResults.rows.length === 0 ? (
            <EmptyState title="No ranked students yet" description="No student in this class has a complete Term Percentage yet." />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Position</TableHeaderCell>
                    <TableHeaderCell>Student</TableHeaderCell>
                    <TableHeaderCell>Term %</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {termResults.rows.map((row) => (
                    <TableRow key={row.student}>
                      <TableCell className="font-semibold">{row.position}</TableCell>
                      <TableCell>
                        {row.student_name}
                        <span className="ml-1 text-[var(--color-text-muted)]">({row.student_admission_number})</span>
                      </TableCell>
                      <TableCell>{row.term_percentage}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {term && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-4" aria-hidden="true" />
              Publish results
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {(canVerify || canPublish || canLock) && (
              <div className="flex flex-wrap gap-3">
                {canVerify && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      runTransition(
                        verifyResults,
                        "Verify results for this class/term?",
                        "Only students with fully complete subject scores will be verified.",
                      )
                    }
                    isLoading={verifyResults.isPending}
                  >
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    Verify all
                  </Button>
                )}
                {canPublish && (
                  <Button
                    size="sm"
                    onClick={() =>
                      runTransition(
                        publishResults,
                        "Publish results for this class/term?",
                        "Verified students will become visible to themselves, with a notification sent.",
                      )
                    }
                    isLoading={publishResults.isPending}
                  >
                    <Send className="size-4" aria-hidden="true" />
                    Publish all
                  </Button>
                )}
                {canLock && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      runTransition(
                        lockResults,
                        "Lock results for this class/term?",
                        "Locked results can no longer be changed.",
                      )
                    }
                    isLoading={lockResults.isPending}
                  >
                    <Lock className="size-4" aria-hidden="true" />
                    Lock all
                  </Button>
                )}
              </div>
            )}

            {!publications || publications.results.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                No publication activity yet for this class/term — run Verify above once results are complete.
              </p>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Student</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell className="text-right">Report</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {publications.results.map((pub) => (
                      <TableRow key={pub.id}>
                        <TableCell>
                          {pub.student_name}
                          <span className="ml-1 text-[var(--color-text-muted)]">({pub.student_admission_number})</span>
                        </TableCell>
                        <TableCell>
                          <Badge tone={PUBLICATION_STATUS_TONE[pub.status]}>
                            {PUBLICATION_STATUS_LABEL[pub.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate(`${fromExams ? "/examinations/class-results/report" : "/academics/results"}/${pub.student}/${pub.school_class}/${pub.term}`)}
                          >
                            View report
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="size-4" aria-hidden="true" />
            Overall % & Promotion
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!academicYear ? (
            <p className="text-sm text-[var(--color-text-muted)]">Select an academic year to view overall results.</p>
          ) : isLoadingOverall ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : !overallResults || overallResults.rows.length === 0 ? (
            <EmptyState title="No students in this class" />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Student</TableHeaderCell>
                    <TableHeaderCell>Overall %</TableHeaderCell>
                    <TableHeaderCell>Threshold</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {overallResults.rows.map((row) => (
                    <TableRow key={row.student}>
                      <TableCell>
                        {row.student_name}
                        <span className="ml-1 text-[var(--color-text-muted)]">({row.student_admission_number})</span>
                      </TableCell>
                      <TableCell>{row.overall_percent ?? "Incomplete"}</TableCell>
                      <TableCell>{row.threshold_percent}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {canPromote && academicYear && (
            <div className="flex flex-wrap items-end gap-3 border-t border-[var(--color-border)] pt-4">
              <div className="w-48">
                <Select label="Target academic year (for promoted/repeated students)" value={targetYear} onChange={(e) => setTargetYear(e.target.value)}>
                  <option value="">Select a year</option>
                  {academicYears?.map((y) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </Select>
              </div>
              <Button onClick={handleBulkPromote} disabled={!targetYear} isLoading={bulkPromote.isPending}>
                <ClipboardCheck className="size-4" aria-hidden="true" />
                Run promotion for this class
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {academicYear && (
        <Card>
          <CardHeader>
            <CardTitle>Promotion history</CardTitle>
          </CardHeader>
          <CardContent>
            {!promotionRecords || promotionRecords.results.length === 0 ? (
              <EmptyState title="No promotion decisions yet" description="Run promotion above once results are complete." />
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Student</TableHeaderCell>
                      <TableHeaderCell>Overall %</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell>New class / year</TableHeaderCell>
                      <TableHeaderCell>Date</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {promotionRecords.results.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          {record.student_name}
                          <span className="ml-1 text-[var(--color-text-muted)]">({record.student_admission_number})</span>
                        </TableCell>
                        <TableCell>{record.overall_percent ?? "—"}</TableCell>
                        <TableCell>
                          <Badge tone={PROMOTION_STATUS_TONE[record.status]}>
                            {PROMOTION_STATUS_LABEL[record.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {record.new_class_name ?? "—"} {record.new_academic_year_name ? `/ ${record.new_academic_year_name}` : ""}
                        </TableCell>
                        <TableCell>{new Date(record.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {canPromote && pendingRecords.length > 0 && (
              <div className="mt-4 flex flex-col gap-3">
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Resolve pending public examination results:
                </p>
                {pendingRecords.map((record) => (
                  <div key={record.id} className="flex flex-col gap-1">
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {record.student_name} ({record.student_admission_number})
                    </p>
                    <ResolvePendingForm record={record} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
