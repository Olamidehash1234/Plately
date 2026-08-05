import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/pages/Home";
import { AuthProvider } from "@/lib/auth";
import { api, setToken } from "@/lib/api";
import { makeMeal, makeMealPage, testSummary, testUser } from "@/test/fixtures";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      me: vi.fn(),
      meals: vi.fn(),
      dailySummary: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <AuthProvider>
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/classify" element={<p>Capture page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setToken("test-token");
  mockedApi.me.mockResolvedValue(testUser);
  mockedApi.dailySummary.mockResolvedValue(testSummary);
  mockedApi.meals.mockResolvedValue(makeMealPage([]));
});

describe("Home", () => {
  it("greets the signed-in user by first name", async () => {
    renderHome();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        ", Ada.",
      ),
    );
  });

  it("shows today's calorie total against the goal", async () => {
    renderHome();

    await waitFor(() => expect(screen.getByText("1,000")).toBeInTheDocument());
    expect(screen.getByText("/ 2,000 kcal")).toBeInTheDocument();
    expect(screen.getByText(/consumed 50% of your daily goal/i)).toBeInTheDocument();
  });

  it("breaks the day down by macronutrient", async () => {
    renderHome();

    await waitFor(() => expect(screen.getByText("Protein")).toBeInTheDocument());
    expect(screen.getByText("60g / 120g")).toBeInTheDocument();
    expect(screen.getByText("125g / 250g")).toBeInTheDocument();
    expect(screen.getByText("35g / 70g")).toBeInTheDocument();
  });

  it("asks only for today's meals", async () => {
    renderHome();

    await waitFor(() => expect(mockedApi.meals).toHaveBeenCalled());
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(mockedApi.meals).toHaveBeenCalledWith({ on: expected, limit: 20 });
  });

  it("lists the meals logged today", async () => {
    mockedApi.meals.mockResolvedValue(
      makeMealPage([
        makeMeal({ id: 1, label: "Jollof Rice", kcal: 430, protein_g: 9 }),
        makeMeal({
          id: 2,
          label: "Egusi Soup",
          meal_tag: "dinner",
          kcal: 520,
          protein_g: 24,
        }),
      ]),
    );

    renderHome();

    await waitFor(() => expect(screen.getByText("Jollof Rice")).toBeInTheDocument());
    expect(screen.getByText("Egusi Soup")).toBeInTheDocument();
    expect(screen.getByText("430 kcal")).toBeInTheDocument();
    expect(screen.getByText("9g Protein")).toBeInTheDocument();
    expect(screen.getByAltText("Jollof Rice")).toHaveAttribute(
      "src",
      "http://localhost:8000/media/meals/1.jpg",
    );
  });

  it("prompts a first capture when nothing is logged", async () => {
    renderHome();

    await waitFor(() =>
      expect(screen.getByText("No meals logged yet")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Log another meal")).not.toBeInTheDocument();
  });

  it("switches the prompt once a meal exists", async () => {
    mockedApi.meals.mockResolvedValue(makeMealPage([makeMeal()]));

    renderHome();

    await waitFor(() =>
      expect(screen.getByText("Log another meal")).toBeInTheDocument(),
    );
  });

  it("quantifies the protein gap in its recommendation", async () => {
    renderHome();

    await waitFor(() =>
      expect(screen.getByText("Smart Recommendation")).toBeInTheDocument(),
    );
    expect(screen.getByText("60g")).toBeInTheDocument();
  });

  it("drops the recommendation once the protein target is met", async () => {
    mockedApi.dailySummary.mockResolvedValue({
      ...testSummary,
      consumed: { ...testSummary.consumed, protein_g: 130 },
    });

    renderHome();

    await waitFor(() => expect(screen.getByText("1,000")).toBeInTheDocument());
    expect(screen.queryByText("Smart Recommendation")).not.toBeInTheDocument();
  });

  it("reports a failed load instead of showing zeroes as fact", async () => {
    mockedApi.dailySummary.mockRejectedValue(
      new Error("Could not reach the server."),
    );

    renderHome();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server.",
    );
  });
});
