import { ConnectionBanner } from "@/components/ConnectionBanner";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { BrandProvider } from "./components/BrandProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SignOutOverlay } from "./components/SignOutOverlay";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";
import { FileViewerProvider } from "./components/ui/FileViewer";
import { ToastProvider } from "./components/ui/Toast";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "./index.css";
import { installGlobalErrorHandlers } from "./lib/clientErrors";
import { queryClient } from "./lib/query-client";
import { SchoolSlugContext, schoolSlugFromPath } from "./lib/schoolSlug";
import { PwaPrompts } from "./pwa/PwaPrompts";
import { initPwa } from "./pwa/pwaStore";

initPwa();
installGlobalErrorHandlers();

// A school's pages all live under its slug (/greenwood/dashboard), so the router is mounted at that address and
// every link inside the app stays within the school on its own. Platform and generic pages have no slug.
const schoolSlug = schoolSlugFromPath(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <FileViewerProvider>
            <SchoolSlugContext.Provider value={schoolSlug}>
              <BrowserRouter basename={schoolSlug ? `/${schoolSlug}` : undefined}>
                <BrandProvider />
                <SignOutOverlay />
                <ErrorBoundary fullScreen>
                  <App />
                  <ConnectionBanner />
                </ErrorBoundary>
                <PwaPrompts />
              </BrowserRouter>
            </SchoolSlugContext.Provider>
          </FileViewerProvider>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
