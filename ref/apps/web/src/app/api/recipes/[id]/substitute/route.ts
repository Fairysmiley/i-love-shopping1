import { NextRequest, NextResponse } from "next/server";
import { AiRecipeRagService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
/** POST /api/recipes/[id]/substitute – suggest AI substitute for an ingredient */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const ingredientName = body.ingredientName ?? body.ingredient;
    if (!ingredientName || typeof ingredientName !== "string") {
      return NextResponse.json({ error: "ingredientName is required" }, { status: 400 });
    }

    const service = new AiRecipeRagService();

    const rateLimitResponse = await checkRateLimit(
      request,
      RATE_LIMIT_CONFIGS.AI_OPERATIONS || RATE_LIMIT_CONFIGS.WRITE_OPERATIONS,
      user.userId
    );

    const context = {
      reason: body.reason,
      dietaryPrefs: Array.isArray(body.dietaryPrefs) ? body.dietaryPrefs : undefined,
      availableIngredients: Array.isArray(body.availableIngredients) ? body.availableIngredients : undefined,
      quantity: typeof body.quantity === "number" ? body.quantity : undefined,
      unit: typeof body.unit === "string" ? body.unit : undefined,
    };

    const result = rateLimitResponse
      ? await service.suggestIngredientSubstituteHeuristic(id, ingredientName.trim(), context)
      : await service.suggestIngredientSubstitute(id, ingredientName.trim(), context);

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to suggest substitute";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
