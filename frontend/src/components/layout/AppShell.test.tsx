import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/lib/auth";
import { api, getToken, setToken } from "@/lib/api";
import { testUser } from "@/test/fixtures";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, me: vi.fn() } };
});

const mockedApi = vi.mocked(api);

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/home"
            element={
              <AppShell>
                <p>Page body</p>
              </AppShell>
            }
          />
          <Route path="/" element={<p>Welcome page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setToken("test-token");
  mockedApi.me.mockResolvedValue(testUser);
});

describe("AppShell", () => {
  it("links to every section of the app", async () => {
    renderShell();
    await screen.findAllByText("Home");

    for (const label of ["Home", "History", "Capture", "Profile"]) {
      const links = screen.getAllByRole("link", { name: new RegExp(label, "i") });
      expect(links.length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Page body")).toBeInTheDocument();
  });

  it("shows the user's initials in the avatar", async () => {
    renderShell();
    expect((await screen.findAllByText("AL")).length).toBeGreaterThan(0);
  });

  it("carries no notifications control, since nothing produces notifications", async () => {
    renderShell();
    await screen.findAllByText("Home");

    expect(
      screen.queryByRole("button", { name: /notification/i }),
    ).not.toBeInTheDocument();
  });

  it("logs out from the mobile menu and returns to the landing page", async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findAllByText("Home");

    await user.click(screen.getByRole("button", { name: /toggle menu/i }));
    await user.click(screen.getByRole("button", { name: /log out/i }));

    expect(screen.getByText("Welcome page")).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  it("closes the mobile menu when the route changes", async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findAllByText("Home");

    const toggle = screen.getByRole("button", { name: /toggle menu/i });
    await user.click(toggle);
    expect(screen.getByText("View profile")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);
    expect(screen.queryByText("View profile")).not.toBeInTheDocument();
  });
});
