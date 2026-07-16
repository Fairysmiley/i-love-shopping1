import { NextRequest, NextResponse } from "next/server";
import { MealPlanService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/** POST /api/meal-plan/shopping-list/items – add manual row. Body: { mealPlanId, ingredientName, quantity, unit, category? } */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { mealPlanId, ingredientName, quantity, unit, category } = body;
    if (!mealPlanId || !ingredientName || typeof quantity !== "number" || !unit) {
      return NextResponse.json(
        { error: "mealPlanId, ingredientName, quantity, and unit are required" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "quantity must be a positive number" },
        { status: 400 }
      );
    }

    const item = await MealPlanService.addShoppingListItem(user.userId, mealPlanId, {
      ingredientName: String(ingredientName),
      quantity,
      unit: String(unit),
      category: typeof category === "string" ? category : undefined,
    });

    return NextResponse.json({ success: true, data: item }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to add item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
