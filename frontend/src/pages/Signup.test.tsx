import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Signup from "@/pages/Signup";
import { AuthProvider } from "@/lib/auth";
import { getToken } from "@/lib/api";
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

function renderSignup() {
  return render(
    <MemoryRouter initialEntries={["/signup"]}>
      <AuthProvider>
        <Routes>
          <Route path="/signup" element={<Signup />} />
          <Route path="/home" element={<p>Home page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
  name = "Ada Lovelace",
) {
  await user.type(screen.getByLabelText("Full Name"), name);
  await user.type(screen.getByLabelText("Email Address"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: /create account/i }));
}

describe("Signup", () => {
  it("creates the account and lands on the home page", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "new", token_type: "bearer", user: testUser }),
    );

    renderSignup();
    await fill(user, "hunter22");

    await waitFor(() => expect(screen.getByText("Home page")).toBeInTheDocument());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/auth/signup");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "ada@example.com",
      password: "hunter22",
      name: "Ada Lovelace",
    });
    expect(getToken()).toBe("new");
  });

  it("rejects a short password without a round trip", async () => {
    const user = userEvent.setup();
    renderSignup();

    await fill(user, "short");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must be at least 8 characters.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's message when the email is taken", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "Email already registered." }, 400),
    );

    renderSignup();
    await fill(user, "hunter22");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email already registered.",
    );
    expect(getToken()).toBeNull();
  });

  it("shows joined validation messages from a 422", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { detail: [{ msg: "value is not a valid email address" }] },
        422,
      ),
    );

    renderSignup();
    await fill(user, "hunter22");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "value is not a valid email address",
    );
  });

  it("trims the name and email before sending them", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "new", token_type: "bearer", user: testUser }),
    );

    renderSignup();
    await fill(user, "hunter22", "  Ada Lovelace  ");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).name).toBe("Ada Lovelace");
  });

  it("states how the data is handled instead of linking to unwritten policies", () => {
    renderSignup();

    expect(
      screen.getByText(/are stored on this system and are not shared/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/terms of service/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/privacy policy/i)).not.toBeInTheDocument();
  });
});
