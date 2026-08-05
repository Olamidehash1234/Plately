import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthProvider } from "@/lib/auth";
import { setToken } from "@/lib/api";
import { testUser } from "@/test/fixtures";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <p>Meal history</p>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Stands in for the login page and reports the state it was handed. */
function LoginProbe() {
  return <p>Log in screen</p>;
}

describe("ProtectedRoute", () => {
  it("shows a loading state instead of redirecting while the token is checked", () => {
    setToken("stored-token");
    fetchMock.mockReturnValue(new Promise(() => {})); // never settles

    renderAt("/history");

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("Log in screen")).not.toBeInTheDocument();
  });

  it("redirects to login when there is no session", async () => {
    renderAt("/history");

    await waitFor(() =>
      expect(screen.getByText("Log in screen")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Meal history")).not.toBeInTheDocument();
  });

  it("renders the page once the stored token checks out", async () => {
    setToken("stored-token");
    fetchMock.mockResolvedValue(jsonResponse(testUser));

    renderAt("/history");

    await waitFor(() =>
      expect(screen.getByText("Meal history")).toBeInTheDocument(),
    );
  });

  it("redirects when the stored token is rejected", async () => {
    setToken("stale-token");
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Not authenticated" }, 401));

    renderAt("/history");

    await waitFor(() =>
      expect(screen.getByText("Log in screen")).toBeInTheDocument(),
    );
  });
});
