import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  api,
  getToken,
  mediaUrl,
  setToken,
  setUnauthorizedHandler,
} from "@/lib/api";

const BASE = "http://localhost:8000";

/** Minimal stand-in for the parts of Response that `request` touches. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function emptyResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  setUnauthorizedHandler(null);
});

/** The (url, init) pair the client passed to fetch on its Nth call. */
function callArgs(index = 0): [string, RequestInit] {
  return fetchMock.mock.calls[index] as [string, RequestInit];
}

describe("token storage", () => {
  it("round-trips a token through localStorage", () => {
    expect(getToken()).toBeNull();
    setToken("abc.def.ghi");
    expect(getToken()).toBe("abc.def.ghi");
    expect(localStorage.getItem("plately.token")).toBe("abc.def.ghi");
  });

  it("clears the stored token when set to null", () => {
    setToken("abc.def.ghi");
    setToken(null);
    expect(getToken()).toBeNull();
    expect(localStorage.getItem("plately.token")).toBeNull();
  });
});

describe("mediaUrl", () => {
  it("prefixes a server-relative path with the API base", () => {
    expect(mediaUrl("/media/meals/7.jpg")).toBe(`${BASE}/media/meals/7.jpg`);
  });

  it("leaves an absolute URL alone", () => {
    expect(mediaUrl("https://cdn.example.com/a.jpg")).toBe(
      "https://cdn.example.com/a.jpg",
    );
  });
});

describe("request headers", () => {
  it("omits Authorization when there is no token", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));
    await api.me();

    const [url, init] = callArgs();
    expect(url).toBe(`${BASE}/auth/me`);
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });

  it("attaches the bearer token when one is stored", async () => {
    setToken("tok123");
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));
    await api.me();

    const headers = new Headers(callArgs()[1].headers);
    expect(headers.get("Authorization")).toBe("Bearer tok123");
  });

  it("sends JSON bodies as application/json", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: "t" }));
    await api.login("ada@example.com", "hunter22");

    const [url, init] = callArgs();
    expect(url).toBe(`${BASE}/auth/login`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      email: "ada@example.com",
      password: "hunter22",
    });
  });

  it("leaves Content-Type unset for FormData so the boundary survives", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ meal: {} }));
    const file = new File(["x"], "plate.jpg", { type: "image/jpeg" });
    await api.classify(file, { portionG: 250, mealTag: "lunch" });

    const [, init] = callArgs();
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);

    const form = init.body as FormData;
    expect(form.get("image")).toBe(file);
    expect(form.get("portion_g")).toBe("250");
    expect(form.get("meal_tag")).toBe("lunch");
  });
});

describe("query building", () => {
  it("omits the query string entirely when no filters are given", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    await api.meals();
    expect(callArgs()[0]).toBe(`${BASE}/meals`);
  });

  it("includes offset 0, which is falsy but meaningful", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    await api.meals({ limit: 20, offset: 0 });
    expect(callArgs()[0]).toBe(`${BASE}/meals?limit=20&offset=0`);
  });

  it("passes date filters through", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    await api.meals({ on: "2026-08-05" });
    expect(callArgs()[0]).toBe(`${BASE}/meals?on=2026-08-05`);
  });
});

describe("error handling", () => {
  it("reports an unreachable server as status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await api.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toMatch(/could not reach the server/i);
  });

  it("notifies the auth layer on 401 and reports an expired session", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Not authenticated" }, 401));

    const error = await api.me().catch((e: unknown) => e);
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).message).toMatch(/session has expired/i);
  });

  it("does not throw when no unauthorized handler is registered", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Not authenticated" }, 401));
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
  });

  it("surfaces FastAPI's string detail", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "Email already registered." }, 400),
    );

    const error = await api
      .signup("ada@example.com", "hunter22", "Ada")
      .catch((e: unknown) => e);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).message).toBe("Email already registered.");
  });

  it("joins the messages of a 422 validation array", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          detail: [
            { loc: ["body", "email"], msg: "value is not a valid email address" },
            { loc: ["body", "password"], msg: "String should have at least 8 characters" },
          ],
        },
        422,
      ),
    );

    const error = await api
      .signup("nope", "short", "Ada")
      .catch((e: unknown) => e);
    expect((error as ApiError).message).toBe(
      "value is not a valid email address. String should have at least 8 characters",
    );
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(emptyResponse(500));

    const error = await api.me().catch((e: unknown) => e);
    expect((error as ApiError).message).toBe("Request failed (500)");
    expect((error as ApiError).status).toBe(500);
  });

  it("falls back when detail is an array with no usable messages", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: [1, 2, 3] }, 422));

    const error = await api.me().catch((e: unknown) => e);
    expect((error as ApiError).message).toBe("Request failed (422)");
  });
});

describe("successful responses", () => {
  it("returns the parsed body", async () => {
    const user = { id: 1, email: "ada@example.com", name: "Ada" };
    fetchMock.mockResolvedValue(jsonResponse(user));
    await expect(api.me()).resolves.toEqual(user);
  });

  it("resolves without parsing the body on 204", async () => {
    const json = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, status: 204, json } as unknown as Response);

    await expect(api.deleteMeal(7)).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
    expect(callArgs()[0]).toBe(`${BASE}/meals/7`);
    expect(callArgs()[1].method).toBe("DELETE");
  });
});
