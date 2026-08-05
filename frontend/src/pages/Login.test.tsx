import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "@/pages/Login";
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

/** Renders the login page with the routes it can navigate to. */
function renderLogin(state?: { from?: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state }]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/home" element={<p>Home page</p>} />
          <Route path="/profile" element={<p>Profile page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), "hunter22");
  await user.click(screen.getByRole("button", { name: /log in/i }));
}

describe("Login", () => {
  it("signs in and lands on the home page", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "fresh", token_type: "bearer", user: testUser }),
    );

    renderLogin();
    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText("Home page")).toBeInTheDocument());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/auth/login");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "ada@example.com",
      password: "hunter22",
    });
    expect(getToken()).toBe("fresh");
  });

  it("returns the user to the page that bounced them", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "fresh", token_type: "bearer", user: testUser }),
    );

    renderLogin({ from: "/profile" });
    await fillAndSubmit(user);

    await waitFor(() =>
      expect(screen.getByText("Profile page")).toBeInTheDocument(),
    );
  });

  it("trims stray whitespace from the email", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "fresh", token_type: "bearer", user: testUser }),
    );

    renderLogin();
    await user.type(screen.getByLabelText("Email"), "  ada@example.com  ");
    await user.type(screen.getByLabelText("Password"), "hunter22");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).email).toBe("ada@example.com");
  });

  it("shows the server's rejection and stays on the form", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "Incorrect email or password." }, 400),
    );

    renderLogin();
    await fillAndSubmit(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Incorrect email or password.");
    expect(screen.queryByText("Home page")).not.toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  it("explains an unreachable API rather than failing silently", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    renderLogin();
    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not reach the server/i,
    );
  });

  it("re-enables the submit button after a failure", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Nope." }, 400));

    renderLogin();
    await fillAndSubmit(user);

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /log in/i })).toBeEnabled();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    renderLogin();

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");

    await user.click(
      screen.getByRole("button", { name: /toggle password visibility/i }),
    );
    expect(password).toHaveAttribute("type", "text");
  });

  it("offers no dead password-reset link", () => {
    renderLogin();
    expect(screen.queryByText(/forgot password/i)).not.toBeInTheDocument();
  });
});
