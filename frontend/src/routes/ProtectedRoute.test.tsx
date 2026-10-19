import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";
import { SchoolSlugContext } from "@/lib/schoolSlug";
import type { CurrentUser } from "@/types/auth";

const { fetchCurrentUser } = vi.hoisted(() => ({ fetchCurrentUser: vi.fn() }));
vi.mock("@/features/auth/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/api")>()),
  fetchCurrentUser,
  sendHeartbeat: () => Promise.resolve(),
}));

// The live-updates watcher polls notifications and needs the toast provider; it is not what these tests are about.
vi.mock("@/features/notifications/LiveUpdates", () => ({ LiveUpdates: () => null }));

import { ProtectedRoute } from "./ProtectedRoute";

const user = {
  id: "u1",
  email: "a@b.test",
  first_name: "A",
  last_name: "B",
  full_name: "A B",
  is_platform_admin: false,
  must_change_password: false,
  school: { id: "s1", name: "Greenwood", slug: "greenwood", logo: null, school_type: "secondary", grade_point_scale: "5.00" },
  roles: [],
  permissions: [],
} as unknown as CurrentUser;

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SchoolSlugContext.Provider value="greenwood">
        <MemoryRouter initialEntries={["/students"]}>
          <Routes>
            <Route path="/login" element={<p>sign in page</p>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/students" element={<p>students page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </SchoolSlugContext.Provider>
    </QueryClientProvider>,
  );
}

const apiError = (status: number | undefined, code: string) =>
  new ApiError({ success: false, message: "x", code, errors: [] }, status);

describe("ProtectedRoute — authentication initialisation", () => {

  it("shows a loading screen (never the page, never a blank) while the session is being checked", async () => {
    fetchCurrentUser.mockReturnValue(new Promise(() => undefined));
    renderApp();
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("students page")).not.toBeInTheDocument();
  });

  it("renders the page once the session is confirmed", async () => {
    fetchCurrentUser.mockResolvedValue(user);
    renderApp();
    expect(await screen.findByText("students page")).toBeInTheDocument();
  });

  it("an expired session (401) goes to the sign-in page", async () => {
    fetchCurrentUser.mockRejectedValue(apiError(401, "NOT_AUTHENTICATED"));
    renderApp();
    expect(await screen.findByText("sign in page")).toBeInTheDocument();
  });

  it("a brief network failure is retried by itself and never shows as signed out", async () => {
    fetchCurrentUser.mockRejectedValueOnce(apiError(undefined, "NETWORK_ERROR")).mockResolvedValue(user);
    renderApp();
    expect(await screen.findByText("students page", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.queryByText("sign in page")).not.toBeInTheDocument();
  });

  it("a lasting network failure is NOT treated as signed out: a retry screen, then the page when the server is back", async () => {
    fetchCurrentUser.mockRejectedValue(apiError(undefined, "NETWORK_ERROR"));
    renderApp();
    expect(await screen.findByRole("alert", {}, { timeout: 12000 })).toHaveTextContent("can't reach the server");
    expect(screen.queryByText("sign in page")).not.toBeInTheDocument();
    fetchCurrentUser.mockResolvedValue(user);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("students page")).toBeInTheDocument();
  });

  it("a server error (5xx) also gets the retry screen rather than a redirect loop", async () => {
    fetchCurrentUser.mockRejectedValue(apiError(503, "SERVER_ERROR"));
    renderApp();
    expect(await screen.findByRole("alert", {}, { timeout: 12000 })).toBeInTheDocument();
    expect(screen.queryByText("sign in page")).not.toBeInTheDocument();
  });
});
