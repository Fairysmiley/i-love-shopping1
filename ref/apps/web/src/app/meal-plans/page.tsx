"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { toast } from "@/lib/notification-manager";

/** Max total eating occasions per day in the meal-structure UI (matches generator: at most B/L/D + snacks). */
const MEAL_PLAN_TOTAL_MEALS_MIN = 2;
const MEAL_PLAN_TOTAL_MEALS_MAX = 6;
/** Snacks/day is always 0–2 in the UI; server clamps to min(2, total−1). */
const MEAL_PLAN_SNACKS_MAX = 2;
const MEAL_PLAN_SNACKS_OPTIONS = [0, 1, 2] as const;

/** Browser fetch timeout per attempt (AbortController). Weekly can exceed 20m on slow CPU + day-by-day fallback after weekly JSON timeout. */
const MEAL_PLAN_CLIENT_TIMEOUT_DAILY_MS = 3600000; // 60m
const MEAL_PLAN_CLIENT_TIMEOUT_WEEKLY_MS = 3600000; // 60m
const MEAL_PLAN_TIMEOUT_RETRY_ATTEMPTS = 2; // One automatic retry on timeout.

function mealPlanClientTimeoutMs(duration: "daily" | "weekly"): number {
  return duration === "weekly" ? MEAL_PLAN_CLIENT_TIMEOUT_WEEKLY_MS : MEAL_PLAN_CLIENT_TIMEOUT_DAILY_MS;
}

function apiErrorMessage(
  res: Response,
  data: { message?: string; error?: string },
  fallback: string
): string {
  if (res.status === 401) {
    return "Sign in to use the shopping list. If you were signed in, your session may have expired—sign in again.";
  }
  return data.message || data.error || fallback;
}

function clampSnacksForTotal(totalMeals: number, snacks: number): number {
  const t = Math.max(MEAL_PLAN_TOTAL_MEALS_MIN, Math.min(MEAL_PLAN_TOTAL_MEALS_MAX, Math.round(totalMeals)));
  const max = Math.min(MEAL_PLAN_SNACKS_MAX, t - 1);
  return Math.min(max, Math.max(0, Math.round(snacks)));
}

/** Server may use type `main` for an extra substantial meal (not breakfast/lunch/dinner, not a small snack). */
function formatMealTypeLabel(type: string | undefined): string {
  const t = String(type ?? "snack").toLowerCase();
  if (t === "main") return "Main meal";
  return String(type ?? "snack");
}

/** Human-readable meal label (saved plans may link a recipe or use customData only). */
function mealDisplayName(m: { recipe?: { title?: string } | null; customData?: unknown }): string {
  const custom = m.customData as { name?: string } | undefined;
  const customName = typeof custom?.name === "string" ? custom.name.trim() : "";
  // Prefer explicit custom name (replace / generate) over linked recipe title — fuzzy recipeId match can keep an unrelated title.
  if (customName) return customName;
  return m.recipe?.title ?? "Meal";
}

function MealPlansContent() {
  const router = useRouter();
  const savedPlanSectionRef = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** When the API used the deterministic meal-plan fallback, we show hints here (not in a long toast). */
  const [aiFallbackHints, setAiFallbackHints] = useState<string[]>([]);
  /** Short server-side error (e.g. connection refused, 404 model) so users are not blind to instant fallbacks. */
  const [aiFallbackReason, setAiFallbackReason] = useState<string | null>(null);
  const [showAiDetails, setShowAiDetails] = useState(false);
  const [planDate, setPlanDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [duration, setDuration] = useState<"daily" | "weekly">("daily");
  const [nutritionTargetSource, setNutritionTargetSource] = useState<"user" | "ai">("user");
  /** Total eating occasions per day; snacks count is included in this total (not added on top). */
  const [totalMealsPerDay, setTotalMealsPerDay] = useState(4);
  const [snacksPerDay, setSnacksPerDay] = useState(1);
  type GenMeal = { type: string; name: string; calories: number; macros: { protein: number; carbs: number; fats: number }; description?: string };
  const [generated, setGenerated] = useState<{
    strategy: string;
    structure: string;
    plan: { meals?: GenMeal[]; days?: { date: string; meals: GenMeal[] }[] };
    analysis?: {
      nutritionTargetSource: "user" | "ai";
      targets: { calories: number; protein: number; carbs: number; fats: number };
      days: Array<{
        date: string;
        totals: { calories: number; protein: number; carbs: number; fats: number };
        gap: { calories: number; protein: number; carbs: number; fats: number };
        withinTarget: boolean;
      }>;
      refinementSummary: string;
    };
  } | null>(null);
  const [savedPlan, setSavedPlan] = useState<any>(null);
  const [shoppingList, setShoppingList] = useState<any>(null);
  const [viewDate, setViewDate] = useState(planDate);
  const [savedPlansList, setSavedPlansList] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [replaceModal, setReplaceModal] = useState<{ mealId: string; name: string; type: string; calories: number; macros: { protein: number; carbs: number; fats: number } } | null>(null);
  const [addMealOpen, setAddMealOpen] = useState(false);
  const [swapTargetDate, setSwapTargetDate] = useState<string | null>(null);
  const [otherDayPlan, setOtherDayPlan] = useState<any>(null);
  const [alternativesModal, setAlternativesModal] = useState<{
    mealId: string;
    loading: boolean;
    alternatives: Array<{
      name: string;
      type: string;
      calories: number;
      macros: { protein: number; carbs: number; fats: number };
      description?: string;
      ingredients?: Array<{ name: string; quantity: number; unit: string }>;
    }>;
  } | null>(null);
  const [newShopName, setNewShopName] = useState("");
  const [newShopQty, setNewShopQty] = useState("1");
  const [newShopUnit, setNewShopUnit] = useState("g");
  const [addingShopItem, setAddingShopItem] = useState(false);
  const [regeneratingMealId, setRegeneratingMealId] = useState<string | null>(null);
  const [loggingMealId, setLoggingMealId] = useState<string | null>(null);
  const [logMealFeedback, setLogMealFeedback] = useState<string | null>(null);

  useEffect(() => {
    setSnacksPerDay((s) => clampSnacksForTotal(totalMealsPerDay, s));
  }, [totalMealsPerDay]);

  /** Contiguous 7-day saved block containing viewDate (for regenerate-whole-week action). */
  const weekContext = (() => {
    if (savedPlansList.length < 7) return null;
    const dates = savedPlansList.map((p: any) => (typeof p.date === "string" ? p.date.slice(0, 10) : new Date(p.date).toISOString().slice(0, 10))).sort();
    for (let i = 0; i <= dates.length - 7; i++) {
      const run = dates.slice(i, i + 7);
      const start = new Date(run[0] + "T12:00:00.000Z").getTime();
      const expected = run.map((_, j) => new Date(start + j * 86400000).toISOString().slice(0, 10));
      if (run.every((d, j) => d === expected[j]) && run.includes(viewDate)) {
        const first = new Date(run[0] + "T12:00:00.000Z");
        return {
          startDate: run[0],
          label: first.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
        };
      }
    }
    return null;
  })();

  const extractPlanForDate = (result: unknown, date: string): typeof savedPlan => {
    if (Array.isArray(result)) {
      const dateStr = date.slice(0, 10);
      return result.find((p: { date?: string }) =>
        p.date && new Date(p.date).toISOString().slice(0, 10) === dateStr
      ) ?? null;
    }
    return (result as typeof savedPlan) ?? null;
  };

  const fetchPlanForDate = async (date: string, options?: { cacheBust?: boolean; silent?: boolean }) => {
    if (!options?.silent) setLoadingPlan(true);
    try {
      const url = options?.cacheBust
        ? `/api/meal-plan?date=${encodeURIComponent(date)}&_=${Date.now()}`
        : `/api/meal-plan?date=${encodeURIComponent(date)}`;
      const res = await fetch(url, {
        credentials: "include",
        ...(options?.cacheBust ? { cache: "no-store" } : {}),
      });
      if (!res.ok) {
        setSavedPlan(null);
        setShoppingList(null);
        return;
      }
      const data = await res.json();
      const plan = extractPlanForDate(data.data, date);
      setSavedPlan(plan);
      setShoppingList(plan?.shoppingList ?? null);
    } catch {
      setSavedPlan(null);
      setShoppingList(null);
    } finally {
      if (!options?.silent) setLoadingPlan(false);
    }
  };

  const fetchSavedPlansList = async () => {
    try {
      // Keep a wider window so saving plans in future weeks (e.g., next month) remains visible.
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 120);
      to.setDate(to.getDate() + 180);
      const res = await fetch(
        `/api/meal-plan?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setSavedPlansList(Array.isArray(data.data) ? data.data : []);
    } catch {
      setSavedPlansList([]);
    }
  };

  useEffect(() => {
    fetchPlanForDate(viewDate);
  }, [viewDate]);

  useEffect(() => {
    fetchSavedPlansList();
  }, [savedPlan, viewDate]);

  const fetchVersions = async (date: string) => {
    try {
      const res = await fetch(`/api/meal-plan/versions?date=${encodeURIComponent(date)}`);
      if (!res.ok) return;
      const data = await res.json();
      setVersions(Array.isArray(data.data) ? data.data : []);
    } catch {
      setVersions([]);
    }
  };

  useEffect(() => {
    if (savedPlan?.id && viewDate) fetchVersions(viewDate);
    else setVersions([]);
  }, [savedPlan?.id, viewDate]);

  useEffect(() => {
    if (!swapTargetDate || swapTargetDate === viewDate) {
      setOtherDayPlan(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/meal-plan?date=${encodeURIComponent(swapTargetDate)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setOtherDayPlan(extractPlanForDate(data.data, swapTargetDate));
      } catch {
        if (!cancelled) setOtherDayPlan(null);
      }
    })();
    return () => { cancelled = true; };
  }, [swapTargetDate, viewDate]);

  const generatePlanWithTimeoutRetry = async (payload: {
    date: string;
    duration: "daily" | "weekly";
    nutritionTargetSource: "user" | "ai";
    mealsPerDay: number;
    snacksPerDay: number;
  }) => {
    const clientTimeoutMs = mealPlanClientTimeoutMs(payload.duration);

    for (let attempt = 1; attempt <= MEAL_PLAN_TIMEOUT_RETRY_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), clientTimeoutMs);
      try {
        const res = await fetch("/api/meal-plan/generate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 429) {
            const retry =
              typeof data.retryAfter === "number"
                ? ` Try again in ${data.retryAfter}s.`
                : "";
            throw new Error(
              (data.message || data.error || "Too many requests.") + retry
            );
          }
          throw new Error(data.error || "Failed to generate");
        }
        return {
          mealPlan: data.data,
          fallbackUsed: Boolean(data.fallbackUsed),
          message: typeof data.message === "string" ? data.message : undefined,
          fallbackHints: Array.isArray(data.fallbackHints)
            ? (data.fallbackHints as unknown[]).filter((h): h is string => typeof h === "string")
            : [],
          fallbackReason: typeof data.fallbackReason === "string" ? data.fallbackReason : undefined,
        };
      } catch (e) {
        const isTimeout = e instanceof Error && e.name === "AbortError";
        if (isTimeout && attempt < MEAL_PLAN_TIMEOUT_RETRY_ATTEMPTS) {
          // Cold starts can time out on the first call; retry once automatically.
          await new Promise((resolve) => setTimeout(resolve, 1200));
          continue;
        }
        throw e;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw new Error("Failed to generate");
  };

  const handleGenerate = async () => {
    setError(null);
    setGenerated(null);
    setAiFallbackHints([]);
    setAiFallbackReason(null);
    setShowAiDetails(false);
    setLoading(true);
    try {
      const { mealPlan, fallbackUsed, message, fallbackHints, fallbackReason } = await generatePlanWithTimeoutRetry({
        date: planDate,
        duration,
        nutritionTargetSource,
        mealsPerDay: Number(totalMealsPerDay),
        snacksPerDay: Number(snacksPerDay),
      });
      setGenerated(mealPlan);
      if (fallbackUsed) {
        setAiFallbackHints(fallbackHints);
        setAiFallbackReason(fallbackReason ?? null);
        toast.warning(
          (message ||
            "Meal plan was built using a recovery fallback because the AI service had a temporary issue.") +
            " Troubleshooting tips are shown below the plan."
        );
      }
    } catch (e) {
      const clientTimeoutMs = mealPlanClientTimeoutMs(duration);
      if (e instanceof Error) {
        if (e.name === "AbortError") {
          setError(
            `Request timed out after retry (${Math.round(clientTimeoutMs / 1000)}s each attempt). Ollama may still be cold-starting; try again, increase MEAL_PLAN_OLLAMA_MS, or pull the same tag as OLLAMA_MODEL: docker exec wellness-ollama ollama pull <tag> (see .env / docker-compose).`
          );
        } else {
          setError(e.message);
        }
      } else {
        setError("Failed to generate meal plan");
      }
    } finally {
      setLoading(false);
    }
  };

  /** Regenerate from saved-plan actions: preserves nutrition target source and meal structure from the form. */
  const runRegenerateFromSavedSection = async (params: { duration: "daily" | "weekly"; date: string }) => {
    setPlanDate(params.date);
    setDuration(params.duration);
    setError(null);
    setGenerated(null);
    setAiFallbackHints([]);
    setAiFallbackReason(null);
    setShowAiDetails(false);
    setLoading(true);
    try {
      const { mealPlan, fallbackUsed, message, fallbackHints, fallbackReason } = await generatePlanWithTimeoutRetry({
        date: params.date,
        duration: params.duration,
        nutritionTargetSource,
        mealsPerDay: Number(totalMealsPerDay),
        snacksPerDay: Number(snacksPerDay),
      });
      setGenerated(mealPlan);
      if (fallbackUsed) {
        setAiFallbackHints(fallbackHints);
        setAiFallbackReason(fallbackReason ?? null);
        toast.warning(
          (message || "Meal plan was built using a recovery fallback because the AI service had a temporary issue.") +
            " Tips below the plan."
        );
      }
    } catch (e) {
      const clientTimeoutMs = mealPlanClientTimeoutMs(params.duration);
      if (e instanceof Error && e.name === "AbortError") {
        setError(
          `Request timed out after retry (${Math.round(clientTimeoutMs / 1000)}s each attempt). Regeneration may be cold-starting on CPU; try again or raise MEAL_PLAN_OLLAMA_MS.`
        );
      } else {
        setError(e instanceof Error ? e.message : "Failed to regenerate");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!generated?.plan) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/meal-plan/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: planDate, plan: generated.plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || "Failed to save";
        throw new Error(res.status === 401 ? "Please log in to save plans (e.g. tester@wellness.app / testerpassword123 in dev)." : msg);
      }
      setViewDate(planDate);
      if (Array.isArray(data.data)) {
        setSavedPlan(null);
        fetchPlanForDate(planDate);
      } else {
        setSavedPlan(data.data);
      }
      setGenerated(null);
      fetchSavedPlansList();
      toast.success("Meal plan saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateShoppingList = async (mealIds?: string[]) => {
    if (!savedPlan?.id) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/meal-plan/shopping-list", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealPlanId: savedPlan.id,
          ...(mealIds && mealIds.length > 0 ? { mealIds } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(res, data, "Failed to generate shopping list"));
      }
      setShoppingList(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate shopping list");
    } finally {
      setLoading(false);
    }
  };

  const updateListItem = async (
    itemId: string,
    updates: {
      quantity?: number;
      excluded?: boolean;
      checked?: boolean;
      ingredientName?: string;
      unit?: string;
    }
  ) => {
    if (!itemId) return;
    try {
      const res = await fetch(`/api/meal-plan/shopping-list/${itemId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok && shoppingList) {
        setShoppingList((prev: any) => ({
          ...prev,
          items: prev.items.map((i: any) => (i.id === itemId ? { ...i, ...updates } : i)),
        }));
      } else if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(res, data, "Failed to update item"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update item");
    }
  };

  const handleAddShoppingListItem = async () => {
    if (!savedPlan?.id || !newShopName.trim()) return;
    setAddingShopItem(true);
    setError(null);
    try {
      const qty = Number.parseFloat(newShopQty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Enter a positive quantity");
      const res = await fetch("/api/meal-plan/shopping-list/items", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealPlanId: savedPlan.id,
          ingredientName: newShopName.trim(),
          quantity: qty,
          unit: newShopUnit.trim() || "g",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(res, data, "Failed to add item"));
      }
      setNewShopName("");
      setNewShopQty("1");
      setNewShopUnit("g");
      await fetchPlanForDate(viewDate, { cacheBust: true, silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add item");
    } finally {
      setAddingShopItem(false);
    }
  };

  const handleReplaceMeal = async (
    mealId: string,
    payload: {
      name: string;
      type: string;
      calories: number;
      macros: { protein: number; carbs: number; fats: number };
      description?: string;
      ingredients?: Array<{ name: string; quantity: number; unit: string }>;
    }
  ) => {
    setError(null);
    try {
      const res = await fetch(`/api/meal-plan/meals/${mealId}/replace`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to replace meal");
      }
      setReplaceModal(null);
      setAlternativesModal(null);
      await fetchPlanForDate(viewDate, { cacheBust: true, silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to replace meal");
    }
  };

  const handleOpenAlternatives = async (mealId: string) => {
    setError(null);
    setAlternativesModal({ mealId, loading: true, alternatives: [] });
    try {
      const res = await fetch(`/api/meal-plan/meals/${encodeURIComponent(mealId)}/alternatives`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load alternatives");
      setAlternativesModal({ mealId, loading: false, alternatives: data.data ?? [] });
    } catch (e) {
      setAlternativesModal(null);
      setError(e instanceof Error ? e.message : "Failed to load alternatives");
    }
  };

  const handleReorder = async (fromIndex: number, direction: "up" | "down") => {
    if (!savedPlan?.meals?.length) return;
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= savedPlan.meals.length) return;
    const reordered = [...savedPlan.meals];
    const [removed] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, removed);
    const mealOrder = reordered.map((m: any, i: number) => ({ mealId: m.id, order: i }));
    setError(null);
    try {
      const res = await fetch("/api/meal-plan/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealPlanId: savedPlan.id, mealOrder }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reorder");
      }
      const data = await res.json();
      if (data.data?.meals) setSavedPlan((p: any) => (p ? { ...p, meals: data.data.meals } : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reorder");
    }
  };

  const handleAddMeal = async (payload: { type: string; name: string; calories: number; macros: { protein: number; carbs: number; fats: number }; description?: string }) => {
    if (!savedPlan?.id) return;
    setError(null);
    try {
      const res = await fetch("/api/meal-plan/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealPlanId: savedPlan.id, ...payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add meal");
      }
      setAddMealOpen(false);
      fetchPlanForDate(viewDate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add meal");
    }
  };

  const handleRestoreVersion = async (mealPlanId: string) => {
    setError(null);
    try {
      const res = await fetch("/api/meal-plan/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealPlanId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to restore");
      }
      const data = await res.json();
      setSavedPlan(data.data);
      setShoppingList(data.data?.shoppingList ?? null);
      fetchVersions(viewDate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restore");
    }
  };

  const handleRegenerateMeal = async (mealId: string) => {
    setError(null);
    setRegeneratingMealId(mealId);
    try {
      const res = await fetch(`/api/meal-plan/meals/${encodeURIComponent(mealId)}/regenerate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to regenerate meal");
      const meal = data.data;
      if (!meal?.name || meal.calories == null) throw new Error("Invalid meal returned");
      const macros = meal.macros && typeof meal.macros === "object"
        ? { protein: Number(meal.macros.protein) || 0, carbs: Number(meal.macros.carbs) || 0, fats: Number(meal.macros.fats) || 0 }
        : { protein: 0, carbs: 0, fats: 0 };
      const replacePayload = {
        name: String(meal.name),
        type: meal.type ?? "snack",
        calories: Number(meal.calories) || 0,
        macros,
        description: meal.description,
        ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : undefined,
      };
      const replaceRes = await fetch(`/api/meal-plan/meals/${encodeURIComponent(mealId)}/replace`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replacePayload),
      });
      const replaceData = await replaceRes.json().catch(() => ({}));
      if (!replaceRes.ok) throw new Error(replaceData.error || "Failed to apply regenerated meal");
      await fetchPlanForDate(viewDate, { cacheBust: true, silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to regenerate meal");
    } finally {
      setRegeneratingMealId(null);
    }
  };

  const handleLogFromMeal = async (mealId: string) => {
    setError(null);
    setLogMealFeedback(null);
    setLoggingMealId(mealId);
    try {
      const res = await fetch("/api/nutrition/log-from-meal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealId, date: viewDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorMessage(res, data, "Could not log this meal"));
      setLogMealFeedback(`Logged to Nutrition for ${viewDate}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log this meal");
    } finally {
      setLoggingMealId(null);
    }
  };

  const handleSwapMeals = async (mealIdA: string, mealIdB: string) => {
    setError(null);
    try {
      const res = await fetch("/api/meal-plan/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealIdA, mealIdB }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to swap");
      }
      const data = await res.json();
      const planA = data.data?.planA;
      const planB = data.data?.planB;
      const planADate = planA?.date ? new Date(planA.date).toISOString().slice(0, 10) : "";
      const viewPlan = planADate === viewDate ? planA : planB;
      const otherPlan = planADate === viewDate ? planB : planA;
      setSavedPlan(viewPlan ?? savedPlan);
      setShoppingList(viewPlan?.shoppingList ?? shoppingList ?? null);
      if (swapTargetDate && otherPlan) setOtherDayPlan(otherPlan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to swap meals");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      <Sidebar />
      <main className="flex-1 md:ml-64 px-4 sm:px-6 lg:px-8 py-8 pt-16 md:pt-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Meal Plans</h1>

          {error && (
            <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm">
              {error}
            </div>
          )}
          {logMealFeedback && (
            <div className="mb-4 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{logMealFeedback}</span>
              <Link href="/nutrition" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                Open Nutrition
              </Link>
              <button type="button" onClick={() => setLogMealFeedback(null)} className="text-sm text-gray-600 dark:text-gray-400 hover:underline">
                Dismiss
              </button>
            </div>
          )}

          {/* Generate new plan */}
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Generate meal plan</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5 xl:items-start">
              <div className="min-w-0 flex flex-col">
                <label className="mb-1 flex h-5 items-end text-sm font-medium text-gray-700 dark:text-gray-300">
                  Date
                </label>
                <input
                  type="date"
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400"
                />
                <div className="mt-1 h-4 shrink-0" aria-hidden />
              </div>
              <div className="min-w-0 flex flex-col">
                <label className="mb-1 flex h-5 items-end text-sm font-medium text-gray-700 dark:text-gray-300">
                  Duration
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value as "daily" | "weekly")}
                  className="h-10 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
                <div className="mt-1 h-4 shrink-0" aria-hidden />
              </div>
              <div className="min-w-0 flex flex-col">
                <label className="mb-1 flex h-5 items-end text-sm font-medium text-gray-700 dark:text-gray-300">
                  Target source
                </label>
                <select
                  value={nutritionTargetSource}
                  onChange={(e) => setNutritionTargetSource(e.target.value as "user" | "ai")}
                  className="h-10 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400"
                >
                  <option value="user">Use profile targets</option>
                  <option value="ai">AI suggested targets</option>
                </select>
                <div className="mt-1 h-4 shrink-0" aria-hidden />
              </div>
              <div className="min-w-0 flex flex-col md:col-span-2 xl:col-span-1">
                <p
                  id="meal-structure-label"
                  className="mb-1 flex h-5 items-end text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Meal structure
                </p>
                <div
                  className="grid grid-cols-2 gap-x-2 gap-y-1"
                  role="group"
                  aria-labelledby="meal-structure-label"
                >
                  <label htmlFor="meal-plan-total-meals" className="sr-only">
                    Total meals per day (includes snacks in this count)
                  </label>
                  <select
                    id="meal-plan-total-meals"
                    value={totalMealsPerDay}
                    onChange={(e) => setTotalMealsPerDay(Number(e.target.value))}
                    className="col-span-1 row-start-1 h-10 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400"
                  >
                    {Array.from(
                      { length: MEAL_PLAN_TOTAL_MEALS_MAX - MEAL_PLAN_TOTAL_MEALS_MIN + 1 },
                      (_, i) => i + MEAL_PLAN_TOTAL_MEALS_MIN
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="meal-plan-snacks" className="sr-only">
                    Snacks per day within the total
                  </label>
                  <select
                    id="meal-plan-snacks"
                    value={snacksPerDay}
                    onChange={(e) =>
                      setSnacksPerDay(clampSnacksForTotal(totalMealsPerDay, Number(e.target.value)))
                    }
                    className="col-span-1 row-start-1 h-10 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400"
                  >
                    {MEAL_PLAN_SNACKS_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span className="col-span-1 row-start-2 flex h-4 items-start text-xs leading-4 text-gray-600 dark:text-gray-400">
                    Total/day
                  </span>
                  <span className="col-span-1 row-start-2 flex h-4 items-start text-xs leading-4 text-gray-600 dark:text-gray-400">
                    Snacks/day
                  </span>
                </div>
              </div>
              <div className="min-w-0 flex flex-col">
                <div className="mb-1 h-5 shrink-0" aria-hidden />
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading}
                  className="h-10 w-full whitespace-nowrap rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 xl:w-auto"
                >
                  {loading ? "Generating…" : "Generate plan"}
                </button>
                <div className="mt-1 h-4 shrink-0" aria-hidden />
              </div>
            </div>
            <p className="mt-2 max-w-full break-words text-xs text-gray-600 dark:text-gray-400">
              Total/day counts every eating occasion (2–6). Snacks/day is always 0–2 and counts toward that total (for example,
              6 total with 2 snacks means breakfast, lunch, dinner, one extra main-style slot labeled Main meal, then two snacks).
              If you lower total/day, snacks may clamp down so you always have at least one non-snack slot. Weekly plans may take a
              long time to generate.
            </p>

            {generated && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                {aiFallbackHints.length > 0 || aiFallbackReason ? (
                  <div
                    className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                    role="status"
                  >
                    <p className="font-medium">Recovery plan — AI did not finish; this is the template fallback.</p>
                    {aiFallbackReason ? (
                      <p className="mt-2 break-words rounded bg-amber-100/80 px-2 py-1 font-mono text-xs dark:bg-amber-900/50">
                        {aiFallbackReason}
                      </p>
                    ) : null}
                    {aiFallbackHints.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs sm:text-sm">
                        {aiFallbackHints.map((h) => (
                          <li key={h}>{h}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-2 text-xs opacity-90">
                      Check the server log for the line starting with{" "}
                      <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/80">[Meal Plan API] Primary AI generation failed</code>{" "}
                      to see the underlying error (timeout, connection, parse, etc.).
                    </p>
                  </div>
                ) : null}
                {generated.plan.days ? (
                  <div className="space-y-6 mb-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Weekly plan — one day per section</p>
                    {generated.plan.days.map((day) => {
                      const d = new Date(day.date + "T12:00:00.000Z");
                      const dayLabel = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
                      return (
                        <div key={day.date} className="rounded-lg border border-gray-200 dark:border-gray-600 p-4 bg-gray-50 dark:bg-gray-700/50">
                          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{dayLabel} — {day.date}</h3>
                          <div className="flex flex-wrap gap-2">
                            {day.meals.map((m, i) => (
                              <span
                                key={i}
                                className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm"
                              >
                                {formatMealTypeLabel(m.type)}: {m.name} ({m.calories} kcal)
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(generated.plan.meals ?? []).map((m, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm"
                      >
                        {formatMealTypeLabel(m.type)}: {m.name} ({m.calories} kcal)
                      </span>
                    ))}
                  </div>
                )}
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => setShowAiDetails((v) => !v)}
                    className="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {showAiDetails ? "Hide AI details" : "Show AI details"}
                  </button>
                </div>
                {showAiDetails && (
                  <>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Strategy text is advisory AI rationale. Use the plan meals and numeric analysis below as the authoritative values.
                    </p>
                    {generated.analysis && (
                      <div className="mb-4 text-xs text-gray-600 dark:text-gray-400">
                        <p>
                          Targets ({generated.analysis.nutritionTargetSource === "ai" ? "AI" : "profile"}):{" "}
                          {generated.analysis.targets.calories} kcal, P {generated.analysis.targets.protein}g, C {generated.analysis.targets.carbs}g, F {generated.analysis.targets.fats}g
                        </p>
                        <p className="whitespace-pre-wrap break-words">{generated.analysis.refinementSummary}</p>
                      </div>
                    )}
                  </>
                )}
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  Save this plan
                </button>
              </div>
            )}
          </section>

          {/* Your saved plans (multiple dates) */}
          {savedPlansList.length > 0 && (
            <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Your saved plans</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                You have {savedPlansList.length} saved plan{savedPlansList.length !== 1 ? "s" : ""}. Click a date to view it, or generate and save a plan for another date above.
              </p>
              <ul className="flex flex-wrap gap-2">
                {savedPlansList.map((p: any) => {
                  const dateKey = typeof p.date === "string" ? p.date.slice(0, 10) : new Date(p.date).toISOString().slice(0, 10);
                  const mealCount = p.meals?.length ?? 0;
                  const dates = savedPlansList.map((x: any) => (typeof x.date === "string" ? x.date.slice(0, 10) : new Date(x.date).toISOString().slice(0, 10))).sort();
                  const isStartOfWeek = (() => {
                    if (dates.length < 7) return false;
                    const idx = dates.indexOf(dateKey);
                    if (idx < 0 || idx > dates.length - 7) return false;
                    const run = dates.slice(idx, idx + 7);
                    const start = new Date(run[0] + "T12:00:00.000Z").getTime();
                    return run.every((d, j) => d === new Date(start + j * 86400000).toISOString().slice(0, 10));
                  })();
                  return (
                    <li key={p.id} className="flex flex-col items-start">
                      <button
                        type="button"
                        onClick={() => {
                          setViewDate(dateKey);
                          savedPlanSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          viewDate === dateKey
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
                        }`}
                      >
                        {dateKey} ({mealCount} meals)
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* View saved plan by date */}
          <section ref={savedPlanSectionRef} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Saved plan for {viewDate}
            </h2>
            <div className="flex flex-wrap gap-4 items-end mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">View date</label>
                <input
                  type="date"
                  value={viewDate}
                  onChange={(e) => setViewDate(e.target.value)}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Swap with another day</label>
                <select
                  value={swapTargetDate ?? ""}
                  onChange={(e) => setSwapTargetDate(e.target.value || null)}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                >
                  <option value="">— Select day —</option>
                  {savedPlansList
                    .map((p: any) => (typeof p.date === "string" ? p.date.slice(0, 10) : new Date(p.date).toISOString().slice(0, 10)))
                    .filter((d: string) => d !== viewDate)
                    .filter((d: string, i: number, arr: string[]) => arr.indexOf(d) === i)
                    .sort()
                    .map((d: string) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                </select>
              </div>
            </div>
            {loadingPlan ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">Loading plan…</p>
            ) : savedPlan ? (
              <div>
                <ul className="space-y-2">
                  {(savedPlan.meals ?? []).map((m: any, idx: number) => (
                    <li key={m.id} className="group flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0 gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex flex-col">
                          <button type="button" onClick={() => handleReorder(idx, "up")} disabled={idx === 0} className="text-gray-500 hover:text-gray-700 disabled:opacity-30 p-0.5" aria-label="Move up">↑</button>
                          <button type="button" onClick={() => handleReorder(idx, "down")} disabled={idx === (savedPlan.meals?.length ?? 0) - 1} className="text-gray-500 hover:text-gray-700 disabled:opacity-30 p-0.5" aria-label="Move down">↓</button>
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white shrink-0">{formatMealTypeLabel(m.type)}</span>
                        <span
                          className="text-gray-600 dark:text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap group-hover:overflow-visible group-hover:text-clip group-hover:whitespace-normal"
                          title={`${mealDisplayName(m)} — ${(m.nutrition as any)?.calories ?? 0} kcal${(m.nutrition as any)?.protein != null ? ` (P ${(m.nutrition as any).protein}g C ${(m.nutrition as any).carbs}g F ${(m.nutrition as any).fats}g)` : ""}`}
                        >
                          {m.recipe?.id ? (
                            <Link href={`/recipes/${m.recipe.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                              {mealDisplayName(m)}
                            </Link>
                          ) : (
                            <>{mealDisplayName(m)}</>
                          )}{" "}
                          — {(m.nutrition as any)?.calories ?? 0} kcal
                          {((m.nutrition as any)?.protein != null) && ` (P ${(m.nutrition as any).protein}g C ${(m.nutrition as any).carbs}g F ${(m.nutrition as any).fats}g)`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {otherDayPlan?.meals?.length ? (
                          <select
                            className="text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white py-1 pr-6"
                            defaultValue=""
                            onChange={(e) => {
                              const otherId = e.target.value;
                              if (otherId) {
                                handleSwapMeals(m.id, otherId);
                                e.target.value = "";
                              }
                            }}
                          >
                            <option value="">Swap with…</option>
                            {(otherDayPlan.meals as any[]).map((om: any) => (
                              <option key={om.id} value={om.id}>
                                {formatMealTypeLabel(om.type)}: {mealDisplayName(om)}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleLogFromMeal(m.id)}
                          disabled={loggingMealId !== null}
                          className="text-sm text-teal-700 dark:text-teal-300 hover:underline disabled:opacity-50"
                        >
                          {loggingMealId === m.id ? "Logging…" : "Log intake"}
                        </button>
                        <button type="button" onClick={() => handleOpenAlternatives(m.id)} disabled={!!alternativesModal?.loading} className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50">Alternatives</button>
                        <button type="button" onClick={() => handleRegenerateMeal(m.id)} disabled={regeneratingMealId !== null} className="text-sm text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50">{regeneratingMealId === m.id ? "Regenerating…" : "Regenerate"}</button>
                        <button type="button" onClick={() => setReplaceModal({ mealId: m.id, name: mealDisplayName(m), type: m.type, calories: (m.nutrition as any)?.calories ?? 0, macros: { protein: (m.nutrition as any)?.protein ?? 0, carbs: (m.nutrition as any)?.carbs ?? 0, fats: (m.nutrition as any)?.fats ?? 0 } })} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Replace</button>
                        <button
                          type="button"
                          onClick={() => handleGenerateShoppingList([m.id])}
                          disabled={loading}
                          className="text-sm text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-50"
                        >
                          List from this meal
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button type="button" onClick={() => setAddMealOpen(true)} className="px-4 py-2 rounded-lg bg-slate-600 text-white font-medium hover:bg-slate-700">Add meal</button>
                  <button
                    type="button"
                    onClick={() => handleGenerateShoppingList()}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
                  >
                    {loading ? "Generating…" : "Generate shopping list"}
                  </button>
                  <button
                    type="button"
                    onClick={() => runRegenerateFromSavedSection({ duration: "daily", date: viewDate })}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-50"
                  >
                    Regenerate this day
                  </button>
                  {weekContext && (
                    <button
                      type="button"
                      onClick={() => runRegenerateFromSavedSection({ duration: "weekly", date: weekContext.startDate })}
                      disabled={loading}
                      className="px-4 py-2 rounded-lg bg-violet-800 text-white font-medium hover:bg-violet-900 disabled:opacity-50"
                      title="Regenerate all 7 days from the week start; save to replace the week."
                    >
                      Regenerate this week
                    </button>
                  )}
                </div>
                {versions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Content versioning</h3>
                    <ul className="space-y-1 text-sm">
                      {versions.map((v: any) => (
                        <li key={v.id} className="flex items-center justify-between gap-2">
                          <span className="text-gray-600 dark:text-gray-400">Version {v.version} — {v.createdAt ? new Date(v.createdAt).toLocaleString() : ""}{v.isActive ? " (current)" : ""}</span>
                          {!v.isActive && <button type="button" onClick={() => handleRestoreVersion(v.id)} className="text-blue-600 dark:text-blue-400 hover:underline">Restore</button>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No plan saved for this date. Generate and save one above.</p>
            )}
          </section>

          {/* Shopping list — Task 2: all meals, categories, qty edit, exclude, manual add, "have it" check */}
          {savedPlan && (
            <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Shopping list</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Use <strong>Generate shopping list</strong> for all meals on this day, or <strong>List from this meal</strong> on a row to
                build from that meal only (meal-derived lines are replaced each time; manual rows stay). Check &quot;Have it&quot; for items
                you already own.
              </p>

              <div className="flex flex-wrap gap-3 items-end mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Add ingredient</label>
                  <input
                    type="text"
                    value={newShopName}
                    onChange={(e) => setNewShopName(e.target.value)}
                    placeholder="e.g. Greek yogurt"
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm w-48"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Qty</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={newShopQty}
                    onChange={(e) => setNewShopQty(e.target.value)}
                    className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Unit</label>
                  <input
                    type="text"
                    value={newShopUnit}
                    onChange={(e) => setNewShopUnit(e.target.value)}
                    className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddShoppingListItem}
                  disabled={addingShopItem || !newShopName.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {addingShopItem ? "Adding…" : "Add to list"}
                </button>
              </div>

              {shoppingList && Array.isArray(shoppingList.items) && shoppingList.items.length > 0 ? (
                <div className="space-y-4">
                  {(Array.from(new Set((shoppingList.items as any[]).map((i: any) => i.category))) as string[])
                    .sort()
                    .map((cat) => (
                      <div key={cat}>
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{cat}</h3>
                        <ul className="space-y-2">
                          {(shoppingList.items as any[])
                            .filter((i: any) => i.category === cat)
                            .sort((a: any, b: any) => Number(a.excluded) - Number(b.excluded))
                            .map((i: any) => (
                              <li
                                key={i.id}
                                className={`flex flex-wrap items-center gap-2 text-sm ${i.excluded ? "opacity-50" : ""}`}
                              >
                                <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 shrink-0 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!!i.checked}
                                    onChange={(e) => updateListItem(i.id, { checked: e.target.checked })}
                                  />
                                  Have it
                                </label>
                                <input
                                  type="number"
                                  value={i.quantity}
                                  onChange={(e) => updateListItem(i.id, { quantity: Number(e.target.value) })}
                                  className="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1"
                                />
                                <input
                                  type="text"
                                  defaultValue={i.unit}
                                  className="w-14 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1"
                                  onBlur={(e) => {
                                    const v = e.target.value.trim();
                                    if (v && v !== i.unit) updateListItem(i.id, { unit: v });
                                  }}
                                />
                                <input
                                  type="text"
                                  defaultValue={i.ingredientName}
                                  className="min-w-[140px] flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1"
                                  onBlur={(e) => {
                                    const v = e.target.value.trim();
                                    if (v && v !== i.ingredientName) updateListItem(i.id, { ingredientName: v });
                                  }}
                                />
                                {i.isUserAdded ? (
                                  <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">Manual</span>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => updateListItem(i.id, { excluded: !i.excluded })}
                                  className={`ml-auto text-xs shrink-0 ${i.excluded ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}
                                >
                                  {i.excluded ? "Include again" : "Exclude"}
                                </button>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  No rows yet. Use <strong>Generate shopping list</strong> (above) to aggregate ingredients from all meals, or add items manually.
                </p>
              )}
            </section>
          )}

          {/* Replace meal modal */}
          {replaceModal && (
            <ReplaceMealModal
              initial={replaceModal}
              onSave={(payload) => handleReplaceMeal(replaceModal.mealId, payload)}
              onClose={() => setReplaceModal(null)}
            />
          )}

          {/* Alternatives modal */}
          {alternativesModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !alternativesModal.loading && setAlternativesModal(null)}>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Suggest alternatives</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Pick one to replace the current meal.</p>
                {alternativesModal.loading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10">
                    <div className="h-9 w-9 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" aria-hidden />
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                      Generating suggestions… This can take up to a few minutes on a slow CPU (local AI).
                    </p>
                  </div>
                ) : alternativesModal.alternatives.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No alternatives available. Try Replace to enter one manually.</p>
                ) : (
                  <ul className="space-y-3">
                    {alternativesModal.alternatives.map((alt, i) => (
                      <li key={i} className="flex justify-between items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <span className="text-gray-900 dark:text-white">{alt.name}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{alt.calories} kcal</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleReplaceMeal(alternativesModal.mealId, {
                              name: alt.name,
                              type: alt.type,
                              calories: alt.calories,
                              macros: alt.macros,
                              description: alt.description,
                              ingredients: alt.ingredients,
                            })
                          }
                          className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
                        >
                          Use this
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" disabled={alternativesModal.loading} onClick={() => setAlternativesModal(null)} className="mt-4 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white font-medium hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed">Close</button>
              </div>
            </div>
          )}

          {/* Add meal modal */}
          {addMealOpen && (
            <AddMealModal
              onSave={handleAddMeal}
              onClose={() => setAddMealOpen(false)}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function ReplaceMealModal({
  initial,
  onSave,
  onClose,
}: {
  initial: { name: string; type: string; calories: number; macros: { protein: number; carbs: number; fats: number } };
  onSave: (p: { name: string; type: string; calories: number; macros: { protein: number; carbs: number; fats: number }; description?: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState(initial.type);
  const [calories, setCalories] = useState(initial.calories);
  const [protein, setProtein] = useState(initial.macros.protein);
  const [carbs, setCarbs] = useState(initial.macros.carbs);
  const [fats, setFats] = useState(initial.macros.fats);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Replace meal</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2">
              <option value="breakfast">breakfast</option>
              <option value="lunch">lunch</option>
              <option value="dinner">dinner</option>
              <option value="snack">snack</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Calories</label>
            <input type="number" value={calories} onChange={(e) => setCalories(Number(e.target.value) || 0)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Protein (g)</label>
              <input type="number" value={protein} onChange={(e) => setProtein(Number(e.target.value) || 0)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Carbs (g)</label>
              <input type="number" value={carbs} onChange={(e) => setCarbs(Number(e.target.value) || 0)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fats (g)</label>
              <input type="number" value={fats} onChange={(e) => setFats(Number(e.target.value) || 0)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={() => onSave({ name, type, calories, macros: { protein, carbs, fats } })} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">Save</button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white font-medium hover:bg-gray-300 dark:hover:bg-gray-500">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AddMealModal({ onSave, onClose }: { onSave: (p: { type: string; name: string; calories: number; macros: { protein: number; carbs: number; fats: number }; description?: string }) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("snack");
  const [calories, setCalories] = useState(150);
  const [protein, setProtein] = useState(5);
  const [carbs, setCarbs] = useState(20);
  const [fats, setFats] = useState(5);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add custom meal</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Banana smoothie" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2">
              <option value="breakfast">breakfast</option>
              <option value="lunch">lunch</option>
              <option value="dinner">dinner</option>
              <option value="snack">snack</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Calories</label>
            <input type="number" value={calories} onChange={(e) => setCalories(Number(e.target.value) || 0)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Protein (g)</label>
              <input type="number" value={protein} onChange={(e) => setProtein(Number(e.target.value) || 0)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Carbs (g)</label>
              <input type="number" value={carbs} onChange={(e) => setCarbs(Number(e.target.value) || 0)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fats (g)</label>
              <input type="number" value={fats} onChange={(e) => setFats(Number(e.target.value) || 0)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={() => onSave({ name: name || "Custom meal", type, calories, macros: { protein, carbs, fats } })} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">Add</button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white font-medium hover:bg-gray-300 dark:hover:bg-gray-500">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function MealPlansPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">Loading…</div>}>
      <MealPlansContent />
    </Suspense>
  );
}
