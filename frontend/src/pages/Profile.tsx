import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/AppShell";
import { api, type MealPage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";

const GOAL_FIELDS = [
  { key: "daily_kcal_goal", label: "Daily calories", unit: "kcal" },
  { key: "daily_protein_goal_g", label: "Protein", unit: "g" },
  { key: "daily_carbs_goal_g", label: "Carbs", unit: "g" },
  { key: "daily_fat_goal_g", label: "Fat", unit: "g" },
] as const;

type GoalKey = (typeof GOAL_FIELDS)[number]["key"];

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<GoalKey, string>>({
    daily_kcal_goal: "",
    daily_protein_goal_g: "",
    daily_carbs_goal_g: "",
    daily_fat_goal_g: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fill the draft from the saved goals. Run on load and whenever the user
  // changes, and again on cancel, so an abandoned edit never reappears.
  const seedDraft = useCallback(() => {
    if (!user) return;
    setDraft({
      daily_kcal_goal: String(user.daily_kcal_goal),
      daily_protein_goal_g: String(user.daily_protein_goal_g),
      daily_carbs_goal_g: String(user.daily_carbs_goal_g),
      daily_fat_goal_g: String(user.daily_fat_goal_g),
    });
  }, [user]);

  useEffect(seedDraft, [seedDraft]);

  // Only the total is needed here, so ask for a single row rather than the lot.
  const fetchMeals = useCallback(() => api.meals({ limit: 1 }), []);
  const { data: meals } = useApi<MealPage>(fetchMeals);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const changes = Object.fromEntries(
        GOAL_FIELDS.map((field) => [field.key, Number(draft[field.key])]),
      );
      setUser(await api.updateProfile(changes));
      setEditing(false);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save your goals.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-container-padding-mobile md:px-container-padding-desktop py-stack-lg pb-28">
        <section className="bg-surface-container-lowest rounded-[20px] editorial-shadow border border-line p-8 md:p-10 flex flex-col items-center text-center">
          <Avatar className="w-24 h-24">
            <AvatarFallback className="text-headline-md">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <h1 className="font-headline-lg text-headline-lg text-on-background mt-6">
            {user.name}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            {user.email}
          </p>
          <p className="font-label-sm text-label-sm text-outline mt-1">
            Member since {formatDate(user.created_at)}
          </p>

          <div className="grid grid-cols-2 gap-4 w-full mt-8 pt-8 border-t border-line">
            <div>
              <span className="block font-headline-md text-headline-md text-primary">
                {meals?.total ?? "—"}
              </span>
              <span className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mt-1">
                Meals Logged
              </span>
            </div>
            <div>
              <span className="block font-headline-md text-headline-md text-primary">
                {user.daily_kcal_goal.toLocaleString()}
              </span>
              <span className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mt-1">
                Daily Target
              </span>
            </div>
          </div>
        </section>

        {/* Nutrition goals */}
        <section className="mt-8 bg-surface-container-lowest rounded-[20px] border border-line p-6 md:p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-headline-md text-headline-md text-on-background">
              Nutrition goals
            </h2>
            {!editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Icon name="tune" className="text-[18px]" />
                Edit
              </Button>
            )}
          </div>

          {saveError && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 p-4 rounded-[14px] bg-error-container text-on-error-container"
            >
              <Icon name="error" className="text-[20px] shrink-0" />
              <span className="font-body-md text-body-md">{saveError}</span>
            </div>
          )}

          <div className="space-y-4">
            {GOAL_FIELDS.map((field) => (
              <div
                key={field.key}
                className="flex items-center justify-between gap-4 py-3 border-b border-line last:border-0"
              >
                <span className="font-label-md text-label-md text-on-surface">
                  {field.label}
                </span>
                {editing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={draft[field.key]}
                      onChange={(e) =>
                        setDraft((current) => ({
                          ...current,
                          [field.key]: e.target.value,
                        }))
                      }
                      className="w-28 px-3 py-2 border border-line rounded-[10px] font-body-md text-body-md text-right outline-none focus:border-primary"
                    />
                    <span className="font-body-md text-on-surface-variant w-8">
                      {field.unit}
                    </span>
                  </div>
                ) : (
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    {user[field.key].toLocaleString()} {field.unit}
                  </span>
                )}
              </div>
            ))}
          </div>

          {editing && (
            <div className="flex gap-3 mt-8">
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving ? "Saving…" : "Save goals"}
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setEditing(false);
                  setSaveError(null);
                  seedDraft();
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </section>

        <Button
          variant="outline"
          size="block"
          className="mt-8"
          onClick={() => {
            logout();
            navigate("/", { replace: true });
          }}
        >
          <Icon name="logout" className="text-[18px]" />
          Log out
        </Button>
      </div>
    </AppShell>
  );
}
