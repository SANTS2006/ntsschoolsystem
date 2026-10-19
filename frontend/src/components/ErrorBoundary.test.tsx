import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ChunkLoadError } from "@/lib/lazyRetry";

import { ErrorBoundary, PageOutlet } from "./ErrorBoundary";

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error("page exploded");
  return <p>page is fine</p>;
}

describe("ErrorBoundary", () => {
  it("shows a recovery screen instead of a blank page when a page crashes", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong while loading this page");
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    // no stack trace or internal message is shown to the user
    expect(screen.queryByText(/page exploded/)).not.toBeInTheDocument();
  });

  it("Try again re-renders the page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let explode = true;
    function Flaky() {
      return <Boom explode={explode} />;
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    explode = false;
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("page is fine")).toBeInTheDocument();
  });

  it("a script that could not be loaded offers a reload, not a pointless retry", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Stale(): never {
      throw new ChunkLoadError();
    }
    render(
      <ErrorBoundary>
        <Stale />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("couldn't be loaded");
    expect(screen.getByRole("button", { name: /reload the app/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("a crash on one page does not follow the user to the next page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={["/broken"]}>
        <Link to="/ok">go to ok</Link>
        <Routes>
          <Route element={<PageOutlet />}>
            <Route path="/broken" element={<Boom explode />} />
            <Route path="/ok" element={<Boom explode={false} />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // the layout (the link) is still there, and navigating away clears the error
    await userEvent.click(screen.getByText("go to ok"));
    expect(screen.getByText("page is fine")).toBeInTheDocument();
  });
});

describe("ErrorBoundary automatic retry", () => {
  it("still ends on the recovery screen after its one silent retry when the page keeps crashing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong while loading this page"));
    // Exactly two ways out, and no technical details to copy.
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload the app/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy error details/i })).not.toBeInTheDocument();
  });
});
