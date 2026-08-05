import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MealResult from "@/pages/MealResult";
import { AuthProvider } from "@/lib/auth";
import { api, setToken, type Prediction } from "@/lib/api";
import { makeMeal, testUser } from "@/test/fixtures";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      me: vi.fn(),
      meal: vi.fn(),
      updateMeal: vi.fn(),
      foodClasses: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

const ALTERNATIVES: Prediction[] = [
  { key: "fried_rice", label: "Fried Rice", confidence: 0.21 },
  { key: "jollof_rice", label: "Jollof Rice", confidence: 0.62 },
];

function renderResult(state?: {
  alternatives?: Prediction[];
  lowConfidence?: boolean;
}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/meal-result/1", state }]}>
      <AuthProvider>
        <Routes>
          <Route path="/meal-result/:mealId" element={<MealResult />} />
          <Route path="/home" element={<p>Home page</p>} />
          <Route path="/history" element={<p>History page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setToken("test-token");
  mockedApi.me.mockResolvedValue(testUser);
  mockedApi.foodClasses.mockResolvedValue([
    {
      key: "moi_moi",
      label: "Moi Moi",
      cuisine: "Nigerian",
      per_100g: { kcal: 130, protein_g: 8, carbs_g: 12, fat_g: 6 },
      default_portion_g: 200,
      source: "reference table",
    },
  ]);
  mockedApi.meal.mockResolvedValue(
    makeMeal({
      id: 1,
      label: "Jollof Rice",
      confidence: 0.92,
      kcal: 430,
      protein_g: 9,
      carbs_g: 68,
      fat_g: 13,
      portion_g: 250,
    }),
  );
});

describe("MealResult", () => {
  it("shows the prediction, its confidence and the calories", async () => {
    renderResult();

    expect(await screen.findByRole("heading", { name: "Jollof Rice" })).toBeInTheDocument();
    expect(screen.getByText("92% Match")).toBeInTheDocument();
    expect(screen.getByText("430")).toBeInTheDocument();
    expect(screen.getByText("250g")).toBeInTheDocument();
  });

  it("splits the macros by calorie contribution, not by weight", async () => {
    renderResult();

    // 9g protein = 36 kcal, 68g carbs = 272 kcal, 13g fat = 117 kcal of 425.
    expect(await screen.findByText("9g · 8% of calories")).toBeInTheDocument();
    expect(screen.getByText("68g · 64% of calories")).toBeInTheDocument();
    expect(screen.getByText("13g · 28% of calories")).toBeInTheDocument();
  });

  it("flags a low-confidence prediction when Classify says so", async () => {
    renderResult({ lowConfidence: true, alternatives: ALTERNATIVES });

    expect(
      await screen.findByText("Not fully confident about this one"),
    ).toBeInTheDocument();
    expect(screen.getByText(/only 92% sure/i)).toBeInTheDocument();
  });

  it("says nothing about confidence when arriving from history", async () => {
    renderResult();

    await screen.findByRole("heading", { name: "Jollof Rice" });
    expect(
      screen.queryByText("Not fully confident about this one"),
    ).not.toBeInTheDocument();
  });

  it("saves an adjusted portion and shows the recalculated meal", async () => {
    const user = userEvent.setup();
    mockedApi.updateMeal.mockResolvedValue(
      makeMeal({ id: 1, label: "Jollof Rice", portion_g: 400, kcal: 688 }),
    );

    renderResult();
    await user.click(await screen.findByRole("button", { name: "Adjust" }));

    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "400");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockedApi.updateMeal).toHaveBeenCalledWith(1, { portion_g: 400 }),
    );
    expect(await screen.findByText("688")).toBeInTheDocument();
    expect(screen.getByText("400g")).toBeInTheDocument();
  });

  it("refuses a portion of zero without calling the API", async () => {
    const user = userEvent.setup();
    renderResult();

    await user.click(await screen.findByRole("button", { name: "Adjust" }));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a portion size in grams.",
    );
    expect(mockedApi.updateMeal).not.toHaveBeenCalled();
  });

  it("offers the runner-up predictions as one-tap corrections", async () => {
    const user = userEvent.setup();
    mockedApi.updateMeal.mockResolvedValue(
      makeMeal({
        id: 1,
        label: "Fried Rice",
        predicted_class: "jollof_rice",
        corrected_class: "fried_rice",
        food_class: "fried_rice",
      }),
    );

    renderResult({ alternatives: ALTERNATIVES });
    await user.click(await screen.findByRole("button", { name: /correct it/i }));

    // The current class is filtered out of the alternatives.
    expect(
      screen.queryByRole("button", { name: /^Jollof Rice/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Fried Rice\s*21%/ }));

    await waitFor(() =>
      expect(mockedApi.updateMeal).toHaveBeenCalledWith(1, {
        corrected_class: "fried_rice",
      }),
    );
    expect(await screen.findByText("Corrected")).toBeInTheDocument();
    expect(
      screen.getByText(/originally predicted jollof rice/i),
    ).toBeInTheDocument();
  });

  it("corrects to any food from the full list", async () => {
    const user = userEvent.setup();
    mockedApi.updateMeal.mockResolvedValue(
      makeMeal({
        id: 1,
        label: "Moi Moi",
        corrected_class: "moi_moi",
        food_class: "moi_moi",
      }),
    );

    renderResult();
    await user.click(await screen.findByRole("button", { name: /correct it/i }));
    await user.selectOptions(screen.getByRole("combobox"), "moi_moi");

    await waitFor(() =>
      expect(mockedApi.updateMeal).toHaveBeenCalledWith(1, {
        corrected_class: "moi_moi",
      }),
    );
    expect(await screen.findByRole("heading", { name: "Moi Moi" })).toBeInTheDocument();
  });

  it("reports a correction that fails to save", async () => {
    const user = userEvent.setup();
    mockedApi.updateMeal.mockRejectedValue(new Error("Unknown food class."));

    renderResult({ alternatives: ALTERNATIVES });
    await user.click(await screen.findByRole("button", { name: /correct it/i }));
    await user.click(screen.getByRole("button", { name: /Fried Rice\s*21%/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unknown food class.",
    );
  });

  it("offers a way back when the meal is gone", async () => {
    const user = userEvent.setup();
    mockedApi.meal.mockRejectedValue(new Error("Meal not found"));

    renderResult();

    expect(
      await screen.findByRole("heading", { name: "Meal not found" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to history" }));
    expect(screen.getByText("History page")).toBeInTheDocument();
  });
});
