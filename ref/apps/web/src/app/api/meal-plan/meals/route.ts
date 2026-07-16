import { NextRequest, NextResponse } from "next/server";
import { MealPlanService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/** POST /api/meal-plan/meals – add a meal to plan. Body: { mealPlanId, type, name, calories, macros, description? } */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { mealPlanId, type, name, calories, macros, description, ingredients } = body;
    if (!mealPlanId || !type || !name || typeof calories !== "number" || !macros) {
      return NextResponse.json({ error: "mealPlanId, type, name, calories, macros required" }, { status: 400 });
    }

    const meal = await MealPlanService.addMeal(user.userId, mealPlanId, {
      type,
      name,
      calories,
      macros: { protein: macros.protein ?? 0, carbs: macros.carbs ?? 0, fats: macros.fats ?? 0 },
      description,
      ingredients: Array.isArray(ingredients) ? ingredients : undefined,
    });
    return NextResponse.json({ success: true, data: meal }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to add meal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
