import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/AppShell";
import { api, mediaUrl, type Meal, type MealPage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatDayLabel, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

/** Group meals into day buckets, preserving the API's newest-first order. */
function groupByDay(
  meals: Meal[],
): Array<{ label: string; meals: Meal[]; kcal: number }> {
  const buckets = new Map<string, Meal[]>();

  for (const meal of meals) {
    // Key on the local calendar day, not the raw timestamp.
    const key = new Date(meal.eaten_at).toDateString();
    const existing = buckets.get(key);
    if (existing) existing.push(meal);
    else buckets.set(key, [meal]);
  }

  return Array.from(buckets.values()).map((dayMeals) => ({
    label: formatDayLabel(dayMeals[0].eaten_at),
    meals: dayMeals,
    kcal: dayMeals.reduce((sum, m) => sum + m.kcal, 0),
  }));
}

export default function MealHistory() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchMeals = useCallback(() => api.meals({ limit }), [limit]);
  const { data, loading, error, reload } = useApi<MealPage>(fetchMeals);

  const meals = useMemo(() => data?.items ?? [], [data]);
  const days = useMemo(() => groupByDay(meals), [meals]);
  const hasMore = data ? meals.length < data.total : false;

  const remove = async (id: number) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await api.deleteMeal(id);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete that meal.",
      );
    } finally {
      // Reload either way — on failure the row may already be gone.
      setDeletingId(null);
      reload();
    }
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-container-padding-mobile md:px-container-padding-desktop py-stack-lg pb-28">
        <header className="mb-stack-lg">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest block mb-2">
            Your Journal
          </span>
          <h1 className="font-display-lg text-[32px] leading-[38px] md:text-display-lg md:leading-[56px] text-on-background">
            Meal history
          </h1>
          {data && (
            <p className="font-body-md text-body-md text-on-surface-variant mt-2">
              {data.total} {data.total === 1 ? "meal" : "meals"} logged.
            </p>
          )}
        </header>

        {(error ?? deleteError) && (
          <div
            role="alert"
            className="mb-stack-lg flex items-start gap-3 p-4 rounded-[14px] bg-error-container text-on-error-container"
          >
            <Icon name="error" className="text-[20px] shrink-0" />
            <span className="font-body-md text-body-md">
              {error ?? deleteError}
            </span>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex gap-6 p-6 rounded-[20px] border border-line"
              >
                <div className="w-28 h-28 skeleton-shimmer rounded-[14px] shrink-0" />
                <div className="flex-1 space-y-3 py-2">
                  <div className="h-5 w-1/3 skeleton-shimmer rounded-lg" />
                  <div className="h-4 w-1/4 skeleton-shimmer rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && meals.length === 0 && (
          <div className="border-2 border-dashed border-outline-variant rounded-[20px] py-20 px-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-6">
              <Icon name="restaurant" className="text-primary text-3xl" />
            </div>
            <h2 className="font-headline-md text-headline-md text-on-background">
              Nothing logged yet
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-2 max-w-sm">
              Once you capture a meal it'll appear here, grouped by day, with
              its macros alongside.
            </p>
            <Button asChild className="mt-8">
              <Link to="/classify">
                <Icon name="photo_camera" className="text-[18px]" />
                Capture your first meal
              </Link>
            </Button>
          </div>
        )}

        {!loading &&
          days.map((day) => (
            <section key={day.label} className="mb-stack-lg">
              <div className="flex justify-between items-baseline border-b border-line pb-3 mb-6">
                <h2 className="font-headline-md text-headline-md text-on-background">
                  {day.label}
                </h2>
                <span className="font-label-md text-label-md text-on-surface-variant">
                  {Math.round(day.kcal).toLocaleString()} kcal
                </span>
              </div>

              <div className="flex flex-col gap-4">
                {day.meals.map((meal) => (
                  <div
                    key={meal.id}
                    className={cn(
                      "flex gap-4 sm:gap-6 p-4 sm:p-6 rounded-[20px] border border-line bg-surface-container-lowest transition-colors hover:bg-surface-container-low",
                      deletingId === meal.id && "opacity-50 pointer-events-none",
                    )}
                  >
                    <Link
                      to={`/meal-result/${meal.id}`}
                      className="shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-[14px] overflow-hidden"
                    >
                      <img
                        className="w-full h-full object-cover"
                        src={mediaUrl(meal.image_url)}
                        alt={meal.label}
                      />
                    </Link>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider">
                            {meal.meal_tag}
                          </span>
                          <Link to={`/meal-result/${meal.id}`}>
                            <h3 className="font-headline-md text-headline-md text-on-background truncate hover:text-primary transition-colors">
                              {meal.label}
                            </h3>
                          </Link>
                        </div>
                        <span className="font-label-md text-label-md text-on-surface-variant shrink-0">
                          {formatTime(meal.eaten_at)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 font-label-md text-label-md text-on-surface-variant">
                        <span className="flex items-center gap-1">
                          <Icon
                            name="local_fire_department"
                            className="text-[18px]"
                          />
                          {Math.round(meal.kcal)} kcal
                        </span>
                        <span>{Math.round(meal.protein_g)}g protein</span>
                        <span>{Math.round(meal.carbs_g)}g carbs</span>
                        <span>{Math.round(meal.fat_g)}g fat</span>
                        <span className="text-outline">
                          {Math.round(meal.portion_g)}g portion
                        </span>
                      </div>

                      {meal.corrected_class && (
                        <span className="inline-flex items-center gap-1 mt-2 font-label-sm text-label-sm text-outline">
                          <Icon name="edit" className="text-[14px]" />
                          Corrected from{" "}
                          {meal.predicted_class.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => remove(meal.id)}
                      aria-label={`Delete ${meal.label}`}
                      className="self-start p-2 rounded-full text-outline hover:text-error hover:bg-error-container/40 transition-colors"
                    >
                      <Icon name="delete" className="text-[20px]" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}

        {hasMore && (
          <div className="flex justify-center mt-stack-lg">
            <Button
              variant="outline"
              onClick={() => setLimit((current) => current + PAGE_SIZE)}
            >
              Load more
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
