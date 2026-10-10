import { Download, ExternalLink, FileText } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { downloadName, fetchStoredFile, fileKind, needsFileProxy, triggerFileDownload } from "@/lib/fileDownload";

import { FileViewerContext, type FileViewerApi, useFileViewer } from "./fileViewerContext";

const MAX_TEXT_BYTES = 1024 * 1024;

function TextPreview({ url }: { url: string }) {
  const [state, setState] = useState<{ text?: string; failed?: boolean }>({});

  useEffect(() => {
    let cancelled = false;
    fetchStoredFile(url)
      .then((blob) => blob.text())
      .then((text) => !cancelled && setState({ text: text.slice(0, MAX_TEXT_BYTES) }))
      .catch(() => !cancelled && setState({ failed: true }));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.failed) return <p className="p-6 text-sm text-[var(--color-text-muted)]">This file couldn't be previewed. Download it to read it.</p>;
  if (state.text === undefined) {
    return (
      <div className="flex justify-center p-10">
        <Spinner />
      </div>
    );
  }
  return (
    <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-bg-subtle)] p-4 text-sm text-[var(--color-text)]">
      {state.text}
    </pre>
  );
}

/** The address a browser element can load the file from: the stored URL itself, or — for the file
 * types Cloudinary won't serve publicly — a blob fetched through the backend. */
function useViewableSrc(url: string): { src: string | null; failed: boolean } {
  const proxied = needsFileProxy(url);
  const [blob, setBlob] = useState<{ url: string; src?: string; failed?: boolean } | null>(null);

  useEffect(() => {
    if (!proxied) return;
    let objectUrl: string | undefined;
    let cancelled = false;
    fetchStoredFile(url)
      .then((data) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setBlob({ url, src: objectUrl });
      })
      .catch(() => !cancelled && setBlob({ url, failed: true }));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, proxied]);

  if (!proxied) return { src: url, failed: false };
  if (blob?.url !== url) return { src: null, failed: false };
  return { src: blob.src ?? null, failed: !!blob.failed };
}

function Preview({ url, title }: { url: string; title: string }) {
  const kind = fileKind(url);
  const { src, failed } = useViewableSrc(url);
  if (failed) {
    return <p className="p-6 text-sm text-[var(--color-text-muted)]">This file couldn't be loaded. Try Download instead.</p>;
  }
  if (!src && kind !== "text" && kind !== "other") {
    return (
      <div className="flex justify-center p-10">
        <Spinner />
      </div>
    );
  }
  switch (kind) {
    case "image":
      return <img src={src ?? url} alt={title} className="mx-auto max-h-[70vh] max-w-full rounded-md object-contain" />;
    case "pdf":
      return <iframe src={src ?? undefined} title={title} className="h-[70vh] w-full rounded-md border border-[var(--color-border)] bg-white" />;
    case "video":
      return <video src={src ?? url} controls className="mx-auto max-h-[70vh] w-full rounded-md bg-black" />;
    case "audio":
      return <audio src={src ?? url} controls className="w-full" />;
    case "text":
      return <TextPreview url={url} />;
    default:
      return (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FileText className="size-10 text-[var(--color-text-muted)]" aria-hidden="true" />
          <p className="text-sm text-[var(--color-text)]">This type of file can't be shown here.</p>
          <p className="text-xs text-[var(--color-text-muted)]">Download it to open it in the right application.</p>
        </div>
      );
  }
}

/** One in-app viewer for every uploaded file: images, PDFs, video, audio and plain text are shown
 * right here in a dialog; anything else offers Download. Wrap the app once; anything inside opens a
 * file with `useFileViewer().openFile(url, title)` or `<OpenFileButton>`. */
export function FileViewerProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<{ url: string; title: string } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const openFile = useCallback((url: string, title?: string) => {
    setFile({ url, title: downloadName(url, title) });
  }, []);
  const api = useMemo<FileViewerApi>(() => ({ openFile }), [openFile]);

  // A file Cloudinary won't serve publicly is fetched through the backend first, then shown from a blob.
  const openInNewTab = async () => {
    if (!file) return;
    if (!needsFileProxy(file.url)) {
      window.open(file.url, "_blank", "noopener,noreferrer");
      return;
    }
    // Opened straight away (while still inside the click) so a pop-up blocker lets it through.
    const tab = window.open("", "_blank");
    try {
      const blob = await fetchStoredFile(file.url, file.title);
      if (tab) tab.location.href = URL.createObjectURL(blob);
    } catch {
      tab?.close();
    }
  };

  const download = async () => {
    if (!file) return;
    setDownloading(true);
    await triggerFileDownload(file.url, file.title);
    setDownloading(false);
  };

  return (
    <FileViewerContext.Provider value={api}>
      {children}
      <Modal open={file !== null} onClose={() => setFile(null)} title={file?.title ?? "File"} maxWidthClassName="max-w-5xl">
        {file && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={download} isLoading={downloading}>
                <Download className="size-4" aria-hidden="true" /> Download
              </Button>
              <Button size="sm" variant="secondary" onClick={openInNewTab}>
                <ExternalLink className="size-4" aria-hidden="true" /> Open in new tab
              </Button>
            </div>
            <Preview url={file.url} title={file.title} />
          </div>
        )}
      </Modal>
    </FileViewerContext.Provider>
  );
}

/** A button that opens `url` in the viewer — a drop-in for what used to be an `<a target="_blank">`. */
export function OpenFileButton({
  url,
  title,
  className,
  ariaLabel,
  children,
}: {
  url: string;
  title?: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const { openFile } = useFileViewer();
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        openFile(url, title);
      }}
    >
      {children}
    </button>
  );
}
