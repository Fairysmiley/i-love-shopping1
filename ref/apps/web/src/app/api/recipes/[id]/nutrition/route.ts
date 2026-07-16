import { NextRequest, NextResponse } from "next/server";
import { AiNutritionService, prisma } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/** POST /api/recipes/[id]/nutrition – recalc nutrition for new servings. Body: { servings } */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.READ_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const recipe = await prisma.recipe.findUnique({ where: { id } });
    if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

    const body = await request.json();
    const newServings = typeof body.servings === "number" ? body.servings : recipe.servings;
    const baseServings = recipe.servings ?? 1;
    const ingredients = (recipe.ingredients as Array<{ name: string; quantity: number; unit?: string }>) ?? [];
    const scale = newServings / baseServings;
    const list = ingredients.map((i) => ({
      name: i.name,
      quantity: scale * i.quantity,
      unit: i.unit ?? "gram",
    }));

    const nutritionService = new AiNutritionService();
    const result = await nutritionService.executeNutritionCalculation(list, 1);
    return NextResponse.json({
      success: true,
      data: {
        servings: newServings,
        calories: result.totalCalories,
        protein: result.totalMacros.protein,
        carbs: result.totalMacros.carbs,
        fats: result.totalMacros.fats,
      },
    }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to calculate nutrition";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
