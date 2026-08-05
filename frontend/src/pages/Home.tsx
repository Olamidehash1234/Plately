import { useCallback } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { MacroBar } from "@/components/plately/MacroBar";
import { AppShell } from "@/components/layout/AppShell";
import { api, mediaUrl, type DailySummary, type MealPage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { formatDate, formatTime, greeting, percentage } from "@/lib/format";
import { toDateParam } from "@/lib/format";

function MacroRow({
  label,
  consumed,
  goal,
  dot,
  fill,
}: {
  label: string;
  consumed: number;
  goal: number;
  dot: string;
  fill: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${dot}`} />
          <span className="font-label-md text-label-md text-on-background">
            {label}
          </span>
        </div>
        <span className="font-label-md text-label-md text-on-surface-variant">
          {Math.round(consumed)}g / {Math.round(goal)}g
        </span>
      </div>
      <MacroBar value={percentage(consumed, goal)} fillClass={fill} />
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const today = toDateParam(new Date());

  const fetchSummary = useCallback(() => api.dailySummary(), []);
  const fetchMeals = useCallback(
    () => api.meals({ on: today, limit: 20 }),
    [today],
  );

  const summary = useApi<DailySummary>(fetchSummary);
  const meals = useApi<MealPage>(fetchMeals);

  const loading = summary.loading || meals.loading;
  const error = summary.error ?? meals.error;

  const consumed = summary.data?.consumed;
  const goals = summary.data?.goals;
  const items = meals.data?.items ?? [];

  return (
    <AppShell>
      <div className="max-w-[1440px] mx-auto px-container-padding-mobile md:px-container-padding-desktop pb-32">
        <section className="mt-stack-lg md:mt-12">
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 md:items-end justify-between mb-stack-lg">
            <div className="text-left">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest block mb-2">
                Daily Nutrition
              </span>
              <h1 className="font-display-lg text-[32px] leading-[38px] md:text-display-lg md:leading-[56px] text-on-background">
                {greeting()}
                {user?.name ? `, ${user.name.split(" ")[0]}.` : "."}
              </h1>
            </div>
            <div className="flex items-center gap-4 text-on-surface-variant font-label-md text-label-md">
              <Icon name="calendar_today" />
              <span>{formatDate(new Date().toISOString())}</span>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-stack-lg flex items-start gap-3 p-4 rounded-[14px] bg-error-container text-on-error-container"
            >
              <Icon name="error" className="text-[20px] shrink-0" />
              <span className="font-body-md text-body-md">{error}</span>
            </div>
          )}

          {/* Bento grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
            <div className="md:col-span-7 bg-surface-container-lowest p-6 md:p-8 rounded-[20px] editorial-shadow flex flex-col justify-between border border-line">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-headline-md text-headline-md text-on-background">
                    Calorie Progress
                  </h2>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    {loading || !consumed || !goals
                      ? "Loading today's intake…"
                      : `You've consumed ${percentage(consumed.kcal, goals.kcal)}% of your daily goal.`}
                  </p>
                </div>
                <Icon name="bolt" className="text-primary text-3xl" />
              </div>

              {loading ? (
                <div className="mt-10 md:mt-12 mb-6 space-y-4">
                  <div className="h-16 w-2/3 skeleton-shimmer rounded-lg" />
                  <div className="h-2 w-full skeleton-shimmer rounded-full" />
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-4 mt-10 md:mt-12 mb-6">
                    <span className="text-[64px] md:text-[84px] font-semibold leading-none tracking-tighter text-primary">
                      {Math.round(consumed?.kcal ?? 0).toLocaleString()}
                    </span>
                    <span className="text-headline-md text-on-surface-variant">
                      / {Math.round(goals?.kcal ?? 0).toLocaleString()} kcal
                    </span>
                  </div>
                  <MacroBar
                    value={percentage(consumed?.kcal ?? 0, goals?.kcal ?? 0)}
                    fillClass="bg-primary"
                  />
                </>
              )}
            </div>

            <div className="md:col-span-5 bg-surface-container-lowest p-6 md:p-8 rounded-[20px] editorial-shadow border border-line">
              <h3 className="font-headline-md text-headline-md text-on-background mb-8">
                Macronutrients
              </h3>
              {loading || !consumed || !goals ? (
                <div className="space-y-8">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-4 w-1/2 skeleton-shimmer rounded-lg" />
                      <div className="h-2 w-full skeleton-shimmer rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-8">
                  <MacroRow
                    label="Protein"
                    consumed={consumed.protein_g}
                    goal={goals.protein_g}
                    dot="bg-primary"
                    fill="bg-primary"
                  />
                  <MacroRow
                    label="Carbs"
                    consumed={consumed.carbs_g}
                    goal={goals.carbs_g}
                    dot="bg-secondary-container"
                    fill="bg-secondary-container"
                  />
                  <MacroRow
                    label="Fats"
                    consumed={consumed.fat_g}
                    goal={goals.fat_g}
                    dot="bg-secondary"
                    fill="bg-secondary"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Today's meals */}
        <section className="mt-16 md:mt-20">
          <div className="flex justify-between items-end mb-8 md:mb-10 border-b border-line pb-4">
            <h2 className="font-headline-lg text-headline-lg text-on-background">
              Today's Meals
            </h2>
            <Button asChild>
              <Link to="/classify">
                <Icon name="add" className="text-[20px]" />
                Log Meal
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {loading &&
              Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-[20px] border border-line overflow-hidden"
                >
                  <div className="h-56 md:h-64 skeleton-shimmer" />
                  <div className="p-6 space-y-3">
                    <div className="h-6 w-2/3 skeleton-shimmer rounded-lg" />
                    <div className="h-4 w-1/2 skeleton-shimmer rounded-lg" />
                  </div>
                </div>
              ))}

            {!loading &&
              items.map((meal) => (
                <Link
                  to={`/meal-result/${meal.id}`}
                  key={meal.id}
                  className="group bg-surface-container-lowest rounded-[20px] overflow-hidden editorial-shadow border border-line hover:-translate-y-1 transition-transform duration-300"
                >
                  <div className="h-56 md:h-64 overflow-hidden relative">
                    <img
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      src={mediaUrl(meal.image_url)}
                      alt={meal.label}
                    />
                    <div className="absolute top-4 left-4">
                      <span className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full font-label-sm text-label-sm text-primary uppercase">
                        {meal.meal_tag}
                      </span>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-2 gap-3">
                      <h3 className="font-headline-md text-headline-md text-on-background">
                        {meal.label}
                      </h3>
                      <span className="font-label-md text-label-md text-on-surface-variant shrink-0">
                        {formatTime(meal.eaten_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-4">
                      <div className="flex items-center gap-1 text-on-surface-variant font-label-md text-label-md">
                        <Icon name="local_fire_department" className="text-[18px]" />
                        <span>{Math.round(meal.kcal)} kcal</span>
                      </div>
                      <div className="flex items-center gap-1 text-on-surface-variant font-label-md text-label-md">
                        <Icon name="fitness_center" className="text-[18px]" />
                        <span>{Math.round(meal.protein_g)}g Protein</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}

            {/* Prompt to log the next meal */}
            {!loading && (
              <Link
                to="/classify"
                className="group border-2 border-dashed border-outline-variant rounded-[20px] flex flex-col items-center justify-center p-8 hover:bg-surface-container-low transition-colors cursor-pointer min-h-[300px] md:min-h-[400px] text-center"
              >
                <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Icon name="restaurant" className="text-primary text-3xl" />
                </div>
                <span className="font-headline-md text-headline-md text-on-surface-variant">
                  {items.length === 0 ? "No meals logged yet" : "Log another meal"}
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant text-center mt-2 max-w-[220px]">
                  {items.length === 0
                    ? "Capture your first meal to start tracking today's macros."
                    : "Keep your daily totals accurate as the day goes on."}
                </p>
                <span className="mt-6 text-primary font-bold font-label-md text-label-md underline underline-offset-4">
                  Capture Meal Now
                </span>
              </Link>
            )}
          </div>
        </section>

        {/* Recommendation, driven by the real protein gap */}
        {!loading && consumed && goals && consumed.protein_g < goals.protein_g && (
          <section className="mt-16 md:mt-20">
            <div className="bg-primary-container/10 p-8 md:p-10 rounded-[24px] flex flex-col md:flex-row items-center gap-10">
              <div className="flex-1">
                <h2 className="font-headline-lg text-headline-lg text-on-primary-container mb-4">
                  Smart Recommendation
                </h2>
                <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed max-w-2xl">
                  You're{" "}
                  <span className="text-primary font-semibold">
                    {Math.round(goals.protein_g - consumed.protein_g)}g
                  </span>{" "}
                  of protein short of your {Math.round(goals.protein_g)}g target.
                  A protein-led dinner — grilled fish, beans or moi moi — would
                  close most of that gap.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-4">
                  <Button asChild>
                    <Link to="/classify">Log a meal</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/history">View history</Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
