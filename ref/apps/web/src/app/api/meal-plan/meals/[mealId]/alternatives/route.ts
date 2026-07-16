import { NextRequest, NextResponse } from "next/server";
import { AiMealPlanService, prisma } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { requireAIProcessingAllowed } from "@/lib/require-ai-processing";

/** GET /api/meal-plan/meals/[mealId]/alternatives – returns 2–3 alternative meals for this slot (same type, similar calories) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mealId: string }> }
) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const blocked = await requireAIProcessingAllowed(user.userId);
    if (blocked) return blocked;

    const { mealId } = await params;
    if (!mealId) return NextResponse.json({ error: "mealId required" }, { status: 400 });

    const meal = await prisma.meal.findFirst({
      where: { id: mealId },
      include: { mealPlan: true },
    });
    if (!meal || meal.mealPlan.userId !== user.userId) {
      return NextResponse.json({ error: "Meal not found" }, { status: 404 });
    }

    const nutrition = meal.nutrition as { calories?: number } | null;
    const targetCalories = typeof nutrition?.calories === "number" ? nutrition.calories : 400;

    const service = new AiMealPlanService();
    const alternatives = await service.getAlternativeMeals(user.userId, {
      mealType: meal.type,
      targetCalories,
      count: 3,
    });

    return NextResponse.json({ success: true, data: alternatives }, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to get alternatives";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
