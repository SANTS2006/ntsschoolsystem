import { BookOpen, Camera, ClipboardCheck, FileQuestion, MessageSquare, NotebookText, Users } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";

import type { SubjectOffering } from "./types";
import { useSubjectOfferingList, useUploadSubjectOfferingCoverImage } from "./useAcademicsCrud";

const ACTION_CLASS =
  "flex flex-col items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2 py-3 text-xs font-medium text-[var(--color-text)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]";

const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024; // matches the backend's validate_image_file cap
const ACCEPTED_COVER_IMAGE_TYPES = "image/jpeg,image/png,image/gif,image/webp";

/** One subject offering's card: a large cover photo (a teacher's own upload, picked via the
 * camera button) with the subject's key facts overlaid on it in absolute-positioned text — see
 * this component's own layout below for how that overlay is built. Falls back to a plain gradient
 * panel with the same overlay when no cover image has been set yet. */
function SubjectOfferingCard({ offering }: { offering: SubjectOffering }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const uploadCoverImage = useUploadSubjectOfferingCoverImage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const base = `/academics/subject-offerings/${offering.id}`;

  const handlePickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;

    if (file.size > MAX_COVER_IMAGE_BYTES) {
      showToast({
        title: "Image too large",
        description: `Images must be under ${MAX_COVER_IMAGE_BYTES / (1024 * 1024)}MB.`,
        tone: "danger",
      });
      return;
    }
    setLocalPreview(URL.createObjectURL(file));
    uploadCoverImage.mutate(
      { id: offering.id, file },
      {
        onError: (err: ApiError) => {
          setLocalPreview(null);
          showToast({ title: "Could not upload image", description: err.message, tone: "danger" });
        },
      },
    );
  };

  const coverImage = localPreview ?? offering.cover_image;

  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-md)]">
      {/* `relative` container + `absolute` overlay, per the requested layout: the photo fills the
       * panel, everything else sits on top of it rather than below it. */}
      <div className="relative h-48 w-full overflow-hidden bg-[image:var(--gradient-primary)]">
        {coverImage ? (
          <img src={coverImage} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <BookOpen className="absolute inset-0 m-auto size-14 text-white/40" aria-hidden="true" />
        )}
        {/* A dark gradient under the text keeps it legible over a bright photo without hiding the
         * photo itself. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/40" aria-hidden="true" />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadCoverImage.isPending}
          aria-label="Change subject cover image"
          className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 disabled:cursor-not-allowed"
        >
          {uploadCoverImage.isPending ? <Spinner size="sm" /> : <Camera className="size-4" aria-hidden="true" />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_COVER_IMAGE_TYPES}
          onChange={handlePickImage}
          className="hidden"
        />

        <div className="absolute right-3 top-3 mr-11">
          <Badge tone={offering.ca_status === "closed" ? "danger" : "success"}>
            CA {offering.ca_status === "closed" ? "closed" : "open"}
          </Badge>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 text-white">
          <div>
            <h2 className="truncate text-base font-semibold drop-shadow-sm">{offering.subject_name}</h2>
            <p className="truncate text-sm text-white/90 drop-shadow-sm">
              {offering.school_class_name} · {offering.term_name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">CA {offering.ca_weight_percent}%</span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">Exam {offering.exam_weight_percent}%</span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">Pass mark {offering.pass_mark}%</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className={ACTION_CLASS} onClick={() => navigate(`${base}/students`)}>
            <Users className="size-5" aria-hidden="true" />
            Students
          </button>
          <button type="button" className={ACTION_CLASS} onClick={() => navigate(`/subjects/${offering.id}/lessons`)}>
            <NotebookText className="size-5" aria-hidden="true" />
            Lessons
          </button>
          <button type="button" className={ACTION_CLASS} onClick={() => navigate(`${base}/ca`)}>
            <ClipboardCheck className="size-5" aria-hidden="true" />
            CA
          </button>
          <button
            type="button"
            className={`${ACTION_CLASS} col-span-2`}
            onClick={() => navigate(`${base}/communications`)}
          >
            <MessageSquare className="size-5" aria-hidden="true" />
            Messages
          </button>
          <button type="button" className={ACTION_CLASS} onClick={() => navigate(`${base}/quizzes`)}>
            <FileQuestion className="size-5" aria-hidden="true" />
            Quizzes
          </button>
        </div>
      </div>
    </article>
  );
}

/** The teacher's own Subjects page: every subject offering they teach — scoped server-side to
 * offerings where they're the main or assistant teacher — each shown as a card with shortcuts to
 * its roster, lessons, CA workflow and communications. */
export function TeacherSubjectsPage() {
  const { data, isLoading, isError, error } = useSubjectOfferingList({ page_size: 100 });

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  const offerings = data?.results ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Subjects</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          The subjects you teach. Manage each subject's students, lessons and continuous assessment.
        </p>
      </div>

      {offerings.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects assigned"
          description="You haven't been assigned to teach any subjects yet — check with your school administrator."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {offerings.map((offering) => (
            <SubjectOfferingCard key={offering.id} offering={offering} />
          ))}
        </div>
      )}
    </div>
  );
}
