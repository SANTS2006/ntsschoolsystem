import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useAllSections } from "@/features/academics/useAcademicsLookups";
import { useSubjectOfferingList } from "@/features/academics/useAcademicsCrud";
import { useStaffLookup } from "@/features/staff/useStaffLookups";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import type { DayOfWeek, TimetableEntryDraft } from "./types";
import { useBulkCreateEntries, useCopySection, useEntryList, usePeriodList, useRoomList } from "./useTimetableCrud";

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
];

interface DraftRow extends TimetableEntryDraft {
  key: string;
  error?: string;
}

const EMPTY_ROW = { day_of_week: "monday" as DayOfWeek, period: "", subject: "", teacher: "", room: "" };

// Parses the bulk-create endpoint's `entries[<index>].<field>` field tags back onto the draft
// row that caused them — see TimetableEntryViewSet.bulk_create's flat_errors construction.
function parseBulkErrors(err: ApiError): Map<number, string> {
  const byIndex = new Map<number, string>();
  for (const { field, message } of err.errors) {
    const match = field?.match(/^entries\[(\d+)\]\./);
    if (match) byIndex.set(Number(match[1]), message);
  }
  return byIndex;
}

export function BuildTimetablePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  const [sectionId, setSectionId] = useState(searchParams.get("section") ?? "");
  const [draft, setDraft] = useState<DraftRow[]>([]);
  const [row, setRow] = useState(EMPTY_ROW);
  const [copyFromSection, setCopyFromSection] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);

  const { data: sections } = useAllSections();
  const section = sections?.find((s) => s.id === sectionId);

  const { data: periods, isLoading: isLoadingPeriods } = usePeriodList({ page_size: 100, ordering: "order" });
  const { data: existingEntries, isLoading: isLoadingEntries } = useEntryList({ section: sectionId, page_size: 100 });
  const { data: offerings } = useSubjectOfferingList({
    page_size: 100,
    school_class: section?.school_class,
    academic_year: section?.academic_year,
    status: "active",
  });
  const { data: staff } = useStaffLookup("teacher");
  const { data: rooms } = useRoomList({ page_size: 100 });

  const bulkCreate = useBulkCreateEntries();
  const copySectionMutation = useCopySection();

  const offeringBySubject = useMemo(() => {
    const map = new Map<string, { teacher: string; teacher_name: string }>();
    for (const offering of offerings?.results ?? []) {
      map.set(offering.subject, { teacher: offering.main_teacher, teacher_name: offering.main_teacher_name });
    }
    return map;
  }, [offerings]);

  // Every day/period slot already spoken for — by a saved entry or by a row already queued in
  // this draft — so the add-row form can refuse a duplicate before it ever reaches the server.
  const takenSlots = useMemo(() => {
    const slots = new Set<string>();
    for (const entry of existingEntries?.results ?? []) slots.add(`${entry.day_of_week}|${entry.period}`);
    for (const draftRow of draft) slots.add(`${draftRow.day_of_week}|${draftRow.period}`);
    return slots;
  }, [existingEntries, draft]);

  const slotKey = (day: DayOfWeek, period: string) => `${day}|${period}`;
  const isSlotTaken = row.period ? takenSlots.has(slotKey(row.day_of_week, row.period)) : false;

  const addRow = () => {
    if (!row.period || isSlotTaken) return;
    setDraft((prev) => [...prev, { ...row, key: crypto.randomUUID() }]);
    setRow((prev) => ({ ...EMPTY_ROW, day_of_week: prev.day_of_week }));
  };

  const removeRow = (key: string) => setDraft((prev) => prev.filter((r) => r.key !== key));

  const periodName = (id: string) => periods?.results.find((p) => p.id === id)?.name ?? id;
  const subjectName = (id?: string) => offerings?.results.find((o) => o.subject === id)?.subject_name;
  const teacherName = (id?: string) => staff?.find((s) => s.id === id)?.full_name;
  const roomName = (id?: string) => rooms?.results.find((r) => r.id === id)?.name;
  const dayLabel = (value: DayOfWeek) => DAYS.find((d) => d.value === value)?.label ?? value;

  const handleSave = () => {
    if (!sectionId || draft.length === 0) return;
    const entries = draft.map(({ key: _key, error: _error, ...entry }) => entry);
    bulkCreate.mutate(
      { section: sectionId, entries },
      {
        onSuccess: (created) => {
          showToast({ title: `${created.length} lesson${created.length === 1 ? "" : "s"} scheduled` });
          setDraft([]);
        },
        onError: (err) => {
          const byIndex = parseBulkErrors(err);
          if (byIndex.size > 0) {
            setDraft((prev) => prev.map((r, index) => ({ ...r, error: byIndex.get(index) })));
          }
          showToast({ title: "Could not save this timetable", description: generalErrorMessage(err), tone: "danger" });
        },
      },
    );
  };

  const handleCopy = () => {
    if (!copyFromSection || !sectionId) return;
    copySectionMutation.mutate(
      { from_section: copyFromSection, to_section: sectionId, replace: replaceExisting },
      {
        onSuccess: (result) => {
          showToast({
            title: `${result.created.length} lesson${result.created.length === 1 ? "" : "s"} copied`,
            description:
              result.skipped.length > 0
                ? `${result.skipped.length} skipped — the target section already had a lesson in that slot.`
                : undefined,
          });
          setCopyFromSection("");
        },
        onError: (err) => showToast({ title: "Could not copy timetable", description: generalErrorMessage(err), tone: "danger" }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Build timetable</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Queue up a section's lessons and save them all at once, instead of one form per slot.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/timetable/schedule")}>
          View schedule
        </Button>
      </div>

      <div className="w-full max-w-sm">
        <Select label="Section" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setDraft([]); }}>
          <option value="">Choose a section to build</option>
          {sections?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.school_class_name} - {s.name} ({s.academic_year_name})
            </option>
          ))}
        </Select>
      </div>

      {!sectionId ? (
        <EmptyState title="Pick a section" description="Choose a section above to start queuing its lessons." />
      ) : isLoadingPeriods || isLoadingEntries ? (
        <FullPageSpinner />
      ) : !periods || periods.results.length === 0 ? (
        <Alert tone="warning">No periods have been set up yet — add them under the Periods tab first.</Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Copy from another section</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-[var(--color-text-muted)]">
                Already built another section's timetable? Copy its day/period/subject grid here — a parallel
                section happens at the same time, so teacher and room are left for you to assign per section
                below rather than copied. A slot the target section already has filled is skipped unless you
                choose to replace it.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-full max-w-xs">
                  <Select label="Copy from" value={copyFromSection} onChange={(e) => setCopyFromSection(e.target.value)}>
                    <option value="">Choose a section</option>
                    {sections?.filter((s) => s.id !== sectionId).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.school_class_name} - {s.name} ({s.academic_year_name})
                      </option>
                    ))}
                  </Select>
                </div>
                <Checkbox
                  label="Replace this section's existing lessons"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                />
                <Button
                  variant="secondary"
                  onClick={handleCopy}
                  disabled={!copyFromSection}
                  isLoading={copySectionMutation.isPending}
                >
                  {!copySectionMutation.isPending && <Copy className="size-4" aria-hidden="true" />}
                  Copy
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add a lesson</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {offerings && offerings.results.length === 0 && (
                <Alert tone="warning">
                  No subject offerings found for this class/year yet — add them under Academics → Subject Offerings
                  to auto-fill a teacher per subject, or leave Subject unset for a study hall / free period.
                </Alert>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Select
                  label="Day"
                  value={row.day_of_week}
                  onChange={(e) => setRow((prev) => ({ ...prev, day_of_week: e.target.value as DayOfWeek }))}
                >
                  {DAYS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Period"
                  value={row.period}
                  onChange={(e) => setRow((prev) => ({ ...prev, period: e.target.value }))}
                >
                  <option value="">Select a period</option>
                  {periods.results.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Subject"
                  value={row.subject}
                  onChange={(e) => {
                    const subject = e.target.value;
                    const defaultTeacher = offeringBySubject.get(subject);
                    setRow((prev) => ({ ...prev, subject, teacher: defaultTeacher?.teacher ?? prev.teacher }));
                  }}
                >
                  <option value="">Not set</option>
                  {offerings?.results.map((offering) => (
                    <option key={offering.subject} value={offering.subject}>
                      {offering.subject_name}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Teacher"
                  value={row.teacher}
                  onChange={(e) => setRow((prev) => ({ ...prev, teacher: e.target.value }))}
                >
                  <option value="">Not set</option>
                  {staff?.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Room"
                  value={row.room}
                  onChange={(e) => setRow((prev) => ({ ...prev, room: e.target.value }))}
                >
                  <option value="">Not set</option>
                  {rooms?.results.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </div>
              {isSlotTaken && (
                <p className="text-sm text-[var(--color-danger)]">
                  This section already has a lesson queued or scheduled for this day and period.
                </p>
              )}
              <div className="flex justify-end">
                <Button type="button" onClick={addRow} disabled={!row.period || isSlotTaken}>
                  <Plus className="size-4" aria-hidden="true" />
                  Add to draft
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Draft ({draft.length})</CardTitle>
              <Button onClick={handleSave} disabled={draft.length === 0} isLoading={bulkCreate.isPending}>
                {!bulkCreate.isPending && <Save className="size-4" aria-hidden="true" />}
                Save timetable
              </Button>
            </CardHeader>
            <CardContent>
              {draft.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  Nothing queued yet — add lessons above, then save them all together.
                </p>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Day</TableHeaderCell>
                        <TableHeaderCell>Period</TableHeaderCell>
                        <TableHeaderCell>Subject</TableHeaderCell>
                        <TableHeaderCell>Teacher</TableHeaderCell>
                        <TableHeaderCell>Room</TableHeaderCell>
                        <TableHeaderCell className="text-right">Remove</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {draft.map((draftRow) => (
                        <tr key={draftRow.key} className="border-b border-[var(--color-border)] last:border-0">
                          <TableCell>{dayLabel(draftRow.day_of_week)}</TableCell>
                          <TableCell>{periodName(draftRow.period)}</TableCell>
                          <TableCell>
                            {subjectName(draftRow.subject) ?? <span className="text-[var(--color-text-muted)]">—</span>}
                          </TableCell>
                          <TableCell>
                            {teacherName(draftRow.teacher) ?? <span className="text-[var(--color-text-muted)]">—</span>}
                          </TableCell>
                          <TableCell>
                            {roomName(draftRow.room) ?? <span className="text-[var(--color-text-muted)]">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              type="button"
                              onClick={() => removeRow(draftRow.key)}
                              aria-label="Remove from draft"
                              className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </button>
                          </TableCell>
                          {draftRow.error && (
                            <td colSpan={6} className="px-3 pb-2 text-xs text-[var(--color-danger)]">
                              {draftRow.error}
                            </td>
                          )}
                        </tr>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              {bulkCreate.isPending && (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
