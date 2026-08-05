/**
 * Typed client for the Plately API.
 *
 * Every call goes through `request`, which attaches the bearer token, unwraps
 * FastAPI's error shape into a real Error, and reports a 401 so the auth layer
 * can log the user out rather than leaving the UI in a half-signed-in state.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "plately.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Absolute URL for a media path returned by the API. */
export function mediaUrl(path: string): string {
  return path.startsWith("http") ? path : `${BASE_URL}${path}`;
}

export class ApiError extends Error {
  // Declared explicitly rather than as a constructor parameter property,
  // which tsconfig's erasableSyntaxOnly disallows.
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Notified on any 401 so the auth context can clear its state. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** FastAPI returns `detail` as a string, or an array for validation errors. */
function extractDetail(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return fallback;
  const detail = (body as { detail?: unknown }).detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        typeof item === "object" && item !== null && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : null,
      )
      .filter(Boolean);
    if (messages.length) return messages.join(". ");
  }

  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);

  if (token) headers.set("Authorization", `Bearer ${token}`);
  // Let the browser set the multipart boundary for FormData bodies.
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      "Could not reach the server. Check that the API is running.",
      0,
    );
  }

  if (response.status === 401) {
    onUnauthorized?.();
    throw new ApiError("Your session has expired. Please log in again.", 401);
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Non-JSON error body; fall through to the generic message.
    }
    throw new ApiError(
      extractDetail(body, `Request failed (${response.status})`),
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// --- Types ------------------------------------------------------------------
export interface User {
  id: number;
  email: string;
  name: string;
  daily_kcal_goal: number;
  daily_protein_goal_g: number;
  daily_carbs_goal_g: number;
  daily_fat_goal_g: number;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Meal {
  id: number;
  image_url: string;
  predicted_class: string;
  corrected_class: string | null;
  food_class: string;
  label: string;
  confidence: number;
  portion_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_tag: string;
  eaten_at: string;
}

export interface Prediction {
  key: string;
  label: string;
  confidence: number;
}

export interface ClassifyResponse {
  meal: Meal;
  alternatives: Prediction[];
  low_confidence: boolean;
}

export interface MealPage {
  items: Meal[];
  total: number;
  limit: number;
  offset: number;
}

export interface Totals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface DailySummary {
  date: string;
  consumed: Totals;
  goals: Totals;
  meal_count: number;
}

export interface FoodClass {
  key: string;
  label: string;
  cuisine: string;
  per_100g: Totals;
  default_portion_g: number;
  source: string;
}

export interface ClassifyStatus {
  ready: boolean;
  reason: string | null;
}

// --- Endpoints --------------------------------------------------------------
export const api = {
  signup: (email: string, password: string, name: string) =>
    request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<User>("/auth/me"),

  updateProfile: (changes: Partial<Omit<User, "id" | "email" | "created_at">>) =>
    request<User>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),

  classifyStatus: () => request<ClassifyStatus>("/classify/status"),

  foodClasses: () => request<FoodClass[]>("/food-classes"),

  classify: (file: File, options: { portionG?: number; mealTag?: string } = {}) => {
    const form = new FormData();
    form.append("image", file);
    if (options.portionG) form.append("portion_g", String(options.portionG));
    if (options.mealTag) form.append("meal_tag", options.mealTag);
    return request<ClassifyResponse>("/classify", { method: "POST", body: form });
  },

  meals: (params: { limit?: number; offset?: number; on?: string; since?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.offset != null) query.set("offset", String(params.offset));
    if (params.on) query.set("on", params.on);
    if (params.since) query.set("since", params.since);
    const suffix = query.toString() ? `?${query}` : "";
    return request<MealPage>(`/meals${suffix}`);
  },

  meal: (id: number) => request<Meal>(`/meals/${id}`),

  updateMeal: (
    id: number,
    changes: {
      corrected_class?: string | null;
      portion_g?: number;
      meal_tag?: string;
      eaten_at?: string;
    },
  ) =>
    request<Meal>(`/meals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),

  deleteMeal: (id: number) =>
    request<void>(`/meals/${id}`, { method: "DELETE" }),

  dailySummary: (on?: string) =>
    request<DailySummary>(`/summary/daily${on ? `?on=${on}` : ""}`),
};
