import { useCallback, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { MacroBar } from "@/components/plately/MacroBar";
import { AppShell } from "@/components/layout/AppShell";
import {
  api,
  mediaUrl,
  type FoodClass,
  type Meal,
  type Prediction,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatTime } from "@/lib/format";

/** Macro split by calorie contribution, which is how a plate actually reads. */
function macroShares(meal: Meal) {
  const protein = meal.protein_g * 4;
  const carbs = meal.carbs_g * 4;
  const fat = meal.fat_g * 9;
  const total = protein + carbs + fat || 1;

  return [
    {
      label: "Protein",
      grams: meal.protein_g,
      share: Math.round((protein / total) * 100),
      fill: "bg-primary-container",
    },
    {
      label: "Carbs",
      grams: meal.carbs_g,
      share: Math.round((carbs / total) * 100),
      fill: "bg-secondary-container",
    },
    {
      label: "Fats",
      grams: meal.fat_g,
      share: Math.round((fat / total) * 100),
      fill: "bg-tertiary-container",
    },
  ];
}

export default function MealResult() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mealId } = useParams<{ mealId: string }>();

  // Passed through by Classify so the runner-up predictions are available
  // without a second request. Absent when arriving from history.
  const routeState = location.state as {
    alternatives?: Prediction[];
    lowConfidence?: boolean;
  } | null;

  const [meal, setMeal] = useState<Meal | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingPortion, setEditingPortion] = useState(false);
  const [portionInput, setPortionInput] = useState("");
  const [correcting, setCorrecting] = useState(false);

  const fetchMeal = useCallback(async () => {
    if (!mealId) throw new Error("No meal specified.");
    const result = await api.meal(Number(mealId));
    setMeal(result);
    setPortionInput(String(Math.round(result.portion_g)));
    return result;
  }, [mealId]);

  const { loading, error } = useApi<Meal>(fetchMeal);

  const fetchClasses = useCallback(() => api.foodClasses(), []);
  const { data: foodClasses } = useApi<FoodClass[]>(fetchClasses);

  const applyChange = async (changes: Parameters<typeof api.updateMeal>[1]) => {
    if (!meal) return;
    setSaving(true);
    setSaveError(null);
    try {
      setMeal(await api.updateMeal(meal.id, changes));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const savePortion = async () => {
    const grams = Number(portionInput);
    if (!Number.isFinite(grams) || grams <= 0) {
      setSaveError("Enter a portion size in grams.");
      return;
    }
    await applyChange({ portion_g: grams });
    setEditingPortion(false);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-7xl mx-auto px-container-padding-mobile md:px-container-padding-desktop pt-8 pb-28">
          <div className="rounded-[20px] overflow-hidden border border-line flex flex-col lg:flex-row">
            <div className="w-full lg:w-1/2 h-[280px] sm:h-[400px] skeleton-shimmer" />
            <div className="w-full lg:w-1/2 p-8 sm:p-10 space-y-6">
              <div className="h-6 w-1/3 skeleton-shimmer rounded-full" />
              <div className="h-12 w-2/3 skeleton-shimmer rounded-lg" />
              <div className="h-24 w-full skeleton-shimmer rounded-lg" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error || !meal) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto px-container-padding-mobile py-20 text-center">
          <Icon name="error" className="text-error text-5xl" />
          <h1 className="font-headline-lg text-headline-lg text-on-background mt-6">
            Meal not found
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2">
            {error ?? "This meal may have been deleted."}
          </p>
          <Button className="mt-8" onClick={() => navigate("/history")}>
            Back to history
          </Button>
        </div>
      </AppShell>
    );
  }

  const shares = macroShares(meal);
  const confidencePct = Math.round(meal.confidence * 100);
  const wasCorrected = meal.corrected_class !== null;
  const alternatives = (routeState?.alternatives ?? []).filter(
    (a) => a.key !== meal.food_class,
  );

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-container-padding-mobile md:px-container-padding-desktop pt-8 md:pt-12 pb-28 md:pb-20">
        <button
          onClick={() => navigate(-1)}
          className="mb-stack-lg flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors"
        >
          <Icon name="arrow_back" className="text-[20px]" />
          <span className="font-label-md text-label-md">Back</span>
        </button>

        {routeState?.lowConfidence && !wasCorrected && (
          <div className="mb-stack-md flex items-start gap-3 p-4 rounded-[14px] bg-secondary-container/30 border border-secondary-container">
            <Icon name="help" className="text-[20px] shrink-0 text-secondary" />
            <div className="font-body-md text-body-md">
              <p className="font-semibold text-on-background">
                Not fully confident about this one
              </p>
              <p className="text-on-surface-variant">
                The model is only {confidencePct}% sure. Check it below and
                correct it if it's wrong.
              </p>
            </div>
          </div>
        )}

        {saveError && (
          <div
            role="alert"
            className="mb-stack-md flex items-start gap-3 p-4 rounded-[14px] bg-error-container text-on-error-container"
          >
            <Icon name="error" className="text-[20px] shrink-0" />
            <span className="font-body-md text-body-md">{saveError}</span>
          </div>
        )}

        <div className="bg-surface-container-lowest rounded-[20px] editorial-shadow overflow-hidden flex flex-col lg:flex-row lg:min-h-[640px]">
          {/* Left: the photo */}
          <div className="w-full lg:w-1/2 relative h-[280px] sm:h-[400px] lg:h-auto">
            <img
              className="w-full h-full object-cover"
              src={mediaUrl(meal.image_url)}
              alt={meal.label}
            />
            <div className="absolute bottom-6 left-6 bg-surface-container-lowest/90 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 border border-outline-variant/30">
              <Icon name="schedule" filled className="text-primary text-[18px]" />
              <span className="font-label-md text-label-md text-on-surface">
                {formatTime(meal.eaten_at)}
              </span>
            </div>
          </div>

          {/* Right: the analysis */}
          <div className="w-full lg:w-1/2 p-8 sm:p-10 lg:p-14 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-4 gap-4">
                <span className="px-4 py-1.5 bg-surface-container rounded-full text-on-tertiary-fixed-variant font-label-sm text-label-sm uppercase tracking-wider">
                  {meal.meal_tag}
                </span>
                <div className="flex items-center gap-1.5 text-primary shrink-0">
                  <Icon
                    name={wasCorrected ? "edit" : "verified"}
                    filled
                    className="text-[20px]"
                  />
                  <span className="font-label-md text-label-md font-bold text-primary">
                    {wasCorrected ? "Corrected" : `${confidencePct}% Match`}
                  </span>
                </div>
              </div>

              <h1 className="font-headline-lg text-headline-lg text-on-surface mb-stack-sm">
                {meal.label}
              </h1>

              {wasCorrected && (
                <p className="font-body-md text-body-md text-on-surface-variant">
                  The model originally predicted{" "}
                  {meal.predicted_class.replace(/_/g, " ")} at {confidencePct}%.
                </p>
              )}

              {/* Portion */}
              <div className="mt-8 flex items-center justify-between gap-4 p-4 rounded-[14px] border border-line bg-white">
                <div>
                  <span className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                    Portion
                  </span>
                  {editingPortion ? (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="number"
                        min={1}
                        value={portionInput}
                        onChange={(e) => setPortionInput(e.target.value)}
                        className="w-24 px-3 py-2 border border-line rounded-[10px] font-body-md text-body-md outline-none focus:border-primary"
                      />
                      <span className="font-body-md text-on-surface-variant">
                        grams
                      </span>
                    </div>
                  ) : (
                    <span className="block font-headline-md text-headline-md text-on-background mt-1">
                      {Math.round(meal.portion_g)}g
                    </span>
                  )}
                </div>
                {editingPortion ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={savePortion} disabled={saving}>
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingPortion(false);
                        setPortionInput(String(Math.round(meal.portion_g)));
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingPortion(true)}
                  >
                    Adjust
                  </Button>
                )}
              </div>

              {/* Calories */}
              <div className="flex items-baseline gap-3 mt-8">
                <span className="text-[56px] font-semibold leading-none tracking-tighter text-primary">
                  {Math.round(meal.kcal).toLocaleString()}
                </span>
                <span className="text-headline-md text-on-surface-variant">
                  kcal
                </span>
              </div>

              {/* Macro breakdown */}
              <div className="mt-8 space-y-6">
                {shares.map((macro) => (
                  <div key={macro.label}>
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="font-label-md text-label-md text-on-background">
                        {macro.label}
                      </span>
                      <span className="font-label-md text-label-md text-on-surface-variant">
                        {Math.round(macro.grams)}g · {macro.share}% of calories
                      </span>
                    </div>
                    <MacroBar value={macro.share} fillClass={macro.fill} />
                  </div>
                ))}
              </div>
            </div>

            {/* Corrections */}
            <div className="mt-10 pt-8 border-t border-line">
              {!correcting ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setCorrecting(true)}
                    className="flex-1"
                  >
                    <Icon name="edit" className="text-[18px]" />
                    Not right? Correct it
                  </Button>
                  <Button onClick={() => navigate("/home")} className="flex-1">
                    Done
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="font-label-md text-label-md text-on-background">
                    What was it actually?
                  </p>

                  {alternatives.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {alternatives.map((alt) => (
                        <button
                          key={alt.key}
                          onClick={async () => {
                            await applyChange({ corrected_class: alt.key });
                            setCorrecting(false);
                          }}
                          disabled={saving}
                          className="px-4 py-2 rounded-full border border-outline-variant font-label-md text-label-md text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
                        >
                          {alt.label}
                          <span className="ml-2 text-outline">
                            {Math.round(alt.confidence * 100)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <select
                    className="w-full px-4 py-3 bg-white border border-line rounded-[14px] font-body-md text-body-md outline-none focus:border-primary"
                    defaultValue=""
                    disabled={saving}
                    onChange={async (event) => {
                      const key = event.target.value;
                      if (!key) return;
                      await applyChange({ corrected_class: key });
                      setCorrecting(false);
                    }}
                  >
                    <option value="" disabled>
                      Choose from all foods…
                    </option>
                    {(foodClasses ?? []).map((food) => (
                      <option key={food.key} value={food.key}>
                        {food.label}
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="ghost"
                    size="block"
                    onClick={() => setCorrecting(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
