import { BookOpen, Download, Video } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileLink } from "@/components/ui/FileLink";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";
import { triggerFileDownload } from "@/lib/fileDownload";

import { useMyLessons } from "./useEducationCrud";

export function MyLessonsPage() {
  const { data: lessons, isLoading, isError, error } = useMyLessons();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My Lessons</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Notes, documents, and videos your teachers have posted for your class.
        </p>
      </div>

      {!lessons || lessons.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No lessons yet"
          description="Your teachers haven't posted any lessons for your class yet."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {lessons.map((lesson) => (
            <Card key={lesson.id}>
              <CardHeader>
                <CardTitle className="truncate text-base font-semibold text-[var(--color-text)]">
                  {lesson.title}
                </CardTitle>
                <p className="truncate text-sm text-[var(--color-text-muted)]">{lesson.subject_name}</p>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {lesson.description && <p className="text-sm text-[var(--color-text)]">{lesson.description}</p>}
                {lesson.materials.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">No materials posted yet.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {lesson.materials.map((material) =>
                      material.material_type === "video" ? (
                        <div key={material.id} className="flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-[var(--color-text)]">
                              <Video className="size-4 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
                              <span className="truncate">{material.title}</span>
                            </p>
                            <button
                              type="button"
                              onClick={() => triggerFileDownload(material.file, material.title)}
                              aria-label={`Download ${material.title}`}
                              title="Download"
                              className="shrink-0 rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                            >
                              <Download className="size-4" aria-hidden="true" />
                            </button>
                          </div>
                          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                          <video src={material.file} controls className="w-full rounded-[var(--radius-md)]" />
                        </div>
                      ) : (
                        <FileLink key={material.id} url={material.file} label={material.title} />
                      ),
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
