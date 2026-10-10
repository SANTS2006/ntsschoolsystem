import { NotebookText } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileLink } from "@/components/ui/FileLink";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { useMyLessons } from "@/features/education/useEducationCrud";
import type { ApiError } from "@/lib/api-client";

import { useMySubjectMaterials, useMySubjects } from "./useAcademicsCrud";

/** A student's lessons and materials for one subject, combined on one page — lessons and
 * materials are the same idea from a student's point of view (things a teacher posted for them
 * to read), so this reads as one "Lessons" section rather than two separate ones. */
export function MySubjectLessonsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: subjects, isLoading: isLoadingSubjects } = useMySubjects();
  const offering = subjects?.find((s) => s.id === id);
  const { data: allLessons, isLoading: isLoadingLessons, isError, error } = useMyLessons();
  const { data: materials, isLoading: isLoadingMaterials } = useMySubjectMaterials(id);

  const lessons = useMemo(
    () =>
      offering
        ? (allLessons ?? []).filter(
            (lesson) => lesson.subject === offering.subject && lesson.school_class === offering.school_class,
          )
        : [],
    [allLessons, offering],
  );

  const isLoading = isLoadingSubjects || isLoadingLessons || isLoadingMaterials;

  if (isLoadingSubjects) {
    return <FullPageSpinner />;
  }

  if (!offering) {
    return <Alert tone="danger">Subject not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate("/my-subjects")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to subjects
      </button>

      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          {offering.subject_name} — {offering.school_class_name} · Lessons
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{offering.term_name}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : isError ? (
        <Alert tone="danger">{(error as ApiError).message}</Alert>
      ) : lessons.length === 0 && (!materials || materials.length === 0) ? (
        <EmptyState
          icon={NotebookText}
          title="Nothing posted yet"
          description="Your teacher hasn't posted any lessons or materials for this subject yet."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {lessons.map((lesson) => (
            <Card key={lesson.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{lesson.title}</CardTitle>
                <Badge tone={lesson.is_active ? "success" : "neutral"}>
                  {lesson.is_active ? "Active" : "Inactive"}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {lesson.description && <p className="text-sm text-[var(--color-text)]">{lesson.description}</p>}
                {lesson.materials.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {lesson.materials.map((material) => (
                      <FileLink key={material.id} url={material.file} label={material.title} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {materials && materials.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>More materials</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {materials.map((material) => (
                  <FileLink key={material.id} url={material.file} label={material.title} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
