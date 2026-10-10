import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

// Error reporting talks to the network; tests never should.
vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: 202 }))));
