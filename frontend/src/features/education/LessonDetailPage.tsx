import { Download, FileText, Trash2, Upload, Video } from "lucide-react";
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
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useCurrentUser } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";
import { triggerFileDownload } from "@/lib/fileDownload";

import type { MaterialType } from "./types";
import { useCreateMaterial, useDeleteMaterial, useLesson, useMaterialList } from "./useEducationCrud";

export function LessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const listPath = currentUser?.roles.some((role) => role.slug === "teacher") ? "/subjects" : "/education/lessons";
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canUpdate = useHasPermission("education.update");
  const canDelete = useHasPermission("education.delete");

  const { data: lesson, isLoading, isError, error } = useLesson(id);
  const { data: materials, isLoading: isLoadingMaterials } = useMaterialList(id);
  const createMaterial = useCreateMaterial();
  const deleteMaterial = useDeleteMaterial();

  const [materialType, setMaterialType] = useState<MaterialType>("document");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const handleUpload = () => {
    if (!id || !file || !title.trim()) return;
    setProgress(0);
    createMaterial.mutate(
      { values: { lesson: id, material_type: materialType, title: title.trim(), file }, onProgress: setProgress },
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
    if (!id) return;
    const ok = await confirm({
      title: `Delete "${materialTitle}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteMaterial.mutate(
      { id: materialId, lesson: id },
      {
        onSuccess: () => showToast({ title: "Material deleted" }),
        onError: (err: ApiError) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
      },
    );
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !lesson) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Lesson not found."}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(listPath)}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to lessons
      </button>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate text-base font-semibold text-[var(--color-text)]">{lesson.title}</CardTitle>
            <p className="truncate text-sm text-[var(--color-text-muted)]">
              {lesson.subject_name} · {lesson.school_class_name}
              {lesson.section_name && ` — ${lesson.section_name}`} · {lesson.teacher_name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone={lesson.is_active ? "success" : "neutral"}>{lesson.is_active ? "Active" : "Inactive"}</Badge>
            {canUpdate && (
              <Button variant="secondary" size="sm" onClick={() => navigate(`/education/lessons/${lesson.id}/edit`)}>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        {lesson.description && (
          <CardContent>
            <p className="text-sm text-[var(--color-text)]">{lesson.description}</p>
          </CardContent>
        )}
      </Card>

      {canUpdate && (
        <Card>
          <CardHeader>
            <CardTitle>Upload material</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Type" value={materialType} onChange={(e) => setMaterialType(e.target.value as MaterialType)}>
                <option value="document">Document</option>
                <option value="video">Video</option>
              </Select>
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[var(--color-text)]">
                File {materialType === "video" && <span className="text-[var(--color-text-muted)]">(up to 200MB)</span>}
              </span>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm text-[var(--color-text-muted)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--color-bg-subtle)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--color-text)]"
              />
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
      )}

      <Card>
        <CardHeader>
          <CardTitle>Materials</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingMaterials ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : materials && materials.length === 0 ? (
            <EmptyState icon={FileText} title="No materials yet" description="Upload a document or video above." />
          ) : (
            <div className="flex flex-col gap-2">
              {materials?.map((material) => (
                <div
                  key={material.id}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-primary)]">
                    {material.material_type === "video" ? (
                      <Video className="size-4" aria-hidden="true" />
                    ) : (
                      <FileText className="size-4" aria-hidden="true" />
                    )}
                  </span>
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
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMaterial(material.id, material.title)}
                      aria-label={`Delete ${material.title}`}
                      title="Delete"
                      className="shrink-0 rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-danger)]"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
