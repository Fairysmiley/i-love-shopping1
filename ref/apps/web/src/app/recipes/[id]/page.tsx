"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { RecipeMealVsDailyTargetsChart } from "@/components/RecipeMealVsDailyTargetsChart";

type SubstitutePayload = { substitute: string; quantity: number; unit: string; note?: string };

type IngredientSubstituteRow = {
  status: "idle" | "loading" | "preview";
  data?: SubstitutePayload;
  error?: string;
};

export default function RecipeDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [recipe, setRecipe] = useState<any>(null);
  const [servings, setServings] = useState(1);
  const [recalcNutrition, setRecalcNutrition] = useState<{ calories: number; protein: number; carbs: number; fats: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [substituteByRow, setSubstituteByRow] = useState<Record<number, IngredientSubstituteRow>>({});
  const [patchingRow, setPatchingRow] = useState<number | null>(null);
  const [substituteReason, setSubstituteReason] = useState("");
  const [availableIngredientsText, setAvailableIngredientsText] = useState("");
  const [useProfilePrefsForSubstitutes, setUseProfilePrefsForSubstitutes] = useState(true);
  const [profileDietaryPrefs, setProfileDietaryPrefs] = useState<string[]>([]);
  const [dailyTargets, setDailyTargets] = useState({
    calories: 2000,
    protein: 100,
    carbs: 200,
    fats: 60,
  });
  const [targetsFromProfile, setTargetsFromProfile] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchRecipe = async () => {
      try {
        const res = await fetch(`/api/recipes/${id}`, { credentials: "include" });
        const data = await res.json();
        if (res.ok && data.data) {
          setRecipe(data.data);
          setServings(data.data.servings ?? 1);
          const nut = data.data.nutrition as { calories?: number; protein?: number; carbs?: number; fats?: number } | null;
          if (nut) setRecalcNutrition({ calories: nut.calories ?? 0, protein: nut.protein ?? 0, carbs: nut.carbs ?? 0, fats: nut.fats ?? 0 });
        } else {
          setRecipe(null);
        }
      } catch {
        setRecipe(null);
      } finally {
        setLoading(false);
      }
    };
    fetchRecipe();
  }, [id]);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data?.error && !data?.profile) {
          setTargetsFromProfile(false);
          return;
        }
        const p = data?.profile ?? {};
        const prefs = [
          ...(Array.isArray(p.dietaryPreferences) ? p.dietaryPreferences : []),
          ...(Array.isArray(p.dietaryRestrictions) ? p.dietaryRestrictions : []),
          ...(Array.isArray(p.allergies) ? p.allergies : []),
        ]
          .map((x: unknown) => String(x ?? "").trim())
          .filter(Boolean);
        setProfileDietaryPrefs(Array.from(new Set(prefs)));

        const hasProfile = data?.profile && typeof data.profile === "object";
        const mt = (p.macronutrientTargets as { protein?: number; carbs?: number; fats?: number } | null) ?? {};
        const ct = typeof p.calorieTarget === "number" && p.calorieTarget > 0 ? p.calorieTarget : 2000;
        setDailyTargets({
          calories: ct,
          protein: typeof mt.protein === "number" && mt.protein > 0 ? mt.protein : 100,
          carbs: typeof mt.carbs === "number" && mt.carbs > 0 ? mt.carbs : 200,
          fats: typeof mt.fats === "number" && mt.fats > 0 ? mt.fats : 60,
        });
        setTargetsFromProfile(Boolean(hasProfile && !data?.mock));
      })
      .catch(() => {
        setTargetsFromProfile(false);
      });
  }, []);

  useEffect(() => {
    if (!recipe || !id) return;
    const baseServings = recipe.servings ?? 1;
    const needsFetch = servings !== baseServings || !(recipe.nutrition as { calories?: number })?.calories;
    if (!needsFetch) return;
    setNutritionLoading(true);
    fetch(`/api/recipes/${id}/nutrition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servings }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setRecalcNutrition({
          calories: data.data.calories ?? 0,
          protein: data.data.protein ?? 0,
          carbs: data.data.carbs ?? 0,
          fats: data.data.fats ?? 0,
        });
      })
      .finally(() => setNutritionLoading(false));
  }, [id, recipe, servings]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
        <Sidebar />
        <main className="flex-1 md:ml-64 px-4 py-8 pt-16 md:pt-8">
          <p className="text-gray-500 dark:text-gray-400">Loading recipe…</p>
        </main>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
        <Sidebar />
        <main className="flex-1 md:ml-64 px-4 py-8 pt-16 md:pt-8">
          <p className="text-gray-500 dark:text-gray-400">Recipe not found.</p>
          <Link href="/recipes" className="text-blue-600 dark:text-blue-400 mt-2 inline-block">Back to recipes</Link>
        </main>
      </div>
    );
  }

  const ingredients =
    (recipe.ingredients as Array<{
      id?: string | number;
      name?: string;
      quantity?: number;
      unit?: string;
    }>) ?? [];
  const preparation = (recipe.preparation as Array<{ step?: string; description?: string; instruction?: string; text?: string }>) ?? [];

  const getStepText = (step: (typeof preparation)[0], i: number) =>
    step.description ?? step.instruction ?? (step as { text?: string }).text ?? `Step ${i + 1}`;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      <Sidebar />
      <main className="flex-1 md:ml-64 px-4 sm:px-6 lg:px-8 py-8 pt-16 md:pt-8">
        <div className="max-w-3xl mx-auto">
          <Link href="/recipes" className="text-blue-600 dark:text-blue-400 text-sm mb-4 inline-block">← Back to recipes</Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{recipe.title}</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
            {recipe.cuisine ?? ""} {recipe.time != null ? `· ${recipe.time} min` : ""} {recipe.difficultyLevel ?? ""}
          </p>
          {recipe.summary && <p className="text-gray-700 dark:text-gray-300 mb-6">{recipe.summary}</p>}

          {/* Portion adjustment */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Servings</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={20}
                value={servings}
                onChange={(e) => setServings(Number(e.target.value))}
                className="flex-1 h-2 rounded-lg appearance-none bg-gray-200 dark:bg-gray-700"
              />
              <span className="text-gray-900 dark:text-white font-medium w-8">{servings}</span>
            </div>
            {recalcNutrition && (
              <>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{recalcNutrition.calories} kcal</span>
                  <span>P: {recalcNutrition.protein}g</span>
                  <span>C: {recalcNutrition.carbs}g</span>
                  <span>F: {recalcNutrition.fats}g</span>
                  {nutritionLoading && <span className="text-gray-400">Updating…</span>}
                </div>
                <RecipeMealVsDailyTargetsChart
                  meal={recalcNutrition}
                  targets={dailyTargets}
                  targetsFromProfile={targetsFromProfile}
                />
              </>
            )}
          </div>

          {/* Ingredients */}
          <section className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Ingredients</h2>
            <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                AI substitutes can consider your dietary preferences/allergies and ingredients you currently have.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={substituteReason}
                  onChange={(e) => setSubstituteReason(e.target.value)}
                  placeholder='Reason (e.g. "allergy", "out of stock", "prefer vegan")'
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <input
                  type="text"
                  value={availableIngredientsText}
                  onChange={(e) => setAvailableIngredientsText(e.target.value)}
                  placeholder="Available ingredients (comma-separated)"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={useProfilePrefsForSubstitutes}
                  onChange={(e) => setUseProfilePrefsForSubstitutes(e.target.checked)}
                />
                Use my profile dietary preferences/allergies for substitutions
                {useProfilePrefsForSubstitutes && profileDietaryPrefs.length > 0
                  ? ` (${profileDietaryPrefs.length} loaded)`
                  : ""}
              </label>
            </div>
            <ul className="list-none space-y-3 text-gray-700 dark:text-gray-300">
              {ingredients.map((ing, i) => {
                const name = ing.name ?? "Ingredient";
                const qty = ing.quantity != null ? (servings / (recipe.servings ?? 1)) * ing.quantity : null;
                const row = substituteByRow[i] ?? { status: "idle" as const };
                const runSuggest = () => {
                  setSubstituteByRow((prev) => ({
                    ...prev,
                    [i]: { status: "loading", error: undefined },
                  }));
                  fetch(`/api/recipes/${id}/substitute`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ingredientName: name,
                      reason: substituteReason.trim() || undefined,
                      dietaryPrefs:
                        useProfilePrefsForSubstitutes && profileDietaryPrefs.length > 0
                          ? profileDietaryPrefs
                          : undefined,
                      availableIngredients: availableIngredientsText
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      quantity: qty ?? ing.quantity ?? undefined,
                      unit: ing.unit ?? "g",
                    }),
                  })
                    .then(async (r) => {
                      const d = await r.json();
                      if (!r.ok) {
                        throw new Error(d.error || `Request failed (${r.status})`);
                      }
                      if (!d.data) {
                        throw new Error("No substitute in response");
                      }
                      return d.data as SubstitutePayload;
                    })
                    .then((data) => {
                      setSubstituteByRow((prev) => ({
                        ...prev,
                        [i]: { status: "preview", data, error: undefined },
                      }));
                    })
                    .catch((err) => {
                      setSubstituteByRow((prev) => ({
                        ...prev,
                        [i]: {
                          status: "idle",
                          error: err instanceof Error ? err.message : "Substitute failed",
                        },
                      }));
                    });
                };

                const applySubstitute = async () => {
                  const d = row.data;
                  if (!d || row.status !== "preview") return;
                  setPatchingRow(i);
                  setSubstituteByRow((prev) => ({
                    ...prev,
                    [i]: { ...prev[i], error: undefined },
                  }));
                  try {
                    const baseServings = recipe.servings ?? 1;
                    const displayScale = servings / baseServings;
                    const newIngs = ingredients.map((ingRow, j) => {
                      const qtyBase = ingRow.quantity ?? 0;
                      const u = ingRow.unit ?? "g";
                      if (j !== i) {
                        const o: { id?: string; name: string; quantity: number; unit: string } = {
                          name: String(ingRow.name ?? "Ingredient"),
                          quantity: qtyBase,
                          unit: u,
                        };
                        if (ingRow.id != null && String(ingRow.id).trim()) o.id = String(ingRow.id);
                        return o;
                      }
                      let q = Number(d.quantity);
                      if (!Number.isFinite(q) || q <= 0) q = qtyBase;
                      if (displayScale !== 1 && Number.isFinite(displayScale) && displayScale > 0) {
                        q = q / displayScale;
                      }
                      const o: { id?: string; name: string; quantity: number; unit: string } = {
                        name: String(d.substitute).trim() || name,
                        quantity: q,
                        unit: (d.unit && String(d.unit).trim()) || u,
                      };
                      if (ingRow.id != null && String(ingRow.id).trim()) o.id = String(ingRow.id);
                      return o;
                    });

                    const res = await fetch(`/api/recipes/${id}`, {
                      method: "PATCH",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ingredients: newIngs }),
                    });
                    const payload = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(payload.error || `Save failed (${res.status})`);
                    if (!payload.data) throw new Error("No recipe returned");
                    setRecipe(payload.data);
                    const nut = payload.data.nutrition as {
                      calories?: number;
                      protein?: number;
                      carbs?: number;
                      fats?: number;
                    } | null;
                    if (nut) {
                      setRecalcNutrition({
                        calories: nut.calories ?? 0,
                        protein: nut.protein ?? 0,
                        carbs: nut.carbs ?? 0,
                        fats: nut.fats ?? 0,
                      });
                    }
                    setSubstituteByRow((prev) => {
                      const next = { ...prev };
                      delete next[i];
                      return next;
                    });
                  } catch (err) {
                    setSubstituteByRow((prev) => ({
                      ...prev,
                      [i]: {
                        status: "preview",
                        data: d,
                        error: err instanceof Error ? err.message : "Save failed",
                      },
                    }));
                  } finally {
                    setPatchingRow(null);
                  }
                };

                return (
                  <li key={i} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>
                        {qty != null ? `${typeof qty === "number" && qty % 1 !== 0 ? qty.toFixed(1) : qty} ${ing.unit ?? "unit"} ` : ""}
                        {name}
                      </span>
                      {row.status === "preview" ? (
                        <>
                          <button
                            type="button"
                            disabled={patchingRow === i}
                            onClick={() => void applySubstitute()}
                            className="text-xs px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 disabled:opacity-60"
                          >
                            {patchingRow === i ? "Saving…" : "Use substitute"}
                          </button>
                          <button
                            type="button"
                            disabled={patchingRow === i}
                            onClick={() =>
                              setSubstituteByRow((prev) => {
                                const next = { ...prev };
                                delete next[i];
                                return next;
                              })
                            }
                            className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-60"
                          >
                            Ignore
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={row.status === "loading" || patchingRow !== null}
                          onClick={runSuggest}
                          className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-60"
                        >
                          Substitute
                        </button>
                      )}
                      {row.status === "loading" && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">Loading…</span>
                      )}
                      {row.error && row.status === "idle" && (
                        <span className="text-sm text-red-600 dark:text-red-400">{row.error}</span>
                      )}
                      {row.error && row.status === "preview" && (
                        <span className="text-sm text-red-600 dark:text-red-400">{row.error}</span>
                      )}
                    </div>
                    {row.status === "preview" && row.data && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 pl-0 ml-6 whitespace-pre-wrap break-words">
                        <span className="font-medium text-gray-700 dark:text-gray-300">Suggested: </span>
                        {row.data.quantity} {row.data.unit} {row.data.substitute}
                        {row.data.note ? ` — ${row.data.note}` : ""}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Preparation */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Preparation</h2>
            <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
              {preparation.map((step, i) => (
                <li key={i}>
                  {step.step && <span className="font-medium">{step.step}: </span>}
                  {getStepText(step, i)}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}
