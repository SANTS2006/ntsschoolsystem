import { ArrowRight, CheckCircle2, Play, Repeat, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";

import { useSchoolClasses } from "./useAcademicsLookups";
import { useActivateYear, useExecuteRollover, usePreviewRollover, useRolloverRuns, useYearContext } from "./useYearContext";
import type { Decisions, Outcome, RolloverOptions, RolloverPreview, RolloverSummary } from "./yearApi";

const OUTCOME_LABEL: Record<Outcome | "review", string> = {
  promote: "Promote",
  repeat: "Repeat the class",
  graduate: "Graduate",
  withdraw: "Withdraw",
  transfer: "Transfer out",
  review: "Needs a decision",
};

/** Year rollover: choose the closing and opening years, review what will happen to every student, run it, then activate
 * the new year. Nothing changes until "Run the rollover"; activation is a separate, confirmed step. */
export function YearRolloverPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: context, isLoading } = useYearContext();
  const { data: classes } = useSchoolClasses();
  const preview = usePreviewRollover();
  const execute = useExecuteRollover();
  const activate = useActivateYear();
  const { data: runs } = useRolloverRuns();

  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [decisions, setDecisions] = useState<Decisions>({});
  const [options, setOptions] = useState<RolloverOptions>({ terms: true, sections: true, subject_offerings: true, fee_structures: true });
  const [result, setResult] = useState<RolloverSummary | null>(null);

  const years = context?.years ?? [];
  const source = sourceId || context?.active?.id || "";
  const upcoming = years.filter((y) => y.status === "upcoming");

  const data: RolloverPreview | undefined = preview.data;
  const rows = useMemo(() => data?.students ?? [], [data]);

  // What will actually be sent: the school's proposal, unless the person changed it.
  const effective = useMemo(() => {
    const out: Decisions = {};
    for (const row of rows) {
      const chosen = decisions[row.student_id];
      if (chosen) out[row.student_id] = chosen;
      else if (row.proposed !== "review") out[row.student_id] = { outcome: row.proposed };
    }
    return out;
  }, [rows, decisions]);
  const unresolved = rows.filter((row) => !effective[row.student_id]);
  const canRun = !!data && !result && unresolved.length === 0 && (rows.length > 0 || (data.counts.already_enrolled ?? 0) > 0);

  if (isLoading) return <FullPageSpinner />;

  const loadPreview = () => {
    setResult(null);
    setDecisions({});
    preview.mutate(
      { source, target: targetId },
      { onError: (err: ApiError) => showToast({ title: "Could not prepare the preview", description: err.message, tone: "danger" }) },
    );
  };

  const setDecision = (studentId: string, outcome: Outcome | "", classId?: string) => {
    setDecisions((prev) => {
      const next = { ...prev };
      if (!outcome) delete next[studentId];
      else next[studentId] = { outcome, ...(classId ? { class: classId } : {}) };
      return next;
    });
  };

  const run = async () => {
    const ok = await confirm({
      title: `Run the rollover into ${data?.target.name}?`,
      description: `${Object.keys(effective).length} student(s) are moved on according to the table. Last year's attendance, marks, invoices and payments are not touched. This cannot be run twice.`,
    });
    if (!ok || !data) return;
    execute.mutate(
      { source, target: targetId, decisions: effective, options },
      {
        onSuccess: (run) => {
          setResult(run.summary);
          showToast({ title: "Rollover completed" });
        },
        onError: (err: ApiError) => showToast({ title: "The rollover did not run", description: err.message, tone: "danger" }),
      },
    );
  };

  const activateTarget = async () => {
    if (!data) return;
    const ok = await confirm({
      title: `Make ${data.target.name} the active year?`,
      description: `${data.source.name} is closed (read-only) and everyone starts working in ${data.target.name}.`,
    });
    if (!ok) return;
    activate.mutate(targetId, {
      onSuccess: () => {
        showToast({ title: `${data.target.name} is now the active academic year` });
        navigate("/academics/years");
      },
      onError: (err: ApiError) => showToast({ title: "Could not activate", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Academic year rollover</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Carry students, classes and settings into the next year without losing anything from this one.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Choose the years</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!context?.active && <Alert tone="warning">No academic year is active yet. Activate one first from the academic years list.</Alert>}
          {upcoming.length === 0 && (
            <Alert tone="info">Create the upcoming academic year first (with its terms), then come back here.</Alert>
          )}
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Closing year</span>
              <select
                value={source}
                onChange={(e) => setSourceId(e.target.value)}
                className="h-10 min-w-48 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name} ({y.status})
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight className="mb-2.5 size-4 text-[var(--color-text-muted)]" aria-hidden="true" />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Opening year</span>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="h-10 min-w-48 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              >
                <option value="">Choose…</option>
                {upcoming.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={loadPreview} disabled={!source || !targetId} isLoading={preview.isPending}>
              <Repeat className="size-4" aria-hidden="true" />
              Preview
            </Button>
          </div>
        </CardContent>
      </Card>

      {data && (
        <>
          {data.run?.status === "completed" && !result && (
            <Alert tone="success">This rollover has already been run. You can activate {data.target.name} below.</Alert>
          )}
          {data.run?.status === "failed" && <Alert tone="danger">The last attempt did not complete: {data.run.error}</Alert>}
          {data.warnings.map((w) => (
            <Alert key={w} tone="warning">
              {w}
            </Alert>
          ))}

          <Card>
            <CardHeader>
              <CardTitle>2. Review what will happen</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.counts).map(([key, n]) => (
                  <Badge key={key} tone={key === "review" ? "warning" : "neutral"}>
                    {n} {key === "already_enrolled" ? "already enrolled" : (OUTCOME_LABEL[key as Outcome | "review"] ?? key).toLowerCase()}
                  </Badge>
                ))}
              </div>
              <ul className="grid gap-1 text-sm text-[var(--color-text-muted)] sm:grid-cols-2">
                <li>Sections: {data.configuration.sections.in_source} in {data.source.name}, {data.configuration.sections.in_target} already in {data.target.name}</li>
                <li>Subject offerings: {data.configuration.subject_offerings.in_source} to copy</li>
                <li>Fee plans: {data.configuration.fee_structures.in_source} to copy (invoices and payments are never copied)</li>
                <li>
                  Outstanding balances stay on their original invoices: {data.outstanding_balances.total} across {data.outstanding_balances.students} student(s)
                </li>
                <li className="sm:col-span-2">{data.configuration.timetables}</li>
              </ul>
              {unresolved.length > 0 && (
                <Alert tone="warning">
                  <TriangleAlert className="mr-1 inline size-4" aria-hidden="true" />
                  {unresolved.length} student(s) need a decision before the rollover can run. Choose an outcome for each.
                </Alert>
              )}
              {rows.length > 0 && (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Student</TableHeaderCell>
                        <TableHeaderCell>Class now</TableHeaderCell>
                        <TableHeaderCell>Suggested</TableHeaderCell>
                        <TableHeaderCell>Outcome</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => {
                        const chosen = effective[row.student_id];
                        return (
                          <TableRow key={row.student_id}>
                            <TableCell>
                              <div className="font-medium">{row.name}</div>
                              <div className="text-xs text-[var(--color-text-muted)]">{row.admission_number}</div>
                            </TableCell>
                            <TableCell>
                              {row.class_name}
                              {row.section_name ? ` · ${row.section_name}` : ""}
                            </TableCell>
                            <TableCell>
                              <Badge tone={row.proposed === "review" ? "warning" : "neutral"}>{OUTCOME_LABEL[row.proposed]}</Badge>
                              <div className="mt-1 text-xs text-[var(--color-text-muted)]">{row.reason}</div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  aria-label={`Outcome for ${row.name}`}
                                  value={chosen?.outcome ?? ""}
                                  disabled={!!result}
                                  onChange={(e) => setDecision(row.student_id, e.target.value as Outcome | "", chosen?.class)}
                                  className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
                                >
                                  <option value="">{row.proposed === "review" ? "Choose…" : "As suggested"}</option>
                                  {(Object.keys(OUTCOME_LABEL) as (Outcome | "review")[])
                                    .filter((o): o is Outcome => o !== "review")
                                    .map((o) => (
                                      <option key={o} value={o}>
                                        {OUTCOME_LABEL[o]}
                                      </option>
                                    ))}
                                </select>
                                {(chosen?.outcome === "promote" || chosen?.outcome === "repeat") && (
                                  <select
                                    aria-label={`Class for ${row.name}`}
                                    value={chosen.class ?? ""}
                                    disabled={!!result}
                                    onChange={(e) => setDecision(row.student_id, chosen.outcome, e.target.value)}
                                    className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
                                  >
                                    <option value="">Usual class</option>
                                    {(classes ?? []).map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Settings to carry over, then run</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {(
                [
                  ["terms", "Copy terms into the new year if it has none (dates move to the new year)"],
                  ["sections", "Copy sections (classes get the same sections in the new year)"],
                  ["subject_offerings", "Copy subject offerings and teachers (matched to the new year's terms)"],
                  ["fee_structures", "Copy fee plans (new plans for the new year; no invoices or payments)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={options[key]}
                    disabled={!!result}
                    onChange={(e) => setOptions((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="size-4 accent-[var(--color-primary)]"
                  />
                  {label}
                </label>
              ))}
              <div>
                <Button onClick={run} disabled={!canRun} isLoading={execute.isPending}>
                  <Play className="size-4" aria-hidden="true" />
                  Run the rollover
                </Button>
              </div>
            </CardContent>
          </Card>

          {(result || data.run?.status === "completed") && (
            <Card>
              <CardHeader>
                <CardTitle>4. Activate {data.target.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {result && (
                  <Alert tone="success">
                    <CheckCircle2 className="mr-1 inline size-4" aria-hidden="true" />
                    Done: {Object.entries(result.students).map(([k, n]) => `${n} ${k}`).join(", ") || "no students moved"}.
                    {result.students_without_section > 0 && ` ${result.students_without_section} student(s) have no section yet and need one.`}
                  </Alert>
                )}
                <p className="text-sm text-[var(--color-text-muted)]">
                  Activating closes {data.source.name} (it stays viewable, read-only) and makes {data.target.name} the year everyone works in.
                </p>
                <div>
                  <Button onClick={activateTarget} isLoading={activate.isPending}>
                    Make {data.target.name} the active year
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {runs && runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Previous rollovers</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {runs.map((run) => (
                <li key={run.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {run.source} → {run.target}
                  </span>
                  <Badge tone={run.status === "completed" ? "success" : run.status === "failed" ? "danger" : "neutral"}>{run.status}</Badge>
                  {run.started_by && <span className="text-[var(--color-text-muted)]">by {run.started_by}</span>}
                  {run.status === "failed" && run.error && <span className="text-[var(--color-danger)]">{run.error}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
