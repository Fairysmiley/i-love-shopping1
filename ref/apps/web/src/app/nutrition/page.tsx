"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { formatLocalYmd, mondayOfWeekContaining, parseLocalYmd, sundayAfterMonday } from "@/lib/date-utils";
import { mergeWeeklyWithLocalRange } from "@/lib/nutrition-week-range";

type IntakeEntry = {
  id: string;
  loggedAt: string;
  mealType?: string | null;
  notes?: string | null;
  items?: unknown;
  totals?: unknown;
};

type ImprovementSuggestion = {
  category: "food" | "timing" | "portion" | "ingredients" | "meal_plan";
  suggestion: string;
};

/** Fixed column order for weekly charts (always Mon … Sun, left to right). */
const WEEKDAY_HEADERS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function compactMonthDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

const WEEKLY_CHART_HEIGHT_PX = 120;
function weeklyBarHeight(value: number, cap: number): number {
  return Math.max(2, Math.min(WEEKLY_CHART_HEIGHT_PX, (value / Math.max(1, cap)) * WEEKLY_CHART_HEIGHT_PX));
}

function weeklyChartCap(values: number[], target: number): number {
  return Math.max(1, target, ...values);
}

/** Dashed line + visible tag at chart top (target reference). */
function BarChartTargetLine({
  label,
  yPx,
}: {
  label: string;
  yPx: number;
}) {
  const clampedY = Math.max(0, Math.min(WEEKLY_CHART_HEIGHT_PX - 1, yPx));
  const badgeTop = Math.max(0, Math.min(WEEKLY_CHART_HEIGHT_PX - 18, clampedY - 16));
  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 z-20 border-t border-gray-400 dark:border-gray-500"
        style={{ top: `${clampedY}px` }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute right-1 z-30 rounded bg-white/90 px-2 py-1 text-[11px] font-bold text-gray-800 ring-1 ring-gray-300 dark:bg-gray-900/90 dark:text-gray-100 dark:ring-gray-500"
        style={{ top: `${badgeTop}px` }}
      >
        Target {label}
      </span>
    </>
  );
}

const TREND_LINE_WIDTH = 700;
const TREND_LINE_HEIGHT = 140;

function monthStartYmd(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function monthEndYmd(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function trendPolylinePoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const stepX = values.length === 1 ? 0 : width / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = height / 2 - (v / maxAbs) * (height * 0.42);
      return `${x},${y}`;
    })
    .join(" ");
}

function formatIntakeItems(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return items
    .map((it: unknown) => {
      if (!it || typeof it !== "object") return "";
      const row = it as { name?: string; quantity?: number; unit?: string };
      const n = row.name ?? "Item";
      const q = row.quantity != null ? String(row.quantity) : "";
      const u = row.unit ?? "";
      return [q, u, n].filter(Boolean).join(" ").trim();
    })
    .filter(Boolean)
    .join(", ");
}

function NutritionContent() {
  const [logText, setLogText] = useState("");
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mealType, setMealType] = useState("lunch");
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [summaryDate, setSummaryDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [daily, setDaily] = useState<{
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    entries?: IntakeEntry[];
    suggestions?: string[];
    summary?: {
      title: string;
      achievements: string[];
      concerns: string[];
      macroBalance: string[];
    };
    improvementSuggestions?: ImprovementSuggestion[];
  } | null>(null);
  const [weekly, setWeekly] = useState<
    { date: string; calories: number; protein: number; carbs: number; fats: number }[]
  >([]);
  const [weeklySuggestions, setWeeklySuggestions] = useState<string[]>([]);
  const [periodSummary, setPeriodSummary] = useState<{
    title: string;
    achievements: string[];
    concerns: string[];
    macroBalance: string[];
  } | null>(null);
  const [periodImprovementSuggestions, setPeriodImprovementSuggestions] = useState<ImprovementSuggestion[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [range, setRange] = useState<"daily" | "weekly" | "monthly">("daily");
  const [profile, setProfile] = useState<{ calorieTarget?: number; macronutrientTargets?: { protein?: number; carbs?: number; fats?: number } } | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => d.profile && setProfile(d.profile))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (range === "daily") {
      let cancelled = false;
      setDaily(null);
      fetch(`/api/nutrition/summary?date=${encodeURIComponent(summaryDate)}`, {
        credentials: "include",
      })
        .then((r) => {
          if (cancelled) return null;
          return r.json();
        })
        .then((d) => {
          if (cancelled || d === null) return;
          if (d.data?.kind === "daily")
            setDaily({
              calories: d.data.calories ?? 0,
              protein: d.data.protein ?? 0,
              carbs: d.data.carbs ?? 0,
              fats: d.data.fats ?? 0,
              entries: Array.isArray(d.data.entries) ? d.data.entries : [],
              suggestions: Array.isArray(d.data.suggestions) ? d.data.suggestions : [],
              summary: d.data.summary ?? undefined,
              improvementSuggestions: Array.isArray(d.data.improvementSuggestions)
                ? d.data.improvementSuggestions
                : [],
            });
          else setDaily(null);
        })
        .catch(() => {
          if (!cancelled) setDaily(null);
        });
      return () => {
        cancelled = true;
      };
    } else {
      let cancelled = false;
      const selected = parseLocalYmd(summaryDate);
      const weekMonday = mondayOfWeekContaining(selected);
      const weekSunday = sundayAfterMonday(weekMonday);
      const startStr = range === "monthly" ? monthStartYmd(summaryDate) : formatLocalYmd(weekMonday);
      const endStr = range === "monthly" ? monthEndYmd(summaryDate) : formatLocalYmd(weekSunday);
      setWeeklyLoading(true);
      fetch(`/api/nutrition/summary?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`, {
        credentials: "include",
      })
        .then((r) => {
          if (cancelled) return null;
          return r.json();
        })
        .then((d) => {
          if (cancelled || d === null) return;
          if (d.data?.kind === "weekly") {
            const raw = Array.isArray(d.data.days) ? d.data.days : [];
            if (range === "weekly") {
              setWeekly(mergeWeeklyWithLocalRange(startStr, endStr, raw));
              setWeeklySuggestions(
                Array.isArray(d.data.weeklySuggestions) ? d.data.weeklySuggestions : []
              );
            } else {
              setWeekly(raw);
              setWeeklySuggestions([]);
            }
            setPeriodSummary(d.data.summary ?? null);
            setPeriodImprovementSuggestions(
              Array.isArray(d.data.improvementSuggestions) ? d.data.improvementSuggestions : []
            );
          } else {
            setWeekly([]);
            setWeeklySuggestions([]);
            setPeriodSummary(null);
            setPeriodImprovementSuggestions([]);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setWeekly([]);
            setWeeklySuggestions([]);
            setPeriodSummary(null);
            setPeriodImprovementSuggestions([]);
          }
        })
        .finally(() => {
          if (!cancelled) setWeeklyLoading(false);
        });
      return () => {
        cancelled = true;
        setWeeklyLoading(false);
      };
    }
  }, [range, summaryDate]);

  const handleLog = async () => {
    if (!logText.trim()) return;
    setLogError(null);
    setLogging(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const analyzeRes = await fetch("/api/nutrition/analyze", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: logText.trim() }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error || "Analysis failed");
      const toolResult = analyzeData.data?.toolResult;
      if (!toolResult) throw new Error("Could not get nutrition from description");
      const items = (toolResult.matchingIngredients ?? []).map((m: any) => m.item || m).filter(Boolean);
      const totals = {
        calories: toolResult.totalCalories ?? 0,
        protein: toolResult.totalMacros?.protein ?? 0,
        carbs: toolResult.totalMacros?.carbs ?? 0,
        fats: toolResult.totalMacros?.fats ?? 0,
      };
      const logRes = await fetch("/api/nutrition/log", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: logDate,
          loggedAt: new Date().toISOString(),
          mealType,
          notes: logText.trim(),
          items: items.length ? items : [{ name: logText.trim(), quantity: 1, unit: "serving" }],
          totals,
        }),
      });
      const logData = await logRes.json();
      if (!logRes.ok) throw new Error(logData.error || "Failed to log");
      setLogText("");
      setSummaryDate(logDate);
      setRange("daily");

      const sumRes = await fetch(`/api/nutrition/summary?date=${logDate}`, { credentials: "include" });
      const sumJson = await sumRes.json();
      if (sumRes.ok && sumJson.data?.kind === "daily") {
        setDaily({
          calories: sumJson.data.calories ?? 0,
          protein: sumJson.data.protein ?? 0,
          carbs: sumJson.data.carbs ?? 0,
          fats: sumJson.data.fats ?? 0,
          entries: Array.isArray(sumJson.data.entries) ? sumJson.data.entries : [],
          suggestions: Array.isArray(sumJson.data.suggestions) ? sumJson.data.suggestions : [],
          summary: sumJson.data.summary ?? undefined,
          improvementSuggestions: Array.isArray(sumJson.data.improvementSuggestions)
            ? sumJson.data.improvementSuggestions
            : [],
        });
      }
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof Error) {
        if (e.name === "AbortError") {
          setLogError(
            "Request timed out (120s). Nutrition still works without Ollama using text parsing — try again, or check Ollama / USE_MOCK_AI=true."
          );
        } else {
          setLogError(e.message);
        }
      } else {
        setLogError("Failed to log");
      }
    } finally {
      setLogging(false);
    }
  };

  const calorieTarget = profile?.calorieTarget ?? 2000;
  const macroTargets = profile?.macronutrientTargets ?? { protein: 100, carbs: 200, fats: 60 };
  const proteinTarget = macroTargets.protein ?? 100;
  const carbsTarget = macroTargets.carbs ?? 200;
  const fatsTarget = macroTargets.fats ?? 60;
  const calorieCap = useMemo(() => weeklyChartCap(weekly.map((d) => d.calories ?? 0), calorieTarget), [weekly, calorieTarget]);
  const proteinCap = useMemo(() => weeklyChartCap(weekly.map((d) => d.protein ?? 0), proteinTarget), [weekly, proteinTarget]);
  const carbsCap = useMemo(() => weeklyChartCap(weekly.map((d) => d.carbs ?? 0), carbsTarget), [weekly, carbsTarget]);
  const fatsCap = useMemo(() => weeklyChartCap(weekly.map((d) => d.fats ?? 0), fatsTarget), [weekly, fatsTarget]);

  const calendarWeekMonSun = useMemo(() => {
    const sel = parseLocalYmd(summaryDate);
    const mon = mondayOfWeekContaining(sel);
    const sun = sundayAfterMonday(mon);
    return { startYmd: formatLocalYmd(mon), endYmd: formatLocalYmd(sun) };
  }, [summaryDate]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      <Sidebar />
      <main className="flex-1 md:ml-64 px-4 sm:px-6 lg:px-8 py-8 pt-16 md:pt-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Nutrition</h1>

          {/* Log entry */}
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Log intake</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
              Saved meals can be logged from the{" "}
              <Link href="/meal-plans" className="text-blue-600 dark:text-blue-400 hover:underline">
                meal plan
              </Link>{" "}
              page (Log intake on each row) using the plan&apos;s calories and macros—no analyzer step.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Describe what you ate (e.g. &quot;2 eggs, 100g oats, 200ml milk&quot;). We&apos;ll estimate nutrition and save it.</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">When mock/estimated mode is on, placeholder values may be used for any input.</p>
            {logError && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{logError}</p>}
            <div className="flex flex-wrap gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meal</label>
                <select value={mealType} onChange={(e) => setMealType(e.target.value)} className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2">
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                </select>
              </div>
            </div>
            <textarea value={logText} onChange={(e) => setLogText(e.target.value)} placeholder="e.g. 2 eggs, 100g oats, 200ml milk" rows={2} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 mb-4" />
            <button onClick={handleLog} disabled={logging} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
              {logging ? "Analyzing & logging…" : "Log"}
            </button>
          </section>

          {/* Summary */}
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Summary</h2>
            <div className="flex flex-wrap gap-4 mb-4">
              <input type="date" value={summaryDate} onChange={(e) => setSummaryDate(e.target.value)} className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2" />
              <label className="flex items-center gap-2">
                <input type="radio" checked={range === "daily"} onChange={() => setRange("daily")} />
                <span className="text-gray-700 dark:text-gray-300">Daily</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={range === "weekly"}
                  onChange={() => {
                    setWeeklyLoading(true);
            setRange("weekly");
                  }}
                />
                <span className="text-gray-700 dark:text-gray-300">Weekly</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={range === "monthly"}
                  onChange={() => {
                    setWeeklyLoading(true);
                    setRange("monthly");
                  }}
                />
                <span className="text-gray-700 dark:text-gray-300">Monthly</span>
              </label>
            </div>
            {range === "weekly" && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 max-w-xl">
                Uses the <span className="font-semibold text-gray-800 dark:text-gray-200">Mon–Sun</span> calendar week
                that contains the date above (local time). Showing{" "}
                <span className="font-mono">
                  {calendarWeekMonSun.startYmd} → {calendarWeekMonSun.endYmd}
                </span>{" "}
                (Mon → Sun).
              </p>
            )}
            {range === "monthly" && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 max-w-xl">
                Shows the full calendar month for the selected date:{" "}
                <span className="font-mono">
                  {monthStartYmd(summaryDate)} → {monthEndYmd(summaryDate)}
                </span>
                . Trend line below shows daily calorie deficit/surplus vs your target.
              </p>
            )}

            {range === "daily" && daily !== null && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Calories</p>
                    <p className="text-xl font-semibold text-gray-900 dark:text-white">{daily.calories} / {calorieTarget} kcal</p>
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 mt-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          daily.calories > calorieTarget
                            ? "bg-red-500"
                            : daily.calories >= calorieTarget * 0.9
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                        }`}
                        style={{ width: `${Math.min(100, (daily.calories / calorieTarget) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Protein</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{daily.protein}g / {proteinTarget}g</p>
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, (daily.protein / proteinTarget) * 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Carbs</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{daily.carbs}g / {carbsTarget}g</p>
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(100, (daily.carbs / carbsTarget) * 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Fats</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{daily.fats}g / {fatsTarget}g</p>
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.min(100, (daily.fats / fatsTarget) * 100)}%` }} />
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {daily.calories >= calorieTarget ? "Surplus" : "Deficit"}: {Math.abs(daily.calories - calorieTarget)} kcal {daily.calories >= calorieTarget ? "over" : "under"} target.
                </p>

                {daily.suggestions && daily.suggestions.length > 0 && (
                  <div
                    key={summaryDate}
                    className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900"
                  >
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">Suggestions</p>
                    <p className="text-xs text-blue-800/80 dark:text-blue-300/80 mb-2">
                      For {summaryDate} ·{" "}
                      {(daily.entries?.length ?? 0) === 0
                        ? "no entries logged"
                        : `${daily.entries?.length} ${daily.entries?.length === 1 ? "entry" : "entries"}`}
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-blue-800 dark:text-blue-300">
                      {daily.suggestions.map((s, i) => (
                        <li key={`${summaryDate}-${i}`}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {daily.improvementSuggestions && daily.improvementSuggestions.length > 0 && (
                  <div className="mt-4 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900">
                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200 mb-2">
                      Improvement suggestions (all required categories)
                    </p>
                    <ul className="space-y-2 text-sm text-emerald-800 dark:text-emerald-300">
                      {daily.improvementSuggestions.map((item, i) => (
                        <li key={`di-${i}`}>
                          <span className="font-semibold capitalize">
                            {item.category.replace("_", " ")}:
                          </span>{" "}
                          {item.suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {daily.summary && (
                  <div className="mt-4 p-4 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900">
                    <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200 mb-2">
                      AI-driven nutrition summary
                    </p>
                    <p className="text-xs text-indigo-800/90 dark:text-indigo-300/90 mb-3">
                      {daily.summary.title}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="font-medium text-indigo-900 dark:text-indigo-200 mb-1">Key achievements</p>
                        <ul className="list-disc list-inside space-y-1 text-indigo-800 dark:text-indigo-300">
                          {daily.summary.achievements.map((s, i) => (
                            <li key={`ach-${i}`}>{s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-indigo-900 dark:text-indigo-200 mb-1">Potential concerns</p>
                        <ul className="list-disc list-inside space-y-1 text-indigo-800 dark:text-indigo-300">
                          {daily.summary.concerns.map((s, i) => (
                            <li key={`con-${i}`}>{s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-indigo-900 dark:text-indigo-200 mb-1">Macronutrient balance analysis</p>
                        <ul className="list-disc list-inside space-y-1 text-indigo-800 dark:text-indigo-300">
                          {daily.summary.macroBalance.map((s, i) => (
                            <li key={`mac-${i}`}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {daily.entries && daily.entries.length > 0 ? (
                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Intake log</h3>
                    <ul className="space-y-3">
                      {[...daily.entries]
                        .sort(
                          (a, b) =>
                            new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
                        )
                        .map((entry) => {
                          const t = entry.totals as
                            | { calories?: number; protein?: number; carbs?: number; fats?: number }
                            | undefined;
                          const timeStr = entry.loggedAt
                            ? new Date(entry.loggedAt).toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })
                            : "";
                          const mealRaw = entry.mealType?.trim() || "meal";
                          const mealLabel = mealRaw.charAt(0).toUpperCase() + mealRaw.slice(1).toLowerCase();
                          const itemLine = formatIntakeItems(entry.items);
                          return (
                            <li
                              key={entry.id}
                              className="text-sm rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-gray-50 dark:bg-gray-900/50"
                            >
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="font-medium text-gray-900 dark:text-white">{timeStr}</span>
                                <span className="text-gray-500 dark:text-gray-400">· {mealLabel}</span>
                              </div>
                              {entry.notes ? (
                                <p className="text-gray-800 dark:text-gray-200 mt-1 whitespace-pre-wrap break-words">
                                  {entry.notes}
                                </p>
                              ) : null}
                              {itemLine ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{itemLine}</p>
                              ) : null}
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                                {t?.calories ?? 0} kcal · P {t?.protein ?? 0}g · C {t?.carbs ?? 0}g · F {t?.fats ?? 0}g
                              </p>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">No intake entries for this date yet.</p>
                )}
              </>
            )}

            {(range === "weekly" || range === "monthly") && weeklyLoading && (
              <p className="text-gray-500 dark:text-gray-400 text-sm">Loading weekly summary…</p>
            )}

            {(range === "weekly" || range === "monthly") && !weeklyLoading && weekly.length > 0 && (
              <div className="space-y-6 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-slate-900/60 p-5 shadow-inner">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {range === "weekly" ? "Week overview (Mon–Sun)" : "Month overview"}
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Range{" "}
                    <span className="font-mono">
                      {weekly[0]?.date} → {weekly[weekly.length - 1]?.date}
                    </span>
                    . Empty days are 0. Bar height scales to your daily target; the horizontal dashed line on each bar chart marks that target (e.g.{" "}
                    {fatsTarget}g fats, {proteinTarget}g protein).
                  </p>
                </div>
                {range === "weekly" && weeklySuggestions.length > 0 && (
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">Weekly summary</p>
                    <p className="text-xs text-blue-800/90 dark:text-blue-300/90 mb-2">
                      Rule-based tips from your average daily intake this week vs targets (no extra AI call).
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-blue-800 dark:text-blue-300">
                      {weeklySuggestions.map((s, i) => (
                        <li key={`ws-${i}`}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {periodSummary && (
                  <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900">
                    <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200 mb-2">
                      AI-driven nutrition summary
                    </p>
                    <p className="text-xs text-indigo-800/90 dark:text-indigo-300/90 mb-3">
                      {periodSummary.title}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="font-medium text-indigo-900 dark:text-indigo-200 mb-1">Key achievements</p>
                        <ul className="list-disc list-inside space-y-1 text-indigo-800 dark:text-indigo-300">
                          {periodSummary.achievements.map((s, i) => (
                            <li key={`p-ach-${i}`}>{s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-indigo-900 dark:text-indigo-200 mb-1">Potential concerns</p>
                        <ul className="list-disc list-inside space-y-1 text-indigo-800 dark:text-indigo-300">
                          {periodSummary.concerns.map((s, i) => (
                            <li key={`p-con-${i}`}>{s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-indigo-900 dark:text-indigo-200 mb-1">Macronutrient balance analysis</p>
                        <ul className="list-disc list-inside space-y-1 text-indigo-800 dark:text-indigo-300">
                          {periodSummary.macroBalance.map((s, i) => (
                            <li key={`p-mac-${i}`}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                {periodImprovementSuggestions.length > 0 && (
                  <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900">
                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200 mb-2">
                      Improvement suggestions (all required categories)
                    </p>
                    <ul className="space-y-2 text-sm text-emerald-800 dark:text-emerald-300">
                      {periodImprovementSuggestions.map((item, i) => (
                        <li key={`pi-${i}`}>
                          <span className="font-semibold capitalize">
                            {item.category.replace("_", " ")}:
                          </span>{" "}
                          {item.suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Daily calorie deficit/surplus trend vs target ({calorieTarget} kcal)
                  </p>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/60 p-3">
                    <svg
                      viewBox={`0 0 ${TREND_LINE_WIDTH} ${TREND_LINE_HEIGHT}`}
                      className="w-full h-36"
                      role="img"
                      aria-label="Daily calorie deficit and surplus trend"
                    >
                      <line
                        x1={0}
                        x2={TREND_LINE_WIDTH}
                        y1={TREND_LINE_HEIGHT / 2}
                        y2={TREND_LINE_HEIGHT / 2}
                        className="stroke-gray-300 dark:stroke-gray-600"
                        strokeWidth="2"
                      />
                      <polyline
                        fill="none"
                        stroke="rgb(59 130 246)"
                        strokeWidth="3"
                        points={trendPolylinePoints(
                          weekly.map((d) => (d.calories ?? 0) - calorieTarget),
                          TREND_LINE_WIDTH,
                          TREND_LINE_HEIGHT
                        )}
                      />
                    </svg>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      Above center = surplus, below center = deficit.
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Calories vs daily target ({calorieTarget} kcal)
                  </p>
                  <div className="relative flex items-end gap-1.5 h-[120px] border-b border-gray-200 dark:border-gray-600 pb-0.5">
                    <BarChartTargetLine
                      label={`${calorieTarget} kcal`}
                      yPx={WEEKLY_CHART_HEIGHT_PX - weeklyBarHeight(calorieTarget, calorieCap)}
                    />
                    {weekly.map((d) => (
                      <div
                        key={d.date}
                        className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
                        title={`${d.date}: ${d.calories} kcal`}
                      >
                        <div
                          className="w-full rounded-t bg-amber-500"
                          style={{ height: `${weeklyBarHeight(d.calories, calorieCap)}px` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    {weekly.map((d, i) => (
                      <div
                        key={`lbl-cal-${d.date}`}
                        className="flex-1 text-center text-[10px] leading-tight text-gray-500 dark:text-gray-400 min-w-0"
                      >
                        <span className="block font-semibold text-gray-800 dark:text-gray-200">
                          {WEEKDAY_HEADERS_MON[i] ?? "—"}
                        </span>
                        <span className="block text-gray-500 dark:text-gray-500">{compactMonthDay(d.date)}</span>
                        <span className="block font-medium text-gray-700 dark:text-gray-300">{d.calories}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Protein (g) vs target ({proteinTarget}g)
                  </p>
                  <div className="relative flex items-end gap-1.5 h-[120px] border-b border-gray-200 dark:border-gray-600 pb-0.5">
                    <BarChartTargetLine
                      label={`${proteinTarget} g`}
                      yPx={WEEKLY_CHART_HEIGHT_PX - weeklyBarHeight(proteinTarget, proteinCap)}
                    />
                    {weekly.map((d) => (
                      <div
                        key={`p-${d.date}`}
                        className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
                        title={`${d.date}: ${d.protein}g`}
                      >
                        <div
                          className="w-full rounded-t bg-blue-500"
                          style={{ height: `${weeklyBarHeight(d.protein, proteinCap)}px` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    {weekly.map((d, i) => (
                      <div
                        key={`lbl-p-${d.date}`}
                        className="flex-1 text-center text-[10px] leading-tight text-gray-500 dark:text-gray-400 min-w-0"
                      >
                        <span className="block font-semibold text-gray-800 dark:text-gray-200">
                          {WEEKDAY_HEADERS_MON[i] ?? "—"}
                        </span>
                        <span className="block font-medium text-gray-700 dark:text-gray-300">{d.protein}g</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Carbs (g) vs target ({carbsTarget}g)
                  </p>
                  <div className="relative flex items-end gap-1.5 h-[120px] border-b border-gray-200 dark:border-gray-600 pb-0.5">
                    <BarChartTargetLine
                      label={`${carbsTarget} g`}
                      yPx={WEEKLY_CHART_HEIGHT_PX - weeklyBarHeight(carbsTarget, carbsCap)}
                    />
                    {weekly.map((d) => (
                      <div
                        key={`c-${d.date}`}
                        className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
                        title={`${d.date}: ${d.carbs}g`}
                      >
                        <div
                          className="w-full rounded-t bg-green-500"
                          style={{ height: `${weeklyBarHeight(d.carbs, carbsCap)}px` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    {weekly.map((d, i) => (
                      <div
                        key={`lbl-c-${d.date}`}
                        className="flex-1 text-center text-[10px] leading-tight text-gray-500 dark:text-gray-400 min-w-0"
                      >
                        <span className="block font-semibold text-gray-800 dark:text-gray-200">
                          {WEEKDAY_HEADERS_MON[i] ?? "—"}
                        </span>
                        <span className="block font-medium text-gray-700 dark:text-gray-300">{d.carbs}g</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Fats (g) vs target ({fatsTarget}g)
                  </p>
                  <div className="relative flex items-end gap-1.5 h-[120px] border-b border-gray-200 dark:border-gray-600 pb-0.5">
                    <BarChartTargetLine
                      label={`${fatsTarget} g`}
                      yPx={WEEKLY_CHART_HEIGHT_PX - weeklyBarHeight(fatsTarget, fatsCap)}
                    />
                    {weekly.map((d) => (
                      <div
                        key={`f-${d.date}`}
                        className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
                        title={`${d.date}: ${d.fats}g`}
                      >
                        <div
                          className="w-full rounded-t bg-purple-500"
                          style={{ height: `${weeklyBarHeight(d.fats, fatsCap)}px` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    {weekly.map((d, i) => (
                      <div
                        key={`lbl-f-${d.date}`}
                        className="flex-1 text-center text-[10px] leading-tight text-gray-500 dark:text-gray-400 min-w-0"
                      >
                        <span className="block font-semibold text-gray-800 dark:text-gray-200">
                          {WEEKDAY_HEADERS_MON[i] ?? "—"}
                        </span>
                        <span className="block font-medium text-gray-700 dark:text-gray-300">{d.fats}g</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {range === "daily" && daily === null && (
              <p className="text-gray-500 dark:text-gray-400 text-sm">Loading summary…</p>
            )}
            {(range === "weekly" || range === "monthly") && !weeklyLoading && weekly.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Could not load this {range === "monthly" ? "month" : "week"}. Check that you are signed in and try again.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default function NutritionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">Loading…</div>}>
      <NutritionContent />
    </Suspense>
  );
}
