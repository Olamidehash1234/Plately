import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MealHistory from "@/pages/MealHistory";
import { AuthProvider } from "@/lib/auth";
import { api, setToken } from "@/lib/api";
import { makeMeal, testUser } from "@/test/fixtures";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      me: vi.fn(),
      meals: vi.fn(),
      deleteMeal: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

/** A local-time ISO timestamp `daysAgo` days back, so day grouping is stable. */
function daysAgo(days: number, hour = 12): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function renderHistory() {
  return render(
    <MemoryRouter initialEntries={["/history"]}>
      <AuthProvider>
        <Routes>
          <Route path="/history" element={<MealHistory />} />
          <Route path="/classify" element={<p>Capture page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setToken("test-token");
  mockedApi.me.mockResolvedValue(testUser);
  mockedApi.deleteMeal.mockResolvedValue(undefined);
});

describe("MealHistory", () => {
  it("invites a first capture when the journal is empty", async () => {
    mockedApi.meals.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    renderHistory();

    await waitFor(() =>
      expect(screen.getByText("Nothing logged yet")).toBeInTheDocument(),
    );
    expect(screen.getByText("0 meals logged.")).toBeInTheDocument();
  });

  it("counts a single meal in the singular", async () => {
    mockedApi.meals.mockResolvedValue({
      items: [makeMeal({ eaten_at: daysAgo(0) })],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderHistory();

    await waitFor(() =>
      expect(screen.getByText("1 meal logged.")).toBeInTheDocument(),
    );
  });

  it("groups meals by day and totals each day's calories", async () => {
    mockedApi.meals.mockResolvedValue({
      items: [
        makeMeal({ id: 1, label: "Jollof Rice", kcal: 430, eaten_at: daysAgo(0, 13) }),
        makeMeal({ id: 2, label: "Moi Moi", kcal: 220, eaten_at: daysAgo(0, 8) }),
        makeMeal({ id: 3, label: "Egusi Soup", kcal: 520, eaten_at: daysAgo(1, 19) }),
        makeMeal({ id: 4, label: "Amala", kcal: 310, eaten_at: daysAgo(1, 8) }),
      ],
      total: 4,
      limit: 20,
      offset: 0,
    });

    renderHistory();

    await waitFor(() => expect(screen.getByText("Today")).toBeInTheDocument());
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("650 kcal")).toBeInTheDocument(); // 430 + 220
    expect(screen.getByText("830 kcal")).toBeInTheDocument(); // 520 + 310
  });

  it("shows each meal's macros and portion", async () => {
    mockedApi.meals.mockResolvedValue({
      items: [
        makeMeal({
          label: "Jollof Rice",
          kcal: 430,
          protein_g: 9,
          carbs_g: 68,
          fat_g: 13,
          portion_g: 250,
          eaten_at: daysAgo(0),
        }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderHistory();

    const card = (await screen.findByText("Jollof Rice")).closest("section");
    expect(within(card as HTMLElement).getByText("9g protein")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("68g carbs")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("13g fat")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("250g portion")).toBeInTheDocument();
  });

  it("marks a meal whose class the user corrected", async () => {
    mockedApi.meals.mockResolvedValue({
      items: [
        makeMeal({
          label: "Pounded Yam",
          predicted_class: "amala",
          corrected_class: "pounded_yam",
          eaten_at: daysAgo(0),
        }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderHistory();

    expect(await screen.findByText(/corrected from amala/i)).toBeInTheDocument();
  });

  it("deletes a meal and refreshes the list", async () => {
    const user = userEvent.setup();
    mockedApi.meals
      .mockResolvedValueOnce({
        items: [makeMeal({ id: 7, label: "Jollof Rice", eaten_at: daysAgo(0) })],
        total: 1,
        limit: 20,
        offset: 0,
      })
      .mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    renderHistory();

    await user.click(await screen.findByRole("button", { name: "Delete Jollof Rice" }));

    expect(mockedApi.deleteMeal).toHaveBeenCalledWith(7);
    await waitFor(() =>
      expect(screen.getByText("Nothing logged yet")).toBeInTheDocument(),
    );
  });

  it("reports a failed delete and still refreshes the list", async () => {
    const user = userEvent.setup();
    mockedApi.deleteMeal.mockRejectedValue(new Error("Meal not found"));
    mockedApi.meals.mockResolvedValue({
      items: [makeMeal({ id: 7, label: "Jollof Rice", eaten_at: daysAgo(0) })],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderHistory();
    await user.click(await screen.findByRole("button", { name: "Delete Jollof Rice" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Meal not found");
    // Reloaded anyway: on the server the row may already be gone.
    await waitFor(() => expect(mockedApi.meals).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Jollof Rice")).toBeInTheDocument();
  });

  it("asks for another page when Load more is clicked", async () => {
    const user = userEvent.setup();
    mockedApi.meals.mockResolvedValue({
      items: [makeMeal({ eaten_at: daysAgo(0) })],
      total: 25,
      limit: 20,
      offset: 0,
    });

    renderHistory();

    await user.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(mockedApi.meals).toHaveBeenLastCalledWith({ limit: 40 }),
    );
  });

  it("hides Load more once everything is shown", async () => {
    mockedApi.meals.mockResolvedValue({
      items: [makeMeal({ eaten_at: daysAgo(0) })],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderHistory();

    await waitFor(() =>
      expect(screen.getByText("1 meal logged.")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("reports a failed load", async () => {
    mockedApi.meals.mockRejectedValue(new Error("Could not reach the server."));

    renderHistory();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server.",
    );
  });
});
