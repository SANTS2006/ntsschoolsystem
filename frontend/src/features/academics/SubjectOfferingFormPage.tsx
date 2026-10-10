import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useStaffList } from "@/features/staff/useStaffCrud";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";
import { useStateFromSource } from "@/hooks/useStateFromSource";

import { useAcademicYears, useSchoolClasses, useSubjects } from "./useAcademicsLookups";
import {
  useCreateSubjectOffering,
  useSubjectOffering,
  useTermList,
  useUpdateSubjectOffering,
} from "./useAcademicsCrud";

const schema = z
  .object({
    subject: z.string().min(1, "Subject is required"),
    academic_year: z.string().min(1, "Academic year is required"),
    term: z.string().min(1, "Term is required"),
    main_teacher: z.string().min(1, "Main teacher is required"),
    assistant_teacher: z.string(),
    ca_weight_percent: z.coerce.number().int().min(0).max(100),
    exam_weight_percent: z.coerce.number().int().min(0).max(100),
    pass_mark: z.coerce.number().int().min(0).max(100),
    status: z.enum(["active", "inactive"]),
  })
  .refine((values) => values.ca_weight_percent + values.exam_weight_percent === 100, {
    message: "CA percentage and exam percentage must sum to 100.",
    path: ["exam_weight_percent"],
  });

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  subject: "", academic_year: "", term: "",
  main_teacher: "", assistant_teacher: "",
  ca_weight_percent: 40, exam_weight_percent: 60, pass_mark: 50, status: "active",
};

const FIELD_KEYS = new Set([
  "subject", "academic_year", "term", "school_class", "main_teacher", "assistant_teacher",
  "ca_weight_percent", "exam_weight_percent", "pass_mark", "status",
]);

export function SubjectOfferingFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: offering, isLoading: isLoadingOffering } = useSubjectOffering(id);
  const { data: subjects } = useSubjects();
  const { data: academicYears } = useAcademicYears();
  const { data: classes } = useSchoolClasses();
  const { data: staff } = useStaffList({ page_size: 200, employment_status: "active", role: "teacher" });
  const createOffering = useCreateSubjectOffering();
  const updateOffering = useUpdateSubjectOffering(id ?? "");
  const mutation = isEditMode ? updateOffering : createOffering;

  // Creating: one or more classes, each becoming its own offering with the same subject/
  // teacher/weighting. Editing: exactly one, since an existing offering IS one specific class.
  const [selectedClasses, setSelectedClasses] = useStateFromSource(offering, (loaded) => (loaded ? [loaded.school_class] : []));
  const [classesTouched, setClassesTouched] = useState(false);
  const toggleClass = (classId: string) => {
    setClassesTouched(true);
    setSelectedClasses((current) =>
      isEditMode
        ? [classId]
        : current.includes(classId)
          ? current.filter((id) => id !== classId)
          : [...current, classId],
    );
  };

  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  const selectedAcademicYear = useWatch({ control, name: "academic_year" });
  const { data: terms } = useTermList({ page_size: 100, academic_year: selectedAcademicYear || undefined });

  useEffect(() => {
    if (offering) {
      reset({
        subject: offering.subject,
        academic_year: offering.academic_year,
        term: offering.term,
        main_teacher: offering.main_teacher,
        assistant_teacher: offering.assistant_teacher ?? "",
        ca_weight_percent: offering.ca_weight_percent,
        exam_weight_percent: offering.exam_weight_percent,
        pass_mark: offering.pass_mark,
        status: offering.status,
      });
    }
  }, [offering, reset]);

  const caWeight = useWatch({ control, name: "ca_weight_percent" });
  const examWeight = useWatch({ control, name: "exam_weight_percent" });
  const totalWeight = Number(caWeight || 0) + Number(examWeight || 0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const onSubmit = async (values: FormValues) => {
    if (selectedClasses.length === 0) {
      setClassesTouched(true);
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    const basePayload = {
      subject: values.subject,
      academic_year: values.academic_year,
      term: values.term,
      main_teacher: values.main_teacher,
      assistant_teacher: values.assistant_teacher || null,
      ca_weight_percent: values.ca_weight_percent,
      exam_weight_percent: values.exam_weight_percent,
      pass_mark: values.pass_mark,
      status: values.status,
    };
    try {
      // One offering per selected class — the backend models "who teaches what, for which
      // class" as one row per class, so several classes means several requests, not one.
      await Promise.all(
        selectedClasses.map((schoolClass) =>
          mutation.mutateAsync({ ...basePayload, school_class: schoolClass }),
        ),
      );
      showToast({
        title:
          isEditMode
            ? "Subject offering updated"
            : `Subject offering created for ${selectedClasses.length} class${selectedClasses.length === 1 ? "" : "es"}`,
      });
      navigate("/academics/subject-offerings");
    } catch (err) {
      if (!applyFieldErrors(err as ApiError, setError, FIELD_KEYS)) {
        setSubmitError(err as ApiError);
        showToast({ title: "Could not save subject offering", description: generalErrorMessage(err as ApiError), tone: "danger" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isEditMode && isLoadingOffering) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit subject offering" : "New subject offering"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Offering details</CardTitle>
        </CardHeader>
        <CardContent>
          {submitError && !Object.keys(errors).length && (
            <Alert tone="danger" className="mb-4">
              {generalErrorMessage(submitError)}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select label="Subject" error={errors.subject?.message} {...register("subject")}>
              <option value="">Select a subject</option>
              {subjects?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Academic year" error={errors.academic_year?.message} {...register("academic_year")}>
                <option value="">Select an academic year</option>
                {academicYears?.map((year) => (
                  <option key={year.id} value={year.id}>{year.name}</option>
                ))}
              </Select>
              <Select
                label="Term"
                hint={!selectedAcademicYear ? "Select an academic year first." : undefined}
                error={errors.term?.message}
                {...register("term")}
              >
                <option value="">Select a term</option>
                {terms?.results.map((term) => (
                  <option key={term.id} value={term.id}>{term.name}</option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-text)]">
                {isEditMode ? "Class" : "Classes"}
              </span>
              <p className="text-xs text-[var(--color-text-muted)]">
                {isEditMode
                  ? "This offering's class can't be changed here — create a new offering for a different class instead."
                  : "Select every class this subject should be offered to — one offering is created per class."}
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 sm:grid-cols-3">
                {classes?.map((c) => (
                  <Checkbox
                    key={c.id}
                    label={c.name}
                    disabled={isEditMode}
                    checked={selectedClasses.includes(c.id)}
                    onChange={() => toggleClass(c.id)}
                  />
                ))}
              </div>
              {classesTouched && selectedClasses.length === 0 && (
                <p className="text-sm text-[var(--color-danger)]">Select at least one class.</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Main teacher" error={errors.main_teacher?.message} {...register("main_teacher")}>
                <option value="">Select a teacher</option>
                {staff?.results.map((member) => (
                  <option key={member.id} value={member.id}>{member.full_name}</option>
                ))}
              </Select>
              <Select
                label="Assistant teacher"
                hint="Optional."
                error={errors.assistant_teacher?.message}
                {...register("assistant_teacher")}
              >
                <option value="">Not set</option>
                {staff?.results.map((member) => (
                  <option key={member.id} value={member.id}>{member.full_name}</option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                type="number"
                min={0}
                max={100}
                label="CA %"
                error={errors.ca_weight_percent?.message}
                {...register("ca_weight_percent")}
              />
              <Input
                type="number"
                min={0}
                max={100}
                label="Exam %"
                error={errors.exam_weight_percent?.message}
                {...register("exam_weight_percent")}
              />
              <Input
                type="number"
                min={0}
                max={100}
                label="Pass mark %"
                hint="This offering's own pass mark — not a global constant."
                error={errors.pass_mark?.message}
                {...register("pass_mark")}
              />
            </div>
            <p className={`text-sm ${totalWeight === 100 ? "text-[var(--color-text-muted)]" : "text-[var(--color-danger)]"}`}>
              CA + Exam = {totalWeight}% {totalWeight !== 100 && "— must equal 100%"}
            </p>

            <Select label="Status" error={errors.status?.message} {...register("status")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/academics/subject-offerings")}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting}>
                {!isSubmitting && <Save className="size-4" aria-hidden="true" />}
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
