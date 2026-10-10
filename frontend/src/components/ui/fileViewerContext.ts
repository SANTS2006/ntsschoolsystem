import { createContext, useContext } from "react";

export interface FileViewerApi {
  /** Opens a stored file in the in-app viewer. */
  openFile: (url: string, title?: string) => void;
}

export const FileViewerContext = createContext<FileViewerApi>({
  // Outside a provider (e.g. a test), fall back to the browser's own viewer rather than doing nothing.
  openFile: (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
});

export function useFileViewer(): FileViewerApi {
  return useContext(FileViewerContext);
}
