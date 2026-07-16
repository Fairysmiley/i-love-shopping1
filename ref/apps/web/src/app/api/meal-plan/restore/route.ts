import { NextRequest, NextResponse } from "next/server";
import { MealPlanService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/** POST /api/meal-plan/restore – body: { mealPlanId } */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { mealPlanId } = await request.json();
    if (!mealPlanId) return NextResponse.json({ error: "mealPlanId required" }, { status: 400 });

    const plan = await MealPlanService.restoreVersion(user.userId, mealPlanId);
    return NextResponse.json({ success: true, data: plan }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to restore version";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
