import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// `waitFor` and the `find*` queries give up after one second by default. Vitest
// runs the fourteen test files in parallel, so a machine under that much load
// can take longer than a second to flush a couple of resolved promises through
// React — which failed a passing test roughly one run in ten. Five seconds is
// still short enough that a genuinely broken assertion fails quickly.
configure({ asyncUtilTimeout: 5000 });


afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  if (!("matchMedia" in window)) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
  if (!("scrollTo" in window)) {
    Object.defineProperty(window, "scrollTo", { writable: true, value: () => {} });
  }
});
