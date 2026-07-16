import { NextRequest, NextResponse } from "next/server";
import { MealPlanService, USER_NOT_FOUND_MESSAGE, type GeneratedPlanPayload } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/** POST /api/meal-plan/save – save a generated plan (body: { date, plan }) */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { date: dateStr, plan } = body;
    const isWeekly = Array.isArray(plan?.days) && plan.days.length > 0;
    const isDaily = plan?.meals && Array.isArray(plan.meals);
    if (!dateStr || (!isDaily && !isWeekly)) return NextResponse.json({ error: "date and plan.meals or plan.days required" }, { status: 400 });

    if (isWeekly) {
      const saved: Awaited<ReturnType<typeof MealPlanService.saveGeneratedPlan>>[] = [];
      const days = plan.days as GeneratedPlanPayload["days"];
      for (const day of days!) {
        const d = new Date(day.date + "T12:00:00.000Z");
        if (Number.isNaN(d.getTime())) continue;
        const dayPlan: GeneratedPlanPayload = { meals: day.meals };
        const s = await MealPlanService.saveGeneratedPlan(user.userId, d, dayPlan);
        saved.push(s);
      }
      return NextResponse.json({ success: true, data: saved }, { status: 200 });
    }

    const date = new Date(dateStr + "T12:00:00.000Z");
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

    const saved = await MealPlanService.saveGeneratedPlan(user.userId, date, plan);
    return NextResponse.json({ success: true, data: saved }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to save meal plan";
    const isUserNotFound = e instanceof Error && e.message === USER_NOT_FOUND_MESSAGE;
    return NextResponse.json(
      { error: message },
      { status: isUserNotFound ? 401 : 500 }
    );
  }
}
