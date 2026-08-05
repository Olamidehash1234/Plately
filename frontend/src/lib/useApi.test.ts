import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useApi } from "@/lib/useApi";

describe("useApi", () => {
  it("starts loading, then exposes the resolved data", async () => {
    const fetcher = vi.fn().mockResolvedValue({ total: 3 });
    const { result } = renderHook(() => useApi(fetcher));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ total: 3 });
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("surfaces the error message from a rejected fetcher", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Could not reach the server."));
    const { result } = renderHook(() => useApi(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Could not reach the server.");
    expect(result.current.data).toBeNull();
  });

  it("falls back to a generic message for a non-Error rejection", async () => {
    const fetcher = vi.fn().mockRejectedValue("boom");
    const { result } = renderHook(() => useApi(fetcher));

    await waitFor(() => expect(result.current.error).toBe("Something went wrong."));
  });

  it("re-runs the fetcher on reload and clears a previous error", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce({ total: 1 });

    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.error).toBe("Temporary failure"));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.data).toEqual({ total: 1 }));
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("ignores a response that lands after unmount", async () => {
    let resolve: (value: unknown) => void = () => {};
    const fetcher = vi.fn(() => new Promise((r) => { resolve = r; }));

    const { unmount } = renderHook(() => useApi(fetcher));
    unmount();

    // Resolving now must not touch state — React would warn if it did.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      resolve({ total: 9 });
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
