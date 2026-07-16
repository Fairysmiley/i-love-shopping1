import { NextRequest, NextResponse } from "next/server";
import { MealPlanService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/** PUT /api/meal-plan/meals/[mealId]/replace – body: { name, type, calories, macros, description? } */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ mealId: string }> }
) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { mealId } = await params;
    if (!mealId) return NextResponse.json({ error: "mealId required" }, { status: 400 });

    const body = await request.json();
    const { name, type, calories, macros, description, ingredients } = body;
    if (!name || !type || typeof calories !== "number" || !macros) {
      return NextResponse.json({ error: "name, type, calories, macros required" }, { status: 400 });
    }

    const meal = await MealPlanService.replaceMeal(user.userId, mealId, {
      name,
      type,
      calories,
      macros: { protein: macros.protein ?? 0, carbs: macros.carbs ?? 0, fats: macros.fats ?? 0 },
      description,
      ingredients: Array.isArray(ingredients) ? ingredients : undefined,
    });
    return NextResponse.json({ success: true, data: meal }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to replace meal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
