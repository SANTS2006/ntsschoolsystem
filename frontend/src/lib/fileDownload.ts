import { apiClient } from "@/lib/api-client";

/** What kind of thing a stored file is, judged from its URL's extension — decides how the in-app
 * viewer shows it (see components/ui/FileViewer.tsx). */
export type FileKind = "image" | "pdf" | "video" | "audio" | "text" | "other";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"]);
const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);
const AUDIO_EXT = new Set(["mp3", "wav", "ogg", "m4a", "aac"]);
const TEXT_EXT = new Set(["txt", "csv", "md", "json", "log"]);

export function fileExtension(url: string): string {
  const path = url.split(/[?#]/)[0];
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(path);
  return match ? match[1].toLowerCase() : "";
}

export function fileKind(url: string): FileKind {
  const ext = fileExtension(url);
  if (IMAGE_EXT.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (TEXT_EXT.has(ext)) return "text";
  return "other";
}

/** A sensible file name for saving: the title the user sees, plus the stored file's own extension if
 * the title doesn't already end with it (a document titled "Term report" becomes "Term report.pdf"). */
export function downloadName(url: string, title?: string): string {
  const ext = fileExtension(url);
  const base = (title || decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() || "file")).trim();
  if (!ext || base.toLowerCase().endsWith(`.${ext}`)) return base;
  return `${base}.${ext}`;
}

/**
 * Turns an uploaded file's URL into one that downloads when navigated to, for the fallback path below.
 * Uploaded files live on Cloudinary in production; its `fl_attachment` delivery flag makes Cloudinary
 * answer with `Content-Disposition: attachment`. A same-origin URL (local dev) needs nothing.
 */
export function downloadableFileUrl(url: string, filename?: string): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) {
    return url;
  }
  const flag = filename ? `fl_attachment:${encodeURIComponent(filename.replace(/\.[^./]+$/, ""))}` : "fl_attachment";
  return url.replace("/upload/", `/upload/${flag}/`);
}

/** Cloudinary won't serve PDFs and ZIPs from their public URL (HTTP 401), so those are fetched through
 * the backend's signed-in file proxy instead (apps/common/files.py). Everything else loads directly. */
export function needsFileProxy(url: string): boolean {
  return url.includes("res.cloudinary.com") && ["pdf", "zip"].includes(fileExtension(url));
}

/** The file's bytes, fetched the way that works for its type. Throws if it can't be fetched. */
export async function fetchStoredFile(url: string, name?: string, asDownload = false): Promise<Blob> {
  if (needsFileProxy(url)) {
    const { data } = await apiClient.get<Blob>("/files/", {
      params: { url, name, download: asDownload ? 1 : undefined },
      responseType: "blob",
    });
    return data;
  }
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.blob();
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

/**
 * Saves a file to the user's device. The file is fetched and saved from a blob, which is the only way
 * to be sure of a real download with the right name for a cross-origin file (the HTML `download`
 * attribute is ignored across origins, and opening the URL just shows images/PDFs in the browser).
 * If the fetch isn't possible (blocked, offline, host without CORS) it falls back to a navigation to
 * Cloudinary's attachment URL. Resolves to whether the blob download worked.
 */
export async function triggerFileDownload(url: string, title?: string): Promise<boolean> {
  const filename = downloadName(url, title);
  try {
    saveBlob(await fetchStoredFile(url, filename, true), filename);
    return true;
  } catch {
    const link = document.createElement("a");
    link.href = downloadableFileUrl(url, filename);
    link.download = filename;
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return false;
  }
}
