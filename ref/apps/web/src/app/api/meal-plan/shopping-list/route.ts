import { NextRequest, NextResponse } from "next/server";
import { MealPlanService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/** POST /api/meal-plan/shopping-list – body: { mealPlanId, mealIds?: string[] } – full plan or subset */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const mealPlanId = body?.mealPlanId as string | undefined;
    if (!mealPlanId) return NextResponse.json({ error: "mealPlanId required" }, { status: 400 });

    const rawMealIds = body?.mealIds;
    const mealIds = Array.isArray(rawMealIds)
      ? rawMealIds.filter((id: unknown) => typeof id === "string" && id.length > 0)
      : undefined;

    const list = await MealPlanService.generateShoppingList(user.userId, mealPlanId, {
      mealIds: mealIds && mealIds.length > 0 ? mealIds : undefined,
    });
    return NextResponse.json({ success: true, data: list }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to generate shopping list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
