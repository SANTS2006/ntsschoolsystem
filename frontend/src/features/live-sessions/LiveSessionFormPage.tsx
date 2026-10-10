import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/toastContext";
import { useAllSections, useSchoolClasses, useSubjects } from "@/features/academics/useAcademicsLookups";
import { listStudents } from "@/features/students/api";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreateLiveSession, useCreateLiveSessionRecipient, useLiveSessionOptions } from "./useLiveSessionsCrud";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  subject: z.string().min(1, "Subject is required"),
  scheduled_start: z.string().min(1, "Start time is required"),
  target_type: z.enum(["class_section", "specific_students"]),
});

type FormValues = z.infer<typeof schema>;

const FIELD_KEYS = new Set(["title", "subject", "school_class", "section", "scheduled_start", "target_type"]);

export function LiveSessionFormPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: allSubjects } = useSubjects();
  const { data: allClasses } = useSchoolClasses();
  const { data: allSections } = useAllSections();
  const { data: options } = useLiveSessionOptions();
  const createSession = useCreateLiveSession();
  const createRecipient = useCreateLiveSessionRecipient();
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [invitingIndex, setInvitingIndex] = useState<number | null>(null);

  // Several classes and/or several sections can be picked at once — one session per selected
  // section (that section only), or, for a selected class with no section of its own picked,
  // one whole-class session. Mirrors the single class/section a LiveSession actually has; this
  // is just several of them created together rather than a combinatorial class-by-section grid.
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [targetsTouched, setTargetsTouched] = useState(false);
  const toggleClass = (id: string) => {
    setTargetsTouched(true);
    setSelectedClassIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };
  const toggleSection = (id: string) => {
    setTargetsTouched(true);
    setSelectedSectionIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      subject: "",
      scheduled_start: "",
      target_type: "class_section",
    },
  });

  const targetType = useWatch({ control, name: "target_type" });
  const subjectId = useWatch({ control, name: "subject" });

  // A teacher can only schedule for the subjects they are assigned to, and for the classes they teach that subject in.
  // Everyone else (who may schedule sessions) sees everything.
  const restricted = options?.restricted ?? false;
  const subjects = restricted
    ? allSubjects?.filter((subject) => options?.pairs.some((p) => p.subject === subject.id))
    : allSubjects;
  const allowedClassIds = restricted
    ? new Set(options?.pairs.filter((p) => !subjectId || p.subject === subjectId).map((p) => p.school_class))
    : null;
  const classes = allowedClassIds ? allClasses?.filter((c) => allowedClassIds.has(c.id)) : allClasses;
  const sections = allowedClassIds ? allSections?.filter((s) => allowedClassIds.has(s.school_class)) : allSections;
  // The roster picker (specific-students mode) only makes sense for one class at a time —
  // it's the first one selected.
  const rosterClassId = selectedClassIds[0];

  const { data: roster } = useQuery({
    queryKey: ["students", "roster-for-live-session", rosterClassId],
    queryFn: () => listStudents({ current_class: rosterClassId, status: "active", page_size: 100, ordering: "last_name" }),
    enabled: !!rosterClassId && targetType === "specific_students",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (values: FormValues) => {
    if (allowedClassIds) {
      // (a teacher who changed the subject after ticking classes must not send a class they don't teach it in)
      const stillAllowed = (id: string) => allowedClassIds.has(id);
      if (selectedClassIds.some((id) => !stillAllowed(id))) {
        setGeneralError("Some selected classes are not classes you teach this subject in. Untick them and try again.");
        return;
      }
    }
    if (selectedClassIds.length === 0 && selectedSectionIds.length === 0) {
      setTargetsTouched(true);
      return;
    }
    setGeneralError(null);

    // One session per selected section (that section only); a selected class with none of its
    // own sections picked gets one whole-class session instead.
    const chosenSections = allSections?.filter((s) => selectedSectionIds.includes(s.id)) ?? [];
    const classesCoveredBySection = new Set(chosenSections.map((s) => s.school_class));
    const targets: { school_class: string; section?: string }[] =
      values.target_type === "specific_students"
        ? [{ school_class: selectedClassIds[0] }]
        : [
            ...chosenSections.map((s) => ({ school_class: s.school_class, section: s.id })),
            ...selectedClassIds.filter((id) => !classesCoveredBySection.has(id)).map((id) => ({ school_class: id })),
          ];

    setIsSubmitting(true);
    try {
      const savedSessions = await Promise.all(
        targets.map((target) =>
          createSession.mutateAsync({
            title: values.title,
            subject: values.subject,
            school_class: target.school_class,
            section: target.section,
            scheduled_start: values.scheduled_start,
            target_type: values.target_type,
          }),
        ),
      );

      if (values.target_type === "specific_students" && selectedStudentIds.size > 0) {
        const studentIds = [...selectedStudentIds];
        let inviteFailures = 0;
        for (let i = 0; i < studentIds.length; i++) {
          setInvitingIndex(i);
          try {
            await createRecipient.mutateAsync({ session: savedSessions[0].id, student: studentIds[i] });
          } catch {
            inviteFailures += 1;
          }
        }
        setInvitingIndex(null);
        if (inviteFailures > 0) {
          showToast({
            title: "Live session scheduled",
            description: `${inviteFailures} of ${studentIds.length} invite(s) failed — you can retry from the session page.`,
            tone: "danger",
          });
          navigate("/live-sessions");
          return;
        }
      }
      showToast({
        title: targets.length > 1 ? `${targets.length} live sessions scheduled` : "Live session scheduled",
      });
      navigate("/live-sessions");
    } catch (err) {
      if (!applyFieldErrors(err as ApiError, setError, FIELD_KEYS)) {
        const message = generalErrorMessage(err as ApiError);
        setGeneralError(message);
        showToast({ title: "Could not schedule session", description: message, tone: "danger" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Schedule a live session</h1>

      <Card>
        <CardHeader>
          <CardTitle>Session details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Title" error={errors.title?.message} {...register("title")} />
            <Select label="Subject" error={errors.subject?.message} {...register("subject")}>
              <option value="">Select a subject</option>
              {subjects?.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-[var(--color-text)]">Classes</span>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {targetType === "specific_students"
                    ? "Pick one class to choose recipients from."
                    : "Select every class to broadcast to — pick sections below for a narrower audience."}
                </p>
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] p-2">
                  {classes?.map((schoolClass) => (
                    <Checkbox
                      key={schoolClass.id}
                      label={schoolClass.name}
                      checked={selectedClassIds.includes(schoolClass.id)}
                      onChange={() => {
                        if (targetType === "specific_students") {
                          setTargetsTouched(true);
                          setSelectedClassIds(
                            selectedClassIds.includes(schoolClass.id) ? [] : [schoolClass.id],
                          );
                        } else {
                          toggleClass(schoolClass.id);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
              {targetType !== "specific_students" && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">Sections</span>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Optional. Picking a class's section reaches just that section instead of the whole class.
                  </p>
                  <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] p-2">
                    {sections?.map((section) => (
                      <Checkbox
                        key={section.id}
                        label={`${section.school_class_name} — ${section.name}`}
                        checked={selectedSectionIds.includes(section.id)}
                        onChange={() => toggleSection(section.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            {targetsTouched && selectedClassIds.length === 0 && selectedSectionIds.length === 0 && (
              <p className="text-sm text-[var(--color-danger)]">Select at least one class or section.</p>
            )}
            <Input
              type="datetime-local"
              label="Scheduled start"
              error={errors.scheduled_start?.message}
              {...register("scheduled_start")}
            />

            <Select
              label="Audience"
              hint="Class / Section reaches everyone in the class (or section, if set) above. Specific Students reaches only the students you pick below, regardless of class/section."
              error={errors.target_type?.message}
              {...register("target_type")}
            >
              <option value="class_section">Class / Section</option>
              <option value="specific_students">Specific Students</option>
            </Select>

            {targetType === "specific_students" && (
              <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <p className="text-sm font-medium text-[var(--color-text)]">Recipients</p>
                {!rosterClassId ? (
                  <p className="text-sm text-[var(--color-text-muted)]">Select a class above to choose students.</p>
                ) : !roster || roster.results.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">No active students in this class.</p>
                ) : (
                  <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                    {roster.results.map((student) => (
                      <li key={student.id}>
                        <label className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)]">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.has(student.id)}
                            onChange={() => toggleStudent(student.id)}
                          />
                          {student.full_name}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-[var(--color-text-muted)]">
                  {selectedStudentIds.size} student{selectedStudentIds.size === 1 ? "" : "s"} selected — each
                  gets an invite (in-app + email) as soon as the session is scheduled.
                </p>
              </div>
            )}

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/live-sessions")}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting}>
                {!isSubmitting && invitingIndex === null && <Save className="size-4" aria-hidden="true" />}
                {invitingIndex !== null ? `Inviting student ${invitingIndex + 1} of ${selectedStudentIds.size}…` : "Schedule"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
