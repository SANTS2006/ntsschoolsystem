import { DoorOpen, Eye, EyeOff, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import type { TimetablePaper } from "./types";
import {
  useAssignExamRoom,
  useExamList,
  useExamTimetable,
  useRemoveExamRoom,
  useSetExamTimetablePublished,
  useTimetableOptions,
} from "./useExaminationsCrud";

const hhmm = (value: string | null) => (value ? value.slice(0, 5) : "—");
const day = (value: string | null) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "No date";

function AssignRoomModal({ paper, onClose }: { paper: TimetablePaper; onClose: () => void }) {
  const { showToast } = useToast();
  const { data: options } = useTimetableOptions();
  const assign = useAssignExamRoom(paper.id);
  const [room, setRoom] = useState("");
  const [invigilators, setInvigilators] = useState<string[]>([]);
  const [autoSeat, setAutoSeat] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setInvigilators((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    assign.mutate(
      { room, invigilators, auto_seat: autoSeat },
      {
        onSuccess: () => {
          showToast({ title: "Room assigned" });
          onClose();
        },
        onError: (err: ApiError) => setError(err.message),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title={`${paper.school_class_name} · ${paper.subject_name}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <p className="text-sm text-[var(--color-text-muted)]">
          {day(paper.date)}, {hhmm(paper.start_time)}–{hhmm(paper.end_time)} · {paper.seated} of {paper.students} students seated
        </p>
        <Select label="Room" value={room} onChange={(e) => setRoom(e.target.value)}>
          <option value="">Choose a room</option>
          {options?.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} (seats {r.capacity})
            </option>
          ))}
        </Select>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-[var(--color-text)]">Invigilators</legend>
          <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 sm:grid-cols-2">
            {options?.invigilators.map((s) => (
              <Checkbox key={s.id} label={s.name} checked={invigilators.includes(s.id)} onChange={() => toggle(s.id)} />
            ))}
            {options && options.invigilators.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No teachers to choose from.</p>}
          </div>
        </fieldset>
        <Checkbox
          label="Seat this class's students in the room"
          hint="Fills the room up to its capacity with students who don't have a seat for this paper yet."
          checked={autoSeat}
          onChange={(e) => setAutoSeat(e.target.checked)}
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!room || invigilators.length === 0} isLoading={assign.isPending}>
            Assign
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RemoveRoomButton({ paperId, assignmentId, room }: { paperId: string; assignmentId: string; room: string }) {
  const remove = useRemoveExamRoom(paperId);
  const canDelete = useHasPermission("exam_timetable.delete");
  if (!canDelete) return null;
  return (
    <button
      type="button"
      aria-label={`Remove ${room}`}
      title="Remove this room (its seating is cleared)"
      onClick={() => remove.mutate(assignmentId)}
      className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
    >
      <Trash2 className="size-3.5" aria-hidden="true" />
    </button>
  );
}

/** The Exams Director's timetable for an exam: when each paper is sat, in which rooms, who invigilates and where each
 * student sits. Nothing is visible to students or teachers until it is published. */
export function ExamTimetablePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [search, setSearch] = useSearchParams();
  const canUpdate = useHasPermission("exam_timetable.update");
  const canCreate = useHasPermission("exam_timetable.create");
  const canPublish = useHasPermission("exam_timetable.publish");
  const { data: exams } = useExamList({ page_size: 100, ordering: "-start_date" });
  const examId = search.get("exam") ?? exams?.results[0]?.id ?? "";
  const { data, isLoading, isError, error } = useExamTimetable(examId || undefined);
  const publish = useSetExamTimetablePublished(examId);
  const [assigning, setAssigning] = useState<TimetablePaper | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const setPublished = (value: boolean) => {
    setProblems([]);
    publish.mutate(value, {
      onSuccess: () => showToast({ title: value ? "Exam timetable published" : "Exam timetable withdrawn" }),
      onError: (err: ApiError) => {
        if (err.code === "TIMETABLE_INCOMPLETE") setProblems(err.errors.map((e) => e.message));
        else showToast({ title: "Could not update", description: err.message, tone: "danger" });
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Exam timetable</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Set each paper&apos;s date and time, put it in rooms with invigilators, and seat the students. Publish it when it is complete.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <Select label="Exam" value={examId} onChange={(e) => setSearch(e.target.value ? { exam: e.target.value } : {})}>
            {exams?.results.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name} · {exam.term_name}
              </option>
            ))}
          </Select>
        </div>
        {data && (
          <Badge tone={data.exam.published ? "success" : "neutral"}>{data.exam.published ? "Published" : "Draft — not visible to students"}</Badge>
        )}
        {canCreate && examId && (
          <Button variant="secondary" onClick={() => navigate(`/examinations/exams/${examId}/schedules/new`)}>
            <Plus className="size-4" aria-hidden="true" /> Add paper
          </Button>
        )}
        {canPublish && data &&
          (data.exam.published ? (
            <Button variant="secondary" onClick={() => setPublished(false)} isLoading={publish.isPending}>
              <EyeOff className="size-4" aria-hidden="true" /> Withdraw
            </Button>
          ) : (
            <Button onClick={() => setPublished(true)} isLoading={publish.isPending}>
              <Eye className="size-4" aria-hidden="true" /> Publish timetable
            </Button>
          ))}
      </div>

      {problems.length > 0 && (
        <Alert tone="warning">
          <p className="font-medium">The timetable isn&apos;t ready to publish:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      {!examId ? (
        <EmptyState icon={DoorOpen} title="No exams yet" description="Create an exam first, then build its timetable here." />
      ) : isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <Alert tone="danger">{(error as ApiError | null)?.message ?? "Could not load the timetable."}</Alert>
      ) : data.schedules.length === 0 ? (
        <EmptyState icon={DoorOpen} title="No papers yet" description="Add the papers (class and subject) this exam covers." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{data.exam.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Date &amp; time</TableHeaderCell>
                    <TableHeaderCell>Class</TableHeaderCell>
                    <TableHeaderCell>Subject</TableHeaderCell>
                    <TableHeaderCell>Rooms &amp; invigilators</TableHeaderCell>
                    <TableHeaderCell>Seated</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {data.schedules.map((paper) => (
                    <TableRow key={paper.id}>
                      <TableCell className="whitespace-nowrap">
                        {day(paper.date)}
                        <span className="block text-xs text-[var(--color-text-muted)]">
                          {hhmm(paper.start_time)}–{hhmm(paper.end_time)}
                        </span>
                      </TableCell>
                      <TableCell>{paper.school_class_name}</TableCell>
                      <TableCell className="font-medium">{paper.subject_name}</TableCell>
                      <TableCell className="whitespace-normal">
                        {paper.rooms.length === 0 ? (
                          <span className="text-[var(--color-text-muted)]">No room yet</span>
                        ) : (
                          <ul className="flex flex-col gap-1.5">
                            {paper.rooms.map((r) => (
                              <li key={r.id} className="flex items-start gap-1 text-sm">
                                <span>
                                  <strong>{r.room_name}</strong> · {r.seated}/{r.capacity} seats
                                  <span className="block text-xs text-[var(--color-text-muted)]">
                                    <UserCheck className="mr-1 inline size-3" aria-hidden="true" />
                                    {r.invigilators.map((i) => i.name).join(", ") || "No invigilator"}
                                  </span>
                                </span>
                                <RemoveRoomButton paperId={paper.id} assignmentId={r.id} room={r.room_name} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell className={paper.seated < paper.students ? "text-[var(--color-warning)]" : ""}>
                        {paper.seated}/{paper.students}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canUpdate && (
                            <Button variant="secondary" size="sm" onClick={() => setAssigning(paper)}>
                              <DoorOpen className="size-4" aria-hidden="true" /> Add room
                            </Button>
                          )}
                          {canUpdate && (
                            <button
                              type="button"
                              aria-label="Edit date and time"
                              title="Edit date and time"
                              onClick={() => navigate(`/examinations/exams/${examId}/schedules/${paper.id}/edit`)}
                              className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {assigning && <AssignRoomModal key={assigning.id} paper={assigning} onClose={() => setAssigning(null)} />}
    </div>
  );
}
