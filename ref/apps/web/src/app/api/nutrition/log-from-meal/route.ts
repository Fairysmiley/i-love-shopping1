import { NextRequest, NextResponse } from "next/server";
import { NutritionLogService, USER_NOT_FOUND_MESSAGE } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/** POST /api/nutrition/log-from-meal – body: { mealId, date (YYYY-MM-DD), loggedAt?, portion? } */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const mealId = typeof body.mealId === "string" ? body.mealId.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim() : "";
    if (!mealId || !date) {
      return NextResponse.json({ error: "mealId and date (YYYY-MM-DD) are required" }, { status: 400 });
    }
    const dateParsed = new Date(date);
    if (Number.isNaN(dateParsed.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const loggedAt = typeof body.loggedAt === "string" ? body.loggedAt : undefined;
    const portion = body.portion != null ? Number(body.portion) : undefined;

    const entry = await NutritionLogService.logFromMeal(user.userId, {
      mealId,
      date,
      loggedAt,
      portion: Number.isFinite(portion) ? portion : undefined,
    });
    return NextResponse.json({ success: true, data: entry }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to log from meal";
    const isUserNotFound = e instanceof Error && e.message === USER_NOT_FOUND_MESSAGE;
    if (message === "Meal not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json(
      { error: message },
      { status: isUserNotFound ? 401 : 500 }
    );
  }
}
