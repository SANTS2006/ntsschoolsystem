import { BookOpen, ClipboardCheck, MessageSquare, NotebookText, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";

import { useMySubjects } from "./useAcademicsCrud";

const ACTION_CLASS =
  "flex flex-1 flex-col items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2 py-3 text-xs font-medium text-[var(--color-text)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]";

/** Same image-cover card design as the teacher's own Subjects page (see
 * TeacherSubjectsPage.tsx's SubjectOfferingCard) — a student sees the teacher's chosen cover
 * photo but has no camera button to change it. */
export function MySubjectsPage() {
  const navigate = useNavigate();
  const { data: subjects, isLoading, isError, error } = useMySubjects();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Subjects</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          The subjects you're enrolled in this term, with their teacher and grading split.
        </p>
      </div>

      {!subjects || subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects yet"
          description="You haven't been enrolled into any subjects yet — check with your school administrator."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <article
              key={subject.id}
              className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
            >
              <div className="relative h-48 w-full overflow-hidden bg-[image:var(--gradient-primary)]">
                {subject.cover_image ? (
                  <img src={subject.cover_image} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <BookOpen className="absolute inset-0 m-auto size-14 text-white/40" aria-hidden="true" />
                )}
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/40"
                  aria-hidden="true"
                />

                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 text-white">
                  <div>
                    <h2 className="truncate text-base font-semibold drop-shadow-sm">{subject.subject_name}</h2>
                    <p className="truncate text-sm text-white/90 drop-shadow-sm">
                      {subject.school_class_name} · {subject.term_name}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-white/80 drop-shadow-sm">
                      <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
                      {subject.main_teacher_name}
                      {subject.assistant_teacher_name && ` + ${subject.assistant_teacher_name}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
                      CA {subject.ca_weight_percent}%
                    </span>
                    <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
                      Exam {subject.exam_weight_percent}%
                    </span>
                    <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
                      Pass mark {subject.pass_mark}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 p-5">
                <button type="button" className={ACTION_CLASS} onClick={() => navigate(`/my-subjects/${subject.id}/ca`)}>
                  <ClipboardCheck className="size-5" aria-hidden="true" />
                  CA
                </button>
                <button
                  type="button"
                  className={ACTION_CLASS}
                  onClick={() => navigate(`/my-subjects/${subject.id}/lessons`)}
                >
                  <NotebookText className="size-5" aria-hidden="true" />
                  Lessons
                </button>
                <button
                  type="button"
                  className={ACTION_CLASS}
                  onClick={() => navigate(`/my-subjects/${subject.id}/communications#messages`)}
                >
                  <MessageSquare className="size-5" aria-hidden="true" />
                  Messages
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
