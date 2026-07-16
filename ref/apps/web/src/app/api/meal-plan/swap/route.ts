import { NextRequest, NextResponse } from "next/server";
import { MealPlanService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/** POST /api/meal-plan/swap – body: { mealIdA, mealIdB } – swap two meals from different days */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { mealIdA, mealIdB } = body;
    if (!mealIdA || !mealIdB) {
      return NextResponse.json({ error: "mealIdA and mealIdB required" }, { status: 400 });
    }

    const { planA, planB } = await MealPlanService.swapMeals(user.userId, mealIdA, mealIdB);
    return NextResponse.json({ success: true, data: { planA, planB } }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to swap meals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
