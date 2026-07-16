import { NextRequest, NextResponse } from "next/server";
import { AiMealPlanService, prisma } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { requireAIProcessingAllowed } from "@/lib/require-ai-processing";

/** POST /api/meal-plan/meals/[mealId]/regenerate – returns one AI-generated meal for this slot (profile-aware). Apply via replace. */
export async function POST(
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
    const generated = await service.regenerateOneMeal(user.userId, {
      mealType: meal.type,
      targetCalories,
    });

    if (!generated) {
      return NextResponse.json({ error: "Could not generate a replacement meal" }, { status: 422 });
    }

    return NextResponse.json({ success: true, data: generated }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to regenerate meal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
