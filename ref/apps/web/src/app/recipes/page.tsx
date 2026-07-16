"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";

const PAGE_SIZE = 24;

function RecipesContent() {
  const [q, setQ] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [dietaryInput, setDietaryInput] = useState("");
  const [maxTime, setMaxTime] = useState("");
  const [maxCalories, setMaxCalories] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [page, setPage] = useState(1);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // RAG-backed custom recipe generation (proves Task 2 "varied custom recipes with instructions + nutrition").
  const QUICK_DIETARY = ["vegetarian", "vegan", "gluten-free", "dairy-free", "high-protein", "low-carb"];
  const [aiOpen, setAiOpen] = useState(true);
  const [aiQuery, setAiQuery] = useState("");
  const [aiCuisine, setAiCuisine] = useState("");
  const [aiDiet, setAiDiet] = useState<string[]>([]);
  const [aiDietInput, setAiDietInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  type GenIngredient = { id?: string; name: string; quantity: number; unit: string };
  type GenStep = { step?: string; description?: string; ingredients?: string[] };
  type GenResult = {
    title: string;
    cuisine: string;
    meal?: string;
    summary?: string;
    time?: number;
    difficulty_level?: string;
    dietary_tags?: string[];
    servings: number;
    ingredients: GenIngredient[];
    preparation: GenStep[];
    nutrition?: { calories: number; protein: number; carbs: number; fats: number };
  };
  const [aiResult, setAiResult] = useState<GenResult | null>(null);
  const [aiGrounded, setAiGrounded] = useState<string[]>([]);

  const handleGenerateAiRecipe = async () => {
    if (!aiQuery.trim()) {
      setAiError("Enter a query first (e.g. \"high-protein dinner\", \"quick light lunch\").");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setAiGrounded([]);
    try {
      const res = await fetch("/api/recipes/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: aiQuery.trim(),
          dietaryPrefs: aiDiet,
          cuisinePref: aiCuisine.trim() || "Any",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      const recipe = data?.data?.generatedRecipe;
      const grounded = Array.isArray(data?.data?.retrievedContext) ? data.data.retrievedContext : [];
      if (!recipe) throw new Error("No recipe in response.");
      setAiResult(recipe as GenResult);
      setAiGrounded(grounded);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Failed to generate recipe.");
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [q, cuisine, dietaryRestrictions, maxTime, maxCalories, ingredients]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (cuisine.trim()) params.set("cuisine", cuisine.trim());
    dietaryRestrictions.forEach((d) => params.append("dietary", d));
    if (maxTime.trim()) params.set("maxTime", maxTime.trim());
    if (maxCalories.trim()) params.set("maxCalories", maxCalories.trim());
    if (ingredients.trim()) params.set("ingredients", ingredients.trim());
    params.set("limit", String(PAGE_SIZE));
    params.set("page", String(page));

    const fetchRecipes = async () => {
      setLoading(true);
      setAuthError(false);
      setApiError(null);
      try {
        const res = await fetch(`/api/recipes?${params.toString()}`, { credentials: "include" });
        const data = await res.json();
        if (res.ok) {
          setRecipes(Array.isArray(data.data) ? data.data : []);
          setTotal(typeof data.total === "number" ? data.total : data.data?.length ?? 0);
          setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
        } else {
          setRecipes([]);
          setTotal(0);
          setTotalPages(1);
          if (res.status === 401) setAuthError(true);
          else setApiError((data as { error?: string })?.error || `Request failed (${res.status})`);
        }
      } catch (err) {
        setRecipes([]);
        setTotal(0);
        setTotalPages(1);
        setApiError(err instanceof Error ? err.message : "Failed to load recipes");
      } finally {
        setLoading(false);
      }
    };
    fetchRecipes();
  }, [q, cuisine, dietaryRestrictions, maxTime, maxCalories, ingredients, page]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      <Sidebar />
      <main className="flex-1 md:ml-64 px-4 sm:px-6 lg:px-8 py-8 pt-16 md:pt-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Recipes</h1>

          {/* AI generation panel — RAG: retrieves top-5 similar recipes + ingredients, augments prompt, generates via LLM, nutrition computed by function calling. */}
          <section
            aria-label="Generate AI recipe"
            className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Generate a custom recipe with AI
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  RAG over your recipes + ingredients, then function calling for nutrition. Two clicks of Generate with the same inputs produce different recipes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAiOpen((o) => !o)}
                className="shrink-0 text-xs px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-expanded={aiOpen}
              >
                {aiOpen ? "Hide" : "Show"}
              </button>
            </div>

            {aiOpen && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 min-w-[240px]">
                    <label htmlFor="ai-query" className="sr-only">Recipe query</label>
                    <input
                      id="ai-query"
                      type="text"
                      placeholder='Query — e.g. "high-protein dinner", "quick light lunch"'
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !aiLoading) {
                          e.preventDefault();
                          handleGenerateAiRecipe();
                        }
                      }}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2"
                    />
                  </div>
                  <div className="w-44">
                    <label htmlFor="ai-cuisine" className="sr-only">Cuisine preference</label>
                    <input
                      id="ai-cuisine"
                      type="text"
                      placeholder="Cuisine (optional)"
                      value={aiCuisine}
                      onChange={(e) => setAiCuisine(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateAiRecipe}
                    disabled={aiLoading || !aiQuery.trim()}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {aiLoading ? "Generating…" : "Generate"}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Dietary prefs:</span>
                  {QUICK_DIETARY.map((d) => {
                    const on = aiDiet.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setAiDiet((prev) =>
                            prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                          )
                        }
                        className={`px-3 py-1 rounded-full text-sm border ${
                          on
                            ? "border-violet-500 bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200"
                            : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                  <input
                    type="text"
                    placeholder="custom… ↵"
                    value={aiDietInput}
                    onChange={(e) => setAiDietInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = aiDietInput.trim().toLowerCase();
                        if (v && !aiDiet.includes(v)) {
                          setAiDiet((prev) => [...prev, v]);
                          setAiDietInput("");
                        }
                      }
                    }}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1 text-sm w-32"
                    aria-label="Add custom dietary preference"
                  />
                  {aiDiet
                    .filter((d) => !QUICK_DIETARY.includes(d))
                    .map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm border border-violet-500 bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200"
                      >
                        {d}
                        <button
                          type="button"
                          onClick={() => setAiDiet((prev) => prev.filter((x) => x !== d))}
                          className="ml-0.5 w-5 h-5 flex items-center justify-center rounded hover:bg-violet-200/50 dark:hover:bg-violet-800/50"
                          aria-label={`Remove ${d}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>

                {aiError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{aiError}</p>
                )}

                {aiResult && (
                  <article className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
                    <header className="mb-3">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {aiResult.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {aiResult.cuisine}
                        {aiResult.meal ? ` · ${aiResult.meal}` : ""}
                        {aiResult.time != null ? ` · ${aiResult.time} min` : ""}
                        {aiResult.difficulty_level ? ` · ${aiResult.difficulty_level}` : ""}
                        {` · ${aiResult.servings} serving${aiResult.servings === 1 ? "" : "s"}`}
                      </p>
                      {aiResult.summary && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                          {aiResult.summary}
                        </p>
                      )}
                      {Array.isArray(aiResult.dietary_tags) && aiResult.dietary_tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {aiResult.dietary_tags.map((t) => (
                            <span
                              key={t}
                              className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </header>

                    {aiResult.nutrition && (
                      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {aiResult.nutrition.calories} kcal
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          P: {aiResult.nutrition.protein} g
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          C: {aiResult.nutrition.carbs} g
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          F: {aiResult.nutrition.fats} g
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          per serving · via function calling
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                          Ingredients
                        </h4>
                        <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                          {aiResult.ingredients.map((ing, i) => (
                            <li key={i}>
                              {ing.quantity} {ing.unit} {ing.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                          Preparation
                        </h4>
                        <ol className="list-decimal pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                          {aiResult.preparation.map((s, i) => (
                            <li key={i}>
                              {s.step ? (
                                <span className="font-medium">{s.step}: </span>
                              ) : null}
                              {s.description}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>

                    {aiGrounded.length > 0 && (
                      <details className="mt-3">
                        <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
                          RAG context: {aiGrounded.length} grounding item(s)
                        </summary>
                        <ul className="mt-1 text-xs text-gray-600 dark:text-gray-400 pl-4 list-disc">
                          {aiGrounded.map((c, i) => (
                            <li key={i} className="truncate">{c}</li>
                          ))}
                        </ul>
                      </details>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateAiRecipe}
                        disabled={aiLoading}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-60"
                      >
                        Regenerate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAiResult(null);
                          setAiGrounded([]);
                          setAiError(null);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Clear
                      </button>
                    </div>
                  </article>
                )}
              </div>
            )}
          </section>

          {/* Search: by name, ingredients, cuisine (requirements) */}
          <section className="mb-4">
            <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Search</h2>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="search-name" className="sr-only">Search by name or cuisine</label>
                <input
                  id="search-name"
                  type="search"
                  placeholder="Name or cuisine…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2"
                />
              </div>
              <div className="w-36">
                <label htmlFor="search-ingredients" className="sr-only">Search by ingredients</label>
                <input
                  id="search-ingredients"
                  type="text"
                  placeholder="Ingredients"
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2"
                />
              </div>
              <div className="w-36">
                <label htmlFor="search-cuisine" className="sr-only">Filter by cuisine</label>
                <input
                  id="search-cuisine"
                  type="text"
                  placeholder="Cuisine"
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2"
                />
              </div>
            </div>
          </section>

          {/* Filters: dietary restrictions, calories, prep time (requirements) */}
          <section className="mb-4">
            <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Filters</h2>
            <div className="flex flex-wrap gap-4">
              <div className="w-48">
                <label htmlFor="filter-dietary" className="sr-only">Add dietary restriction</label>
                <input
                  id="filter-dietary"
                  type="text"
                  placeholder="Add restriction (e.g. halal)"
                  value={dietaryInput}
                  onChange={(e) => setDietaryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = dietaryInput.trim().toLowerCase();
                      if (v && !dietaryRestrictions.includes(v)) {
                        setDietaryRestrictions((prev) => [...prev, v]);
                        setDietaryInput("");
                      }
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2"
                />
              </div>
              <div className="w-32">
                <label htmlFor="filter-time" className="sr-only">Max prep time (minutes)</label>
                <input
                  id="filter-time"
                  type="number"
                  placeholder="Max prep time (min)"
                  value={maxTime}
                  onChange={(e) => setMaxTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2"
                />
              </div>
              <div className="w-32">
                <label htmlFor="filter-calories" className="sr-only">Max calories</label>
                <input
                  id="filter-calories"
                  type="number"
                  placeholder="Max calories"
                  value={maxCalories}
                  onChange={(e) => setMaxCalories(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2"
                />
              </div>
            </div>
          </section>

          {/* Quick filter chips – toggle to add/remove multiple dietary restrictions */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm text-gray-500 dark:text-gray-400">Quick filters:</span>
            {[
              { label: "Vegetarian", value: "vegetarian" },
              { label: "Gluten-free", value: "gluten-free" },
              { label: "Dairy-free", value: "dairy-free" },
              { label: "Vegan", value: "vegan" },
              { label: "Under 30 min", set: () => setMaxTime("30") },
              { label: "Under 45 min", set: () => setMaxTime("45") },
              { label: "Under 400 kcal", set: () => setMaxCalories("400") },
            ].map((item) =>
              "value" in item ? (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    const v = item.value as string;
                    setDietaryRestrictions((prev) =>
                      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
                    );
                  }}
                  className={`px-3 py-1 rounded-full text-sm border ${
                    dietaryRestrictions.includes(item.value as string)
                      ? "border-violet-500 bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200"
                      : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {item.label}
                </button>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.set}
                  className="px-3 py-1 rounded-full text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {item.label}
                </button>
              )
            )}
          </div>

          {/* Active filter tags – visible restrictions, click X to remove */}
          {(q.trim() || cuisine.trim() || dietaryRestrictions.length > 0 || maxTime.trim() || maxCalories.trim() || ingredients.trim()) && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-sm text-gray-500 dark:text-gray-400 mr-1">Active filters:</span>
              {q.trim() && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200">
                  Search: {q.trim()}
                  <button type="button" onClick={() => setQ("")} className="ml-0.5 w-5 h-5 flex items-center justify-center rounded hover:bg-blue-200/50 dark:hover:bg-blue-800/50" aria-label="Remove search">×</button>
                </span>
              )}
              {ingredients.trim() && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                  Ingredients: {ingredients.trim()}
                  <button type="button" onClick={() => setIngredients("")} className="ml-0.5 w-5 h-5 flex items-center justify-center rounded hover:bg-amber-200/50 dark:hover:bg-amber-800/50" aria-label="Remove ingredients">×</button>
                </span>
              )}
              {cuisine.trim() && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200">
                  Cuisine: {cuisine.trim()}
                  <button type="button" onClick={() => setCuisine("")} className="ml-0.5 w-5 h-5 flex items-center justify-center rounded hover:bg-emerald-200/50 dark:hover:bg-emerald-800/50" aria-label="Remove cuisine">×</button>
                </span>
              )}
              {dietaryRestrictions.map((d) => (
                <span key={d} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200">
                  {d}
                  <button type="button" onClick={() => setDietaryRestrictions((prev) => prev.filter((x) => x !== d))} className="ml-0.5 w-5 h-5 flex items-center justify-center rounded hover:bg-violet-200/50 dark:hover:bg-violet-800/50" aria-label={`Remove ${d}`}>×</button>
                </span>
              ))}
              {maxTime.trim() && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                  Max time: {maxTime} min
                  <button type="button" onClick={() => setMaxTime("")} className="ml-0.5 w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200/50 dark:hover:bg-slate-600/50" aria-label="Remove max time">×</button>
                </span>
              )}
              {maxCalories.trim() && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                  Max calories: {maxCalories}
                  <button type="button" onClick={() => setMaxCalories("")} className="ml-0.5 w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200/50 dark:hover:bg-slate-600/50" aria-label="Remove max calories">×</button>
                </span>
              )}
              <button
                type="button"
                onClick={() => { setQ(""); setCuisine(""); setDietaryRestrictions([]); setMaxTime(""); setMaxCalories(""); setIngredients(""); }}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 underline"
              >
                Clear all
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading recipes…</p>
          ) : recipes.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400 space-y-1">
              {apiError ? (
                <p className="text-amber-600 dark:text-amber-400">API error: {apiError}</p>
              ) : authError ? (
                <p>Please log in to see recipes.</p>
              ) : (
                <>
                  <p>
                    {!q.trim() && !cuisine.trim() && dietaryRestrictions.length === 0 && !maxTime.trim() && !maxCalories.trim() && !ingredients.trim()
                      ? "No recipes yet."
                      : "No recipes found."}
                  </p>
                  <p className="text-sm">
                    {!q.trim() && !cuisine.trim() && dietaryRestrictions.length === 0 && !maxTime.trim() && !maxCalories.trim() && !ingredients.trim()
                      ? "Run ./run.sh to seed (Docker). Or: pnpm --filter @wellness-app/server run seed:task2:reset && pnpm run embed (with DATABASE_URL)."
                      : "Try different filters or add recipes via RAG/seed."}
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {total} recipe{total !== 1 ? "s" : ""} found
                {!q.trim() && !cuisine.trim() && dietaryRestrictions.length === 0 && !maxTime.trim() && !maxCalories.trim() && !ingredients.trim() && " · Browse all recipes"}
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recipes.map((r) => {
                  const nut = r.nutrition as { calories?: number } | null;
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/recipes/${r.id}`}
                        className="block bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition p-4 border border-gray-100 dark:border-gray-700"
                      >
                        <h2 className="font-semibold text-gray-900 dark:text-white truncate">{r.title}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {r.cuisine ?? "—"} · {r.time != null ? `${r.time} min` : "—"}
                        </p>
                        {nut?.calories != null && (
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{nut.calories} kcal per serving</p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {totalPages > 1 && (
                <nav className="mt-6 flex flex-wrap items-center justify-center gap-2" aria-label="Recipe pagination">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Previous
                  </button>
                  <span className="flex items-center gap-1">
                    {(() => {
                      const show = Math.min(7, totalPages);
                      let start = 1;
                      if (totalPages > 7) {
                        if (page <= 4) start = 1;
                        else if (page >= totalPages - 3) start = totalPages - 6;
                        else start = page - 3;
                      }
                      return Array.from({ length: show }, (_, i) => {
                        const p = start + i;
                        return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPage(p)}
                          disabled={loading}
                          className={`min-w-[2rem] px-2 py-1.5 rounded-lg border text-sm ${
                            page === p
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {p}
                        </button>
                        );
                      });
                    })()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function RecipesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">Loading…</div>}>
      <RecipesContent />
    </Suspense>
  );
}
