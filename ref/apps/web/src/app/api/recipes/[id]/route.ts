import { NextRequest, NextResponse } from "next/server";
import { prisma, enrichRecipeForApi, AiNutritionService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import type { Prisma } from "@wellness-app/server";

/** GET /api/recipes/[id] – recipe detail with ingredients and preparation */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const recipe = await prisma.recipe.findUnique({
      where: { id },
    });
    if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: enrichRecipeForApi(recipe) }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to get recipe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type IngredientRow = { id?: string; name: string; quantity: number; unit?: string };

function normalizeIngredientRows(raw: unknown): IngredientRow[] {
  if (!Array.isArray(raw)) return [];
  const out: IngredientRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = String(r.name ?? "").trim();
    const q = Number(r.quantity);
    if (!name || !Number.isFinite(q) || q <= 0) continue;
    const unit = String(r.unit ?? "g").trim() || "g";
    const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : undefined;
    out.push(id ? { id, name, quantity: q, unit } : { name, quantity: q, unit });
  }
  return out;
}

/** PATCH /api/recipes/[id] – persist ingredient list (e.g. after AI substitute). Body: { ingredients: [...] } */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const ingredients = normalizeIngredientRows(body?.ingredients);
    if (ingredients.length === 0) {
      return NextResponse.json({ error: "ingredients must be a non-empty array" }, { status: 400 });
    }

    const recipe = await prisma.recipe.findUnique({ where: { id } });
    if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

    const servings = Math.max(1, Number(recipe.servings) || 1);
    const forCalc = ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit ?? "g",
    }));

    const nutritionService = new AiNutritionService();
    const totals = await nutritionService.executeNutritionCalculation(forCalc, servings);
    const nutrition = {
      calories: totals.perServing.calories,
      protein: totals.perServing.macros.protein,
      carbs: totals.perServing.macros.carbs,
      fats: totals.perServing.macros.fats,
    };

    await prisma.recipe.update({
      where: { id },
      data: {
        ingredients: ingredients as unknown as Prisma.InputJsonValue,
        nutrition: nutrition as unknown as Prisma.InputJsonValue,
      },
    });

    const updated = await prisma.recipe.findUnique({ where: { id } });
    if (!updated) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: enrichRecipeForApi(updated) }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to update recipe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
