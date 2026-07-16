import { NextRequest, NextResponse } from "next/server";
import { MealPlanService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/** POST /api/meal-plan/reorder – body: { mealPlanId, mealOrder: [{ mealId, order }] } */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { mealPlanId, mealOrder } = body;
    if (!mealPlanId || !Array.isArray(mealOrder)) {
      return NextResponse.json({ error: "mealPlanId and mealOrder array required" }, { status: 400 });
    }

    const plan = await MealPlanService.reorderMeals(user.userId, mealPlanId, mealOrder);
    return NextResponse.json({ success: true, data: plan }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to reorder meals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
