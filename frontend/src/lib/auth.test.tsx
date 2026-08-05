import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/lib/auth";
import { api, getToken, setToken } from "@/lib/api";

const USER = {
  id: 1,
  email: "ada@example.com",
  name: "Ada Lovelace",
  daily_kcal_goal: 2000,
  daily_protein_goal_g: 120,
  daily_carbs_goal_g: 250,
  daily_fat_goal_g: 70,
  created_at: "2026-08-01T09:00:00Z",
};

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

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

describe("session restore", () => {
  it("settles immediately as signed out when no token is stored", async () => {
    const { result } = renderAuth();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates a stored token against the server", async () => {
    setToken("stored-token");
    fetchMock.mockResolvedValue(jsonResponse(USER));

    const { result } = renderAuth();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.user).toEqual(USER));
    expect(result.current.loading).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/auth/me");
  });

  it("discards a token the server rejects", async () => {
    setToken("stale-token");
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Not authenticated" }, 401));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(getToken()).toBeNull();
  });

  it("stops loading even when the server is unreachable", async () => {
    setToken("stored-token");
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });
});

describe("login and signup", () => {
  it("stores the token and the user on login", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "fresh", token_type: "bearer", user: USER }),
    );

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login("ada@example.com", "hunter22");
    });

    expect(getToken()).toBe("fresh");
    expect(result.current.user).toEqual(USER);
  });

  it("stores the token and the user on signup", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "new", token_type: "bearer", user: USER }),
    );

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signup("ada@example.com", "hunter22", "Ada Lovelace");
    });

    expect(getToken()).toBe("new");
    expect(result.current.user).toEqual(USER);
  });

  it("propagates a failed login and leaves the session empty", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "Incorrect email or password." }, 401),
    );

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(
        result.current.login("ada@example.com", "wrong"),
      ).rejects.toThrow();
    });

    expect(getToken()).toBeNull();
    expect(result.current.user).toBeNull();
  });
});

describe("logout", () => {
  it("clears both the token and the user", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "fresh", token_type: "bearer", user: USER }),
    );

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.login("ada@example.com", "hunter22");
    });

    act(() => result.current.logout());

    expect(getToken()).toBeNull();
    expect(result.current.user).toBeNull();
  });
});

describe("expired sessions", () => {
  it("signs the user out when any later request returns 401", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "fresh", token_type: "bearer", user: USER }),
    );

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.login("ada@example.com", "hunter22");
    });
    expect(result.current.user).toEqual(USER);

    // The token expires while the app is open: the next call comes back 401.
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Not authenticated" }, 401));
    await act(async () => {
      await expect(api.meals()).rejects.toThrow();
    });

    expect(result.current.user).toBeNull();
    expect(getToken()).toBeNull();
  });

  it("unregisters its handler when the provider unmounts", async () => {
    fetchMock.mockResolvedValue(jsonResponse(USER));
    const { unmount } = renderAuth();
    unmount();

    fetchMock.mockResolvedValue(jsonResponse({ detail: "Not authenticated" }, 401));
    // No state to update any more; this must not warn or throw on its own.
    await expect(api.meals()).rejects.toThrow(/session has expired/i);
  });
});

describe("useAuth", () => {
  it("refuses to run outside an AuthProvider", () => {
    // React logs the thrown render error; silence it for this one case.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      /must be used inside an AuthProvider/,
    );
    consoleError.mockRestore();
  });
});
