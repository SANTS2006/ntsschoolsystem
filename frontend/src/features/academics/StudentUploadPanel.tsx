import { Lock, Paperclip, Trash2, Upload } from "lucide-react";
import { useRef } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FileLink } from "@/components/ui/FileLink";
import { useConfirm } from "@/components/ui/confirmContext";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";

import type { MySubjectCAAssessment } from "./types";
import { useDeleteAssessmentFile, useUploadAssessmentFile } from "./useAcademicsCrud";

/** A student's hand-in slot for one assessment: their files, the deadline the teacher set, and (only while the
 * teacher has uploads open) the controls to add or remove files. Once the deadline passes the controls are gone. */
export function StudentUploadPanel({ row }: { row: MySubjectCAAssessment }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadAssessmentFile();
  const remove = useDeleteAssessmentFile();

  if (!row.allow_file_uploads) return null;
  const open = row.upload_state === "open";
  const full = row.my_files.length >= row.max_files;

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0) return;
    const room = row.max_files - row.my_files.length;
    const chosen = picked.slice(0, Math.max(room, 0));
    if (picked.length > chosen.length) {
      showToast({ title: `Only ${room} more file${room === 1 ? "" : "s"} allowed`, description: `The limit is ${row.max_files} files.`, tone: "danger" });
    }
    let done = 0;
    for (const file of chosen) {
      try {
        await upload.mutateAsync({ assessmentId: row.assessment, file });
        done += 1;
      } catch (err) {
        showToast({ title: `Could not upload ${file.name}`, description: (err as ApiError).message, tone: "danger" });
      }
    }
    if (done > 0) showToast({ title: done === 1 ? "File uploaded" : `${done} files uploaded` });
  };

  const onRemove = async (id: string, name: string) => {
    if (!(await confirm({ title: `Remove ${name}?`, description: "Your teacher will no longer see this file." }))) return;
    remove.mutate(id, {
      onError: (err: ApiError) => showToast({ title: "Could not remove", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3 font-normal">
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text)]">
        <Paperclip className="size-3.5" aria-hidden="true" /> Hand in your work
      </div>
      {row.upload_instructions && <p className="text-xs text-[var(--color-text-muted)]">{row.upload_instructions}</p>}
      {open ? (
        row.upload_deadline_text ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            Upload by <strong>{row.upload_deadline_text}</strong>.
          </p>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">Uploads are open.</p>
        )
      ) : (
        <Alert tone="warning">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden="true" />
            Uploads closed{row.upload_deadline_text ? ` on ${row.upload_deadline_text}` : ""}. Ask your teacher if you need
            more time.
          </span>
        </Alert>
      )}
      {row.my_files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {row.my_files.map((file) => (
            <li key={file.id} className="flex items-center gap-2">
              <FileLink url={file.url} label={file.name} className="flex-1" />
              {open && (
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => void onRemove(file.id, file.name)}
                  className="shrink-0 rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-danger)]"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div>
          <input ref={input} type="file" multiple className="hidden" onChange={(e) => void onPick(e)} />
          <Button size="sm" variant="secondary" disabled={full} isLoading={upload.isPending} onClick={() => input.current?.click()}>
            <Upload className="size-4" aria-hidden="true" />
            {row.my_files.length === 0 ? "Upload files" : "Add more files"}
          </Button>
          {full && <span className="ml-2 text-xs text-[var(--color-text-muted)]">Limit of {row.max_files} files reached.</span>}
        </div>
      )}
      {!open && row.my_files.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">You didn&apos;t hand anything in.</p>
      )}
    </div>
  );
}
