"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/Sidebar";
import { formatLocalYmd, localMonSunWeekRangeContaining, rollingLocalDateRangeInclusive } from "@/lib/date-utils";
import { mergeWeeklyWithLocalRange } from "@/lib/nutrition-week-range";
import { SimpleLineChart } from "@/components/SimpleLineChart";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { Button } from "@/components/Button";
import { RecordProgressModal } from "@/components/RecordProgressModal";
import { formatDateEuropean } from "@/lib/date-utils";
import { TimerIcon, FlameIcon, MuscleIcon } from "@/components/icons";

// Section Header Component (matching zenith style)
const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
    {children}
    <div className="h-[1px] flex-1 bg-slate-100 dark:bg-slate-900"></div>
  </h2>
);

function ProgressContent() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);

  const [nutritionLoading, setNutritionLoading] = useState(true);
  const [nutritionAuthed, setNutritionAuthed] = useState(false);
  const [nutritionToday, setNutritionToday] = useState<{
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  } | null>(null);
  const [calorieTarget, setCalorieTarget] = useState(2000);
  const [calorieTrend, setCalorieTrend] = useState<{ date: string; value: number }[]>([]);
  const [calorieHorizon, setCalorieHorizon] = useState<7 | 30>(7);

  // Get user's name for personalization
  const userName = session?.user?.name?.split(' ')[0] ||
    (session?.user as any)?.firstName ||
    "there";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileRes, assessmentRes, historyRes] = await Promise.all([
          fetch("/api/profile"),
          fetch("/api/fitness-assessment"),
          fetch("/api/profile/history"),
        ]);

        if (profileRes.ok) {
          const data = await profileRes.json();
          setProfile(data.profile);
        }

        if (assessmentRes.ok) {
          const data = await assessmentRes.json();
          setAssessment(data.assessment);
        }


        if (historyRes.ok) {
          const data = await historyRes.json();
          setHistory(data.history);
          // Filter and format workout data from metrics
          const workouts = (data.history?.metrics || []).map((metric: any) => ({
            date: metric.date,
            enduranceMinutes: metric.enduranceMinutes,
            strengthPushups: metric.strengthPushups,
            strengthSquats: metric.strengthSquats,
            notes: metric.notes,
          })).filter((w: any) => w.enduranceMinutes || w.strengthPushups || w.strengthSquats);
          setWorkoutHistory(workouts);
        }
      } catch (error) {
        console.error("Error fetching workout data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setNutritionLoading(true);
    const todayStr = formatLocalYmd(new Date());
    const { startYmd, endYmd } =
      calorieHorizon === 7
        ? localMonSunWeekRangeContaining(new Date())
        : rollingLocalDateRangeInclusive(calorieHorizon);

    Promise.all([
      fetch(`/api/nutrition/summary?date=${encodeURIComponent(todayStr)}`, { credentials: "include" }).then((r) =>
        r.json().then((j) => ({ ok: r.ok, j }))
      ),
      fetch(
        `/api/nutrition/summary?start=${encodeURIComponent(startYmd)}&end=${encodeURIComponent(endYmd)}`,
        { credentials: "include" }
      ).then((r) => r.json().then((j) => ({ ok: r.ok, j }))),
    ])
      .then(([dailyRes, weeklyRes]) => {
        if (cancelled) return;
        if (!dailyRes.ok || dailyRes.j?.error) {
          setNutritionAuthed(false);
          setNutritionToday(null);
          setCalorieTrend([]);
          return;
        }
        setNutritionAuthed(true);
        const d = dailyRes.j?.data;
        if (d?.kind === "daily") {
          const t = d.targets as { calories?: number } | undefined;
          setCalorieTarget(t?.calories ?? 2000);
          setNutritionToday({
            calories: d.calories ?? 0,
            protein: d.protein ?? 0,
            carbs: d.carbs ?? 0,
            fats: d.fats ?? 0,
          });
        } else {
          setNutritionToday(null);
        }
        if (weeklyRes.ok && weeklyRes.j?.data?.kind === "weekly") {
          const raw = Array.isArray(weeklyRes.j.data.days) ? weeklyRes.j.data.days : [];
          const merged = mergeWeeklyWithLocalRange(startYmd, endYmd, raw);
          setCalorieTrend(
            merged.map((row) => ({
              date: new Date(`${row.date}T12:00:00`).toISOString(),
              value: row.calories,
            }))
          );
        } else {
          setCalorieTrend([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNutritionAuthed(false);
          setNutritionToday(null);
          setCalorieTrend([]);
        }
      })
      .finally(() => {
        if (!cancelled) setNutritionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [calorieHorizon]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Calculate workout statistics
  const totalWorkouts = workoutHistory.length;
  const totalEnduranceMinutes = workoutHistory.reduce((sum, w) => sum + (w.enduranceMinutes || 0), 0);
  const totalPushups = workoutHistory.reduce((sum, w) => sum + (w.strengthPushups || 0), 0);
  const totalSquats = workoutHistory.reduce((sum, w) => sum + (w.strengthSquats || 0), 0);
  const avgWeeklyFrequency = assessment?.weeklyActivityFrequency || 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 overflow-x-hidden transition-colors duration-300 flex">
      {/* Sidebar */}
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pt-16 md:pt-8">
        {/* Personalized Greeting */}
        <div className="mb-12">
          <h1 className="text-3xl md:text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight leading-tight">
            Progress, {userName.split(' ')[0]}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-lg mt-2">
            Track your health metrics and exercise sessions in one place.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                <TimerIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-[10px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-widest">
                Total Sessions
              </span>
            </div>
            <div className="text-3xl font-black text-slate-800 dark:text-slate-100">
              {totalWorkouts}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Workouts recorded
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/20">
                <FlameIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <span className="text-[10px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-widest">
                Endurance
              </span>
            </div>
            <div className="text-3xl font-black text-slate-800 dark:text-slate-100">
              {totalEnduranceMinutes}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Total minutes
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                <MuscleIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-[10px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-widest">
                Strength
              </span>
            </div>
            <div className="text-3xl font-black text-slate-800 dark:text-slate-100">
              {totalPushups + totalSquats}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Total reps
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/20">
                <TimerIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-[10px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-widest">
                Weekly Goal
              </span>
            </div>
            <div className="text-3xl font-black text-slate-800 dark:text-slate-100">
              {avgWeeklyFrequency}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Days per week
            </div>
          </div>
        </div>

        {/* Tracking Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Record Progress */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6">
            <div className="flex flex-col h-full items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
                  Record Progress
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Log your weight and body metrics
                </p>
              </div>
              <Button
                onClick={() => setShowProgressModal(true)}
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
              >
                Record Progress
              </Button>
            </div>
          </div>

          {/* Record Workout */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6">
            <div className="flex flex-col h-full items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
                  Record Workout
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Log your exercise sessions and performance
                </p>
              </div>
              <Button
                onClick={() => setShowWorkoutModal(true)}
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
              >
                Record Workout
              </Button>
            </div>
          </div>
        </div>

        {/* Nutrition intake (aligned with Dashboard + Nutrition page) */}
        <SectionHeader>Nutrition intake</SectionHeader>
        <div className="mb-12">
          {nutritionLoading ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-8 flex justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500" />
            </div>
          ) : !nutritionAuthed ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6">
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Sign in to see nutrition intake and trends here, or open{" "}
                <Link href="/nutrition" className="text-amber-600 dark:text-amber-400 font-semibold hover:underline">
                  Nutrition
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-slate-500 dark:text-slate-400 text-xs font-black uppercase tracking-widest mb-2">
                      Today
                    </h3>
                    <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                      {nutritionToday?.calories ?? 0}{" "}
                      <span className="text-lg font-bold text-slate-500">/ {calorieTarget} kcal</span>
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                      P {nutritionToday?.protein ?? 0}g · C {nutritionToday?.carbs ?? 0}g · F {nutritionToday?.fats ?? 0}g
                    </p>
                  </div>
                  <Link
                    href="/nutrition"
                    className="text-sm font-semibold text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap"
                  >
                    Log &amp; details →
                  </Link>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (Math.max(0, nutritionToday?.calories ?? 0) / Math.max(1, calorieTarget)) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="text-slate-500 dark:text-slate-400 text-xs font-black uppercase tracking-widest">
                    Calorie trend
                  </h3>
                  <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setCalorieHorizon(7)}
                      className={`px-3 py-1 rounded-md ${calorieHorizon === 7 ? "bg-amber-500 text-white" : "text-slate-600 dark:text-slate-400"}`}
                    >
                      7d
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalorieHorizon(30)}
                      className={`px-3 py-1 rounded-md ${calorieHorizon === 30 ? "bg-amber-500 text-white" : "text-slate-600 dark:text-slate-400"}`}
                    >
                      30d
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  {calorieHorizon === 7
                    ? "Daily kcal for the Mon–Sun week containing today (local time)."
                    : "Daily kcal logged, ending today (30-day window)."}
                </p>
                {calorieTrend.length > 0 ? (
                  <SimpleLineChart
                    data={calorieTrend}
                    height={calorieHorizon === 30 ? 220 : 200}
                    label="Calories"
                    unit="kcal"
                    color="rgb(245 158 11)"
                    targetValue={calorieTarget}
                    targetLabel="Daily target"
                    fixedMinValue={0}
                  />
                ) : (
                  <div className="h-[200px] flex items-center justify-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
                    <p className="text-slate-400 dark:text-slate-500 text-sm">No calorie data in this range yet</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Health History Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Weight History */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6">
            <h3 className="text-slate-500 dark:text-slate-400 text-xs font-black uppercase tracking-widest mb-6">
              Weight Progression
            </h3>
            {history?.weight && history.weight.length > 0 ? (
              <div>
                <SimpleLineChart
                  data={history.weight.map((item: any) => ({
                    date: new Date(item.date).toISOString(),
                    value: item.value,
                  }))}
                  height={200}
                  label="Weight (kg)"
                  unit="kg"
                />
                <div className="mt-6 space-y-2">
                  {history.weight.slice(0, 5).map((item: any, index: number, arr: any[]) => {
                    const isFirstEntry = index === arr.length - 1;
                    return (
                      <div
                        key={index}
                        className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl"
                      >
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          {formatDateEuropean(item.date)}
                        </span>
                        <span className="font-black text-slate-800 dark:text-slate-100">
                          {typeof item.value === 'number' ? item.value.toFixed(2) : item.value} kg
                        </span>
                        <span
                          className={`text-xs font-black ${item.change > 0
                            ? "text-rose-500"
                            : item.change < 0
                              ? "text-emerald-500"
                              : "text-slate-400"
                            }`}
                        >
                          {isFirstEntry ? "—" : (item.change > 0 ? "↑" : "↓") + Math.abs(item.change).toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
                <p className="text-slate-400 dark:text-slate-500 text-sm">No weight history recorded yet</p>
              </div>
            )}
          </div>

          {/* Wellness Score History */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6">
            <h3 className="text-slate-500 dark:text-slate-400 text-xs font-black uppercase tracking-widest mb-6">
              Wellness Trend
            </h3>
            {history?.wellnessScore && history.wellnessScore.length > 0 ? (
              <div>
                <SimpleLineChart
                  data={history.wellnessScore.map((item: any) => ({
                    date: new Date(item.date).toISOString(),
                    value: item.value,
                  }))}
                  height={250}
                  label="Score"
                  fixedMinValue={0}
                  fixedMaxValue={100}
                />
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
                <p className="text-slate-400 dark:text-slate-500 text-sm">No wellness score history yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Workout History */}
        <SectionHeader>Detailed Activity Log</SectionHeader>
        <div className="mb-12">
          {workoutHistory.length > 0 ? (
            <div className="space-y-4">
              {workoutHistory.slice(0, 10).map((workout: any, index: number) => (
                <div
                  key={index}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3">
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {formatDateEuropean(workout.date)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {workout.enduranceMinutes > 0 && (
                          <div className="flex items-center gap-2">
                            <FlameIcon className="w-4 h-4 text-orange-500" />
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {(() => {
                                const val = Number(workout.enduranceMinutes);
                                if (val === 22) return "15-30 min";
                                if (val === 45) return "30-60 min";
                                if (val === 75) return "60+ min";
                                return `${val.toFixed(2)} min`;
                              })()}
                            </span>
                          </div>
                        )}
                        {workout.strengthPushups > 0 && (
                          <div className="flex items-center gap-2">
                            <MuscleIcon className="w-4 h-4 text-purple-500" />
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {workout.strengthPushups} push-ups
                            </span>
                          </div>
                        )}
                        {workout.strengthSquats > 0 && (
                          <div className="flex items-center gap-2">
                            <MuscleIcon className="w-4 h-4 text-blue-500" />
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {workout.strengthSquats} squats
                            </span>
                          </div>
                        )}
                      </div>
                      {workout.notes && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 italic">
                          "{workout.notes}"
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-16 text-center">
              <div className="max-w-xs mx-auto">
                <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-slate-200 dark:border-slate-700">
                  <div className="w-2 h-2 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                </div>
                <h3 className="text-slate-800 dark:text-slate-100 font-bold mb-2">Timeline Empty</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                  Your exercise sessions will appear here as a chronological log once you start recording workouts.
                </p>
              </div>
            </div>
          )}
        </div>


        {/* Fitness Assessment Summary */}
        {assessment && (
          <>
            <SectionHeader>Your Fitness Profile</SectionHeader>
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 mb-12">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <dt className="text-sm text-slate-600 dark:text-slate-400 mb-1">Weekly Frequency</dt>
                  <dd className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                    {assessment.weeklyActivityFrequency} days
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-600 dark:text-slate-400 mb-1">Fitness Level</dt>
                  <dd className="text-2xl font-bold text-slate-800 dark:text-slate-100 capitalize">
                    {assessment.selfAssessedLevel}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-600 dark:text-slate-400 mb-1">Session Duration</dt>
                  <dd className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                    {assessment.averageSessionDuration}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-600 dark:text-slate-400 mb-1">Environment</dt>
                  <dd className="text-lg font-medium text-slate-800 dark:text-slate-100 capitalize">
                    {assessment.preferredEnvironment}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-600 dark:text-slate-400 mb-1">Preferred Time</dt>
                  <dd className="text-lg font-medium text-slate-800 dark:text-slate-100 capitalize">
                    {assessment.preferredExerciseTime}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-600 dark:text-slate-400 mb-1">Exercise Types</dt>
                  <dd className="text-lg font-medium text-slate-800 dark:text-slate-100">
                    {assessment.preferredExerciseTypes?.join(", ") || "None"}
                  </dd>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Record Progress Modal */}
      <RecordProgressModal
        isOpen={showProgressModal}
        onClose={() => setShowProgressModal(false)}
        currentWeight={profile?.weightKg ? Number(profile.weightKg) : undefined}
        mode="progress"
        onSuccess={async () => {
          window.location.reload();
        }}
      />

      {/* Record Workout Modal */}
      <RecordProgressModal
        isOpen={showWorkoutModal}
        onClose={() => setShowWorkoutModal(false)}
        mode="workout"
        onSuccess={async () => {
          window.location.reload();
        }}
      />
    </div>
  );
}

export default function ProgressPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    }>
      <ProgressContent />
    </Suspense>
  );
}
