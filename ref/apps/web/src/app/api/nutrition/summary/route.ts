import { NextRequest, NextResponse } from "next/server";
import {
  NutritionLogService,
  ProfileService,
  AiNutritionService,
  buildNutritionSuggestions,
  buildWeeklyAverageSuggestions,
} from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

function pct(actual: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.round((actual / target) * 100);
}

function buildStructuredNutritionSummary(
  intake: { calories: number; protein: number; carbs: number; fats: number },
  targets: { calories: number; protein: number; carbs: number; fats: number },
  context: { kind: "daily" | "weekly"; label: string; entryCount?: number }
): {
  title: string;
  achievements: string[];
  concerns: string[];
  macroBalance: string[];
} {
  const achievements: string[] = [];
  const concerns: string[] = [];
  const macroBalance: string[] = [];

  const calPct = pct(intake.calories, targets.calories);
  const pPct = pct(intake.protein, targets.protein);
  const cPct = pct(intake.carbs, targets.carbs);
  const fPct = pct(intake.fats, targets.fats);

  if (calPct >= 90 && calPct <= 110) {
    achievements.push(`Calories are close to target (${calPct}% of ${Math.round(targets.calories)} kcal).`);
  } else if (calPct < 75) {
    concerns.push(`Calories are significantly below target (${calPct}% of ${Math.round(targets.calories)} kcal).`);
  } else if (calPct > 120) {
    concerns.push(`Calories are significantly above target (${calPct}% of ${Math.round(targets.calories)} kcal).`);
  }

  if (pPct >= 90) achievements.push(`Protein intake is strong (${pPct}% of target).`);
  else concerns.push(`Protein is below goal (${pPct}% of target).`);

  if (cPct < 70) concerns.push(`Carbohydrates are low (${cPct}% of target).`);
  else if (cPct > 130) concerns.push(`Carbohydrates are high (${cPct}% of target).`);
  else macroBalance.push(`Carbohydrates are within a reasonable range (${cPct}% of target).`);

  if (fPct < 70) concerns.push(`Fats are low (${fPct}% of target).`);
  else if (fPct > 130) concerns.push(`Fats are high (${fPct}% of target).`);
  else macroBalance.push(`Fats are within a reasonable range (${fPct}% of target).`);

  macroBalance.push(`Macro target coverage: P ${pPct}% · C ${cPct}% · F ${fPct}%.`);

  if ((context.entryCount ?? 0) === 0) {
    concerns.push(`No meals logged for ${context.label}; summary quality improves with more entries.`);
  }

  if (achievements.length === 0) {
    achievements.push("Progress is still building; consistent logging helps surface stronger wins.");
  }
  if (concerns.length === 0) {
    concerns.push("No major concerns detected for this period.");
  }

  return {
    title:
      context.kind === "daily"
        ? `Daily nutrition summary (${context.label})`
        : `Period nutrition summary (${context.label})`,
    achievements,
    concerns,
    macroBalance,
  };
}

function buildImprovementSuggestions(
  intake: { calories: number; protein: number; carbs: number; fats: number },
  targets: { calories: number; protein: number; carbs: number; fats: number }
): Array<{ category: "food" | "timing" | "portion" | "ingredients" | "meal_plan"; suggestion: string }> {
  const calPct = pct(intake.calories, targets.calories);
  const pPct = pct(intake.protein, targets.protein);
  const cPct = pct(intake.carbs, targets.carbs);
  const fPct = pct(intake.fats, targets.fats);

  const food =
    pPct < 90
      ? "Add one protein-forward food today (e.g., eggs, Greek yogurt, tofu, fish, or beans) to improve protein coverage."
      : cPct < 90
        ? "Include one quality carb source (e.g., oats, brown rice, fruit, or potatoes) to balance energy."
        : fPct < 90
          ? "Include healthy fats (olive oil, avocado, nuts/seeds) in one meal to improve fat balance."
          : "Keep your current food pattern; rotate protein and produce choices for micronutrient variety.";

  const timing =
    calPct < 85
      ? "Spread intake across 3 main meals and add a planned snack between lunch and dinner to reduce late-day under-eating."
      : calPct > 115
        ? "Shift more calories earlier (breakfast/lunch) and keep dinner lighter to improve total-day control."
        : "Keep meal timing consistent (roughly every 3–5 hours) to support stable appetite and energy.";

  const portion =
    calPct < 85
      ? "Increase portions by ~10–15% for one or two meals (especially protein and whole-carb components)."
      : calPct > 115
        ? "Reduce portions by ~10–15% for energy-dense items first (oils, sauces, sweets, and large starch servings)."
        : "Portions look close to target; keep current sizes and adjust only if trends drift for 3+ days.";

  const ingredients =
    fPct > 130
      ? "Swap higher-fat ingredients for leaner alternatives (e.g., full-fat dairy → low-fat, fatty cuts → lean protein)."
      : cPct > 130
        ? "Swap refined carbs for higher-fiber alternatives (white bread/rice → whole-grain options)."
        : "Use simple ingredient swaps when needed: yogurt ↔ skyr, rice ↔ quinoa, almond butter ↔ peanut/sunflower butter.";

  const mealPlan =
    pPct < 90 || calPct < 90
      ? "Optimize tomorrow’s meal plan with one extra high-protein snack and a more substantial lunch."
      : calPct > 115
        ? "Optimize tomorrow’s meal plan by replacing one calorie-dense snack with fruit + protein."
        : "Optimize weekly planning by keeping your current structure and introducing 2–3 new recipe variations.";

  return [
    { category: "food", suggestion: food },
    { category: "timing", suggestion: timing },
    { category: "portion", suggestion: portion },
    { category: "ingredients", suggestion: ingredients },
    { category: "meal_plan", suggestion: mealPlan },
  ];
}

/** GET /api/nutrition/summary?date=YYYY-MM-DD or ?start=YYYY-MM-DD&end=YYYY-MM-DD for weekly */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const dateStr = searchParams.get("date");
    const startStr = searchParams.get("start");
    const endStr = searchParams.get("end");

    const aiNutrition = new AiNutritionService();

    if (dateStr) {
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      const daily = await NutritionLogService.getDailyTotal(user.userId, date);
      const entries = await NutritionLogService.getByDate(user.userId, date);
      const profile = await ProfileService.getHealthProfile(user.userId).catch(() => null);
      const macroTargets = (profile?.macronutrientTargets as { protein?: number; carbs?: number; fats?: number } | null) ?? {};
      const targets = {
        calories: profile?.calorieTarget ?? 2000,
        protein: macroTargets.protein ?? 100,
        carbs: macroTargets.carbs ?? 200,
        fats: macroTargets.fats ?? 60,
      };
      const deterministicSuggestions =
        entries.length === 0
          ? [
              `No meals logged for ${dateStr}. Add entries above to compare this day to your targets.`,
            ]
          : buildNutritionSuggestions(
              {
                calories: daily.calories,
                protein: daily.protein,
                carbs: daily.carbs,
                fats: daily.fats,
              },
              targets
            );
      const aiSuggestions =
        entries.length === 0
          ? []
          : await aiNutrition.generateSummarySuggestions({
              kind: "daily",
              intake: {
                calories: daily.calories,
                protein: daily.protein,
                carbs: daily.carbs,
                fats: daily.fats,
              },
              targets,
              context: { entryCount: entries.length, dateLabel: dateStr },
            });
      const suggestions = aiSuggestions.length > 0 ? aiSuggestions : deterministicSuggestions;
      const summary = buildStructuredNutritionSummary(
        {
          calories: daily.calories,
          protein: daily.protein,
          carbs: daily.carbs,
          fats: daily.fats,
        },
        targets,
        { kind: "daily", label: dateStr, entryCount: entries.length }
      );
      const improvementSuggestions = buildImprovementSuggestions(
        {
          calories: daily.calories,
          protein: daily.protein,
          carbs: daily.carbs,
          fats: daily.fats,
        },
        targets
      );
      return NextResponse.json(
        {
          success: true,
          data: {
            kind: "daily" as const,
            ...daily,
            entries,
            targets,
            suggestions,
            summary,
            improvementSuggestions,
          },
        },
        { status: 200 }
      );
    }

    if (startStr && endStr) {
      const start = new Date(startStr);
      const end = new Date(endStr);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return NextResponse.json({ error: "Invalid start or end date" }, { status: 400 });
      }
      const days = await NutritionLogService.getWeeklyTotals(user.userId, start, end);
      const profile = await ProfileService.getHealthProfile(user.userId).catch(() => null);
      const macroTargets = (profile?.macronutrientTargets as { protein?: number; carbs?: number; fats?: number } | null) ?? {};
      const targets = {
        calories: profile?.calorieTarget ?? 2000,
        protein: macroTargets.protein ?? 100,
        carbs: macroTargets.carbs ?? 200,
        fats: macroTargets.fats ?? 60,
      };
      const deterministicWeekly = buildWeeklyAverageSuggestions(
        days.map((d) => ({
          calories: d.calories,
          protein: d.protein,
          carbs: d.carbs,
          fats: d.fats,
        })),
        targets
      );
      const avg = days.length
        ? days.reduce(
            (acc, d) => ({
              calories: acc.calories + d.calories,
              protein: acc.protein + d.protein,
              carbs: acc.carbs + d.carbs,
              fats: acc.fats + d.fats,
            }),
            { calories: 0, protein: 0, carbs: 0, fats: 0 }
          )
        : { calories: 0, protein: 0, carbs: 0, fats: 0 };
      const aiWeekly = await aiNutrition.generateSummarySuggestions({
        kind: "weekly",
        intake: {
          calories: avg.calories / Math.max(1, days.length),
          protein: avg.protein / Math.max(1, days.length),
          carbs: avg.carbs / Math.max(1, days.length),
          fats: avg.fats / Math.max(1, days.length),
        },
        targets,
        context: { entryCount: days.length, dateLabel: `${startStr}..${endStr}` },
      });
      const weeklySuggestions = aiWeekly.length > 0 ? aiWeekly : deterministicWeekly;
      const avgDaily = {
        calories: avg.calories / Math.max(1, days.length),
        protein: avg.protein / Math.max(1, days.length),
        carbs: avg.carbs / Math.max(1, days.length),
        fats: avg.fats / Math.max(1, days.length),
      };
      const summary = buildStructuredNutritionSummary(
        avgDaily,
        targets,
        { kind: "weekly", label: `${startStr}..${endStr}`, entryCount: days.length }
      );
      const improvementSuggestions = buildImprovementSuggestions(avgDaily, targets);
      return NextResponse.json(
        {
          success: true,
          data: {
            kind: "weekly" as const,
            days,
            targets,
            weeklySuggestions,
            summary,
            improvementSuggestions,
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: "Provide date= or start= and end=" }, { status: 400 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to get summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
