import { Download, FileText, NotebookText, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { OpenFileButton } from "@/components/ui/FileViewer";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useLessonList } from "@/features/education/useEducationCrud";
import type { ApiError } from "@/lib/api-client";
import { triggerFileDownload } from "@/lib/fileDownload";

import { useCreateSubjectMaterial, useDeleteSubjectMaterial, useSubjectMaterials, useSubjectOffering } from "./useAcademicsCrud";

/** Lessons AND materials for one subject offering, combined on one page — a teacher's own
 * "Materials & messages" tab used to split them, but they're the same idea (things a teacher
 * posts for students to read), so the file upload lives here now and only the general/private
 * messaging stays on its own page (see SubjectOfferingCommunicationsPage.tsx). */
export function TeacherSubjectLessonsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canCreateLesson = useHasPermission("education.create");
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: offering, isLoading: isLoadingOffering } = useSubjectOffering(id);
  const {
    data: lessons,
    isLoading: isLoadingLessons,
    isError,
    error,
  } = useLessonList({
    page_size: 100,
    subject: offering?.subject,
    school_class: offering?.school_class,
  });
  const { data: materials, isLoading: isLoadingMaterials } = useSubjectMaterials(id);
  const createMaterial = useCreateSubjectMaterial();
  const deleteMaterial = useDeleteSubjectMaterial();

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const handleUpload = () => {
    if (!id || !file || !title.trim()) return;
    setProgress(0);
    createMaterial.mutate(
      { values: { subject_offering: id, title: title.trim(), file }, onProgress: setProgress },
      {
        onSuccess: () => {
          showToast({ title: "Material uploaded" });
          setTitle("");
          setFile(null);
          setProgress(null);
        },
        onError: (err: ApiError) => {
          showToast({ title: "Upload failed", description: err.message, tone: "danger" });
          setProgress(null);
        },
      },
    );
  };

  const handleDeleteMaterial = async (materialId: string, materialTitle: string) => {
    const ok = await confirm({ title: `Delete "${materialTitle}"?`, description: "This cannot be undone.", tone: "danger" });
    if (!ok) return;
    deleteMaterial.mutate(materialId, {
      onSuccess: () => showToast({ title: "Material deleted" }),
      onError: (err: ApiError) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  if (isLoadingOffering) {
    return <FullPageSpinner />;
  }

  if (!offering) {
    return <Alert tone="danger">Subject not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate("/subjects")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to subjects
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">
            {offering.subject_name} — {offering.school_class_name} · Lessons
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{offering.term_name}</p>
        </div>
        {canCreateLesson && (
          <Button
            onClick={() =>
              navigate(`/education/lessons/new?subject=${offering.subject}&school_class=${offering.school_class}`)
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            Add lesson
          </Button>
        )}
      </div>

      {isLoadingLessons ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : isError ? (
        <Alert tone="danger">{(error as ApiError).message}</Alert>
      ) : !lessons || lessons.results.length === 0 ? (
        <EmptyState
          icon={NotebookText}
          title="No lessons yet"
          description="Add the first lesson for this subject and class."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {lessons.results.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              onClick={() => navigate(`/education/lessons/${lesson.id}`)}
              className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-bg-subtle)] text-[var(--color-primary)]">
                <NotebookText className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[var(--color-text)]">{lesson.title}</span>
                <span className="mt-0.5 block truncate text-sm text-[var(--color-text-muted)]">
                  {lesson.teacher_name} · {lesson.material_count} material{lesson.material_count === 1 ? "" : "s"}
                </span>
              </span>
              <Badge tone={lesson.is_active ? "success" : "neutral"}>{lesson.is_active ? "Active" : "Inactive"}</Badge>
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upload material</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[var(--color-text)]">File</span>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm text-[var(--color-text-muted)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--color-bg-subtle)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--color-text)]"
              />
            </div>
          </div>
          {progress !== null && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
              <div
                className="h-full rounded-full bg-[image:var(--gradient-primary)] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={handleUpload} isLoading={createMaterial.isPending} disabled={!file || !title.trim()}>
              {!createMaterial.isPending && <Upload className="size-4" aria-hidden="true" />}
              Upload
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Materials</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingMaterials ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : !materials || materials.results.length === 0 ? (
            <EmptyState icon={FileText} title="No materials yet" description="Upload a document above." />
          ) : (
            <div className="flex flex-col gap-2">
              {materials.results.map((material) => (
                <div
                  key={material.id}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3"
                >
                  <FileText className="size-4 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <OpenFileButton
                      url={material.file}
                      title={material.title}
                      className="block max-w-full truncate text-left text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]"
                    >
                      {material.title}
                    </OpenFileButton>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">
                      Uploaded by {material.uploaded_by_name} · {new Date(material.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerFileDownload(material.file, material.title)}
                    aria-label={`Download ${material.title}`}
                    title="Download"
                    className="shrink-0 rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-primary)]"
                  >
                    <Download className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteMaterial(material.id, material.title)}
                    aria-label={`Delete ${material.title}`}
                    title="Delete"
                    className="shrink-0 rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-danger)]"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
