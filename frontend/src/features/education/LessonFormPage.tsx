import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, Save, Trash2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useAllSections, useSchoolClasses, useSubjects } from "@/features/academics/useAcademicsLookups";
import { useCurrentUser } from "@/features/auth/useAuth";
import { listStudents } from "@/features/students/api";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";
import { useStateFromSource } from "@/hooks/useStateFromSource";

import type { MaterialType } from "./types";
import {
  useCreateLesson,
  useCreateLessonEnrollment,
  useCreateMaterial,
  useDeleteLessonEnrollment,
  useLesson,
  useLessonEnrollmentList,
  useUpdateLesson,
} from "./useEducationCrud";

interface PendingMaterial {
  localId: string;
  materialType: MaterialType;
  title: string;
  file: File;
}

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string(),
  subject: z.string().min(1, "Subject is required"),
  school_class: z.string().min(1, "Class is required"),
  section: z.string(),
  is_active: z.boolean(),
  target_type: z.enum(["class_section", "specific_students"]),
});

type FormValues = z.infer<typeof schema>;

const FIELD_KEYS = new Set(["title", "description", "subject", "school_class", "section", "is_active", "target_type"]);

export function LessonFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const [prefill] = useSearchParams();
  const { data: currentUser } = useCurrentUser();
  const listPath = currentUser?.roles.some((role) => role.slug === "teacher") ? "/subjects" : "/education/lessons";
  const { showToast } = useToast();

  const { data: lesson, isLoading: isLoadingLesson } = useLesson(id);
  const { data: subjects } = useSubjects();
  const { data: classes } = useSchoolClasses();
  const { data: sections } = useAllSections();
  const createLesson = useCreateLesson();
  const updateLesson = useUpdateLesson(id ?? "");
  const createMaterial = useCreateMaterial();
  const mutation = isEditMode ? updateLesson : createLesson;
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Specific-student targeting: `selectedStudentIds` is the form's working set, hydrated from
  // the lesson's existing enrollments in edit mode (see the effect below). On submit it's
  // diffed against `existingEnrollments` (edit mode) or created wholesale (create mode) — see
  // `syncEnrollments` in onSubmit.
  const { data: existingEnrollments } = useLessonEnrollmentList(id);
  const createEnrollment = useCreateLessonEnrollment();
  const deleteEnrollment = useDeleteLessonEnrollment();
  const [selectedStudentIds, setSelectedStudentIds] = useStateFromSource(
    existingEnrollments,
    (loaded) => new Set<string>((loaded ?? []).map((e) => e.student)),
  );
  const [syncingEnrollments, setSyncingEnrollments] = useState(false);

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

  // Materials picked before the lesson exists — uploaded one-by-one right after the lesson
  // itself is created (LessonMaterial always requires an existing lesson id, so this can't be a
  // single atomic request). Only offered in create mode; the edit form's existing Detail-page
  // "Upload material" section already handles adding more materials to a lesson that exists.
  const [pendingMaterials, setPendingMaterials] = useState<PendingMaterial[]>([]);
  const [draftType, setDraftType] = useState<MaterialType>("document");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const addPendingMaterial = () => {
    if (!draftFile || !draftTitle.trim()) return;
    setPendingMaterials((prev) => [
      ...prev,
      { localId: crypto.randomUUID(), materialType: draftType, title: draftTitle.trim(), file: draftFile },
    ]);
    setDraftTitle("");
    setDraftFile(null);
  };

  const removePendingMaterial = (localId: string) => {
    setPendingMaterials((prev) => prev.filter((m) => m.localId !== localId));
  };

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      // Pre-filled when opened from a teacher's subject ("Add lesson"); blank otherwise.
      subject: prefill.get("subject") ?? "",
      school_class: prefill.get("school_class") ?? "",
      section: "",
      is_active: true,
      target_type: "class_section",
    },
  });

  const targetType = useWatch({ control, name: "target_type" });
  const rosterClassId = useWatch({ control, name: "school_class" });

  const { data: roster } = useQuery({
    queryKey: ["students", "roster-for-lesson", rosterClassId],
    queryFn: () => listStudents({ current_class: rosterClassId, status: "active", page_size: 100, ordering: "last_name" }),
    enabled: !!rosterClassId && targetType === "specific_students",
  });

  // A native <select> only reflects a value once its options exist, and the subject/class lists load
  // after the form mounts — so apply the "Add lesson" pre-fill once they have arrived.
  useEffect(() => {
    if (isEditMode) return;
    const prefillSubject = prefill.get("subject");
    const prefillClass = prefill.get("school_class");
    if (prefillSubject && subjects) setValue("subject", prefillSubject);
    if (prefillClass && classes) setValue("school_class", prefillClass);
  }, [isEditMode, prefill, subjects, classes, setValue]);

  useEffect(() => {
    if (lesson) {
      reset({
        title: lesson.title,
        description: lesson.description,
        subject: lesson.subject,
        school_class: lesson.school_class,
        section: lesson.section ?? "",
        is_active: lesson.is_active,
        target_type: lesson.target_type,
      });
    }
  }, [lesson, subjects, classes, sections, reset]);

  // Enrollments can only be synced once the lesson id is known (create mode: after the POST
  // resolves) — diffed against `existingEnrollments` in edit mode so unchecking a student
  // actually removes them, not just skips adding a duplicate.
  const syncEnrollments = async (lessonId: string) => {
    if (targetType !== "specific_students") return;
    const previouslyEnrolled = new Map((existingEnrollments ?? []).map((e) => [e.student, e.id]));
    const toAdd = [...selectedStudentIds].filter((sid) => !previouslyEnrolled.has(sid));
    const toRemove = [...previouslyEnrolled.entries()].filter(([sid]) => !selectedStudentIds.has(sid));
    for (const studentId of toAdd) {
      await createEnrollment.mutateAsync({ lesson: lessonId, student: studentId });
    }
    for (const [, enrollmentId] of toRemove) {
      await deleteEnrollment.mutateAsync({ id: enrollmentId, lesson: lessonId });
    }
  };

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        title: values.title,
        description: values.description || undefined,
        subject: values.subject,
        school_class: values.school_class,
        section: values.section || undefined,
        is_active: values.is_active,
        target_type: values.target_type,
      },
      {
        onSuccess: async (saved) => {
          setSyncingEnrollments(true);
          try {
            await syncEnrollments(saved.id);
          } catch {
            showToast({
              title: isEditMode ? "Lesson updated" : "Lesson created",
              description: "Some student enrollments failed to save — you can retry from the lesson page.",
              tone: "danger",
            });
          }
          setSyncingEnrollments(false);

          if (pendingMaterials.length > 0) {
            let uploadFailures = 0;
            for (let i = 0; i < pendingMaterials.length; i++) {
              setUploadingIndex(i);
              const material = pendingMaterials[i];
              try {
                await createMaterial.mutateAsync({
                  values: {
                    lesson: saved.id,
                    material_type: material.materialType,
                    title: material.title,
                    file: material.file,
                  },
                });
              } catch {
                uploadFailures += 1;
              }
            }
            setUploadingIndex(null);
            if (uploadFailures > 0) {
              showToast({
                title: "Lesson created",
                description: `${uploadFailures} of ${pendingMaterials.length} material(s) failed to upload — you can retry from the lesson page.`,
                tone: "danger",
              });
            } else {
              showToast({ title: "Lesson created with materials" });
            }
          } else {
            showToast({ title: isEditMode ? "Lesson updated" : "Lesson created" });
          }
          navigate(`/education/lessons/${saved.id}`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save lesson", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingLesson) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit lesson" : "New lesson"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Lesson details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Title" error={errors.title?.message} {...register("title")} />
            <Input label="Description" error={errors.description?.message} {...register("description")} />
            <Select label="Subject" error={errors.subject?.message} {...register("subject")}>
              <option value="">Select a subject</option>
              {subjects?.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Class" error={errors.school_class?.message} {...register("school_class")}>
                <option value="">Select a class</option>
                {classes?.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}
                  </option>
                ))}
              </Select>
              <Select label="Section" error={errors.section?.message} {...register("section")}>
                <option value="">Not set (whole class)</option>
                {sections?.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.school_class_name} — {section.name}
                  </option>
                ))}
              </Select>
            </div>

            <Checkbox label="Active" {...register("is_active")} />

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
                  {selectedStudentIds.size} student{selectedStudentIds.size === 1 ? "" : "s"} selected
                </p>
              </div>
            )}

            {!isEditMode && (
              <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">Materials (optional)</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Attach documents, videos, or photos now, or add them later from the lesson page.
                  </p>
                </div>

                {pendingMaterials.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {pendingMaterials.map((material, index) => (
                      <li
                        key={material.localId}
                        className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-2.5"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-primary)]">
                          {material.materialType === "video" ? (
                            <Video className="size-4" aria-hidden="true" />
                          ) : (
                            <FileText className="size-4" aria-hidden="true" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--color-text)]">{material.title}</p>
                          <p className="truncate text-xs text-[var(--color-text-muted)]">{material.file.name}</p>
                        </div>
                        {uploadingIndex === index ? (
                          <Spinner size="sm" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => removePendingMaterial(material.localId)}
                            aria-label={`Remove ${material.title}`}
                            className="shrink-0 rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-danger)]"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Select
                    label="Type"
                    value={draftType}
                    onChange={(e) => setDraftType(e.target.value as MaterialType)}
                  >
                    <option value="document">Document / photo</option>
                    <option value="video">Video</option>
                  </Select>
                  <Input label="Title" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    File {draftType === "video" && <span className="text-[var(--color-text-muted)]">(up to 200MB)</span>}
                  </span>
                  <input
                    type="file"
                    onChange={(e) => setDraftFile(e.target.files?.[0] ?? null)}
                    className="text-sm text-[var(--color-text-muted)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--color-bg-subtle)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--color-text)]"
                  />
                </div>
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={addPendingMaterial}
                    disabled={!draftFile || !draftTitle.trim()}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Add material
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-2 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(isEditMode ? `/education/lessons/${id}` : listPath)}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={mutation.isPending || syncingEnrollments || uploadingIndex !== null}>
                {!mutation.isPending && !syncingEnrollments && uploadingIndex === null && (
                  <Save className="size-4" aria-hidden="true" />
                )}
                {uploadingIndex !== null
                  ? `Uploading material ${uploadingIndex + 1} of ${pendingMaterials.length}…`
                  : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
