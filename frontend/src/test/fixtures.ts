import type { DailySummary, Meal, MealPage, User } from "@/lib/api";

export const testUser: User = {
  id: 1,
  email: "ada@example.com",
  name: "Ada Lovelace",
  daily_kcal_goal: 2000,
  daily_protein_goal_g: 120,
  daily_carbs_goal_g: 250,
  daily_fat_goal_g: 70,
  created_at: "2026-08-01T09:00:00Z",
};

export function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 1,
    image_url: "/media/meals/1.jpg",
    predicted_class: "jollof_rice",
    corrected_class: null,
    food_class: "jollof_rice",
    label: "Jollof Rice",
    confidence: 0.92,
    portion_g: 250,
    kcal: 430,
    protein_g: 9,
    carbs_g: 68,
    fat_g: 13,
    meal_tag: "lunch",
    eaten_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeMealPage(items: Meal[]): MealPage {
  return { items, total: items.length, limit: 20, offset: 0 };
}

export const testSummary: DailySummary = {
  date: "2026-08-05",
  consumed: { kcal: 1000, protein_g: 60, carbs_g: 125, fat_g: 35 },
  goals: { kcal: 2000, protein_g: 120, carbs_g: 250, fat_g: 70 },
  meal_count: 2,
};
