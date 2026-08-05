import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Profile from "@/pages/Profile";
import { AuthProvider } from "@/lib/auth";
import { api, getToken, setToken } from "@/lib/api";
import { makeMealPage, testUser } from "@/test/fixtures";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      me: vi.fn(),
      meals: vi.fn(),
      updateProfile: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <AuthProvider>
        <Routes>
          <Route path="/profile" element={<Profile />} />
          <Route path="/" element={<p>Welcome page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setToken("test-token");
  mockedApi.me.mockResolvedValue(testUser);
  mockedApi.meals.mockResolvedValue(makeMealPage([]));
});

/** Opens the goals editor and returns the calories input. */
async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /edit/i }));
  return screen.getAllByRole("spinbutton")[0];
}

describe("Profile", () => {
  it("shows the account details and the current targets", async () => {
    mockedApi.meals.mockResolvedValue({ items: [], total: 12, limit: 1, offset: 0 });

    renderProfile();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Member since August 1, 2026")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument(); // meals logged
    expect(screen.getByText("2,000 kcal")).toBeInTheDocument();
    expect(screen.getByText("120 g")).toBeInTheDocument();
  });

  it("asks for a single meal row, since only the total is used", async () => {
    renderProfile();
    await waitFor(() =>
      expect(mockedApi.meals).toHaveBeenCalledWith({ limit: 1 }),
    );
  });

  it("saves edited goals as numbers and shows the new values", async () => {
    const user = userEvent.setup();
    mockedApi.updateProfile.mockResolvedValue({
      ...testUser,
      daily_kcal_goal: 2400,
    });

    renderProfile();
    const kcal = await openEditor(user);
    await user.clear(kcal);
    await user.type(kcal, "2400");
    await user.click(screen.getByRole("button", { name: "Save goals" }));

    await waitFor(() =>
      expect(mockedApi.updateProfile).toHaveBeenCalledWith({
        daily_kcal_goal: 2400,
        daily_protein_goal_g: 120,
        daily_carbs_goal_g: 250,
        daily_fat_goal_g: 70,
      }),
    );
    expect(await screen.findByText("2,400 kcal")).toBeInTheDocument();
    // Editor closed again.
    expect(screen.queryByRole("button", { name: "Save goals" })).not.toBeInTheDocument();
  });

  it("keeps the editor open and explains a failed save", async () => {
    const user = userEvent.setup();
    mockedApi.updateProfile.mockRejectedValue(
      new Error("Daily calorie goal must be positive."),
    );

    renderProfile();
    const kcal = await openEditor(user);
    await user.clear(kcal);
    await user.type(kcal, "0");
    await user.click(screen.getByRole("button", { name: "Save goals" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Daily calorie goal must be positive.",
    );
    expect(screen.getByRole("button", { name: "Save goals" })).toBeEnabled();
  });

  it("discards an edit on cancel", async () => {
    const user = userEvent.setup();
    renderProfile();

    const kcal = await openEditor(user);
    await user.clear(kcal);
    await user.type(kcal, "3500");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockedApi.updateProfile).not.toHaveBeenCalled();
    expect(screen.getByText("2,000 kcal")).toBeInTheDocument();

    // Reopening shows the saved values, not the abandoned draft.
    await user.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(2000);
  });

  it("logs out and returns to the public landing page", async () => {
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole("button", { name: /log out/i }));

    await waitFor(() =>
      expect(screen.getByText("Welcome page")).toBeInTheDocument(),
    );
    expect(getToken()).toBeNull();
  });
});
