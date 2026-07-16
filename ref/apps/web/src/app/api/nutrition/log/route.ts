import { NextRequest, NextResponse } from "next/server";
import { NutritionLogService, USER_NOT_FOUND_MESSAGE } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/** POST /api/nutrition/log – body: { date, loggedAt, mealType?, mealId?, recipeId?, items, totals, notes? } */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { date, loggedAt, mealType, mealId, recipeId, items, totals, notes } = body;
    if (!date || !loggedAt || !Array.isArray(items) || !totals) {
      return NextResponse.json({ error: "date, loggedAt, items, totals required" }, { status: 400 });
    }

    const entry = await NutritionLogService.log(user.userId, {
      date,
      loggedAt,
      mealType,
      mealId,
      recipeId,
      items,
      totals: {
        calories: totals.calories ?? 0,
        protein: totals.protein ?? 0,
        carbs: totals.carbs ?? 0,
        fats: totals.fats ?? 0,
      },
      notes,
    });
    return NextResponse.json({ success: true, data: entry }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to log nutrition";
    const isUserNotFound = e instanceof Error && e.message === USER_NOT_FOUND_MESSAGE;
    return NextResponse.json(
      { error: message },
      { status: isUserNotFound ? 401 : 500 }
    );
  }
}
