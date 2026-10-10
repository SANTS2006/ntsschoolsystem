import { ImagePlus, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";

const MAX_BYTES = 5 * 1024 * 1024;

/** A picture picker with a live preview — the form owns the `File` (this is a controlled field,
 * not a react-hook-form `register`). `existingUrl` is the already-saved image when editing, shown
 * until a new file is chosen. Size/type are checked here for a friendly message; the server
 * validates again. */
export function ImageField({
  label,
  value,
  onChange,
  existingUrl,
  required,
  error,
  hint,
}: {
  label: string;
  value: File | null;
  onChange: (file: File | null) => void;
  existingUrl?: string | null;
  required?: boolean;
  error?: string;
  hint?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const previewUrl = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const shown = previewUrl ?? existingUrl ?? null;
  const message = localError ?? error;

  const handleFile = (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLocalError("Please choose an image file (JPG, PNG, WEBP or GIF).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("That image is larger than 5MB — choose a smaller one.");
      return;
    }
    onChange(file);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-[var(--color-text)]">
        {label}
        {required ? (
          <span className="text-[var(--color-danger)]"> *</span>
        ) : (
          <span className="font-normal text-[var(--color-text-muted)]"> (optional)</span>
        )}
      </label>
      <div
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-[var(--radius-md)] border border-dashed p-3",
          message ? "border-[var(--color-danger)]" : "border-[var(--color-border)]",
        )}
      >
        {shown ? (
          <img src={shown} alt="" className="h-24 w-36 rounded-md border border-[var(--color-border)] object-cover" />
        ) : (
          <div className="flex h-24 w-36 items-center justify-center rounded-md bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">
            <ImagePlus className="size-7" aria-hidden="true" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/*"
            className="text-sm text-[var(--color-text)] file:mr-3 file:rounded-md file:border file:border-[var(--color-border)] file:bg-[var(--color-surface)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--color-text)]"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setLocalError(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="flex w-fit items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
            >
              <X className="size-3.5" aria-hidden="true" /> Remove the chosen image
            </button>
          )}
        </div>
      </div>
      {message ? (
        <p className="text-xs text-[var(--color-danger)]" role="alert">
          {message}
        </p>
      ) : hint ? (
        <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
