import { NextRequest, NextResponse } from "next/server";
import { prisma, AiRecipeRagService, enrichRecipeForApi } from "@wellness-app/server";
import type { Prisma } from "@wellness-app/server";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import {
  collectRecipeTextForDietaryFilter,
  dietaryListForPrismaTagQuery,
  dietaryNeedsIngredientScan,
  expandDietaryInput,
  recipeTextRespectsDietaryFilters,
} from "@/lib/recipe-dietary-ingredient-filter";

const VECTOR_SEARCH_LIMIT = 200;

/** GET /api/recipes?q=&cuisine=&dietary=&maxTime=&maxCalories=&ingredients=&limit=24&page=1 – search, filter, paginate */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.READ_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = request.nextUrl;
    const q = searchParams.get("q") ?? "";
    const cuisine = searchParams.get("cuisine") ?? "";
    const dietaryParams = searchParams.getAll("dietary").filter(Boolean);
    const dietaryList = dietaryParams.length > 0
      ? dietaryParams
      : (searchParams.get("dietary") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const maxTime = searchParams.get("maxTime");
    const maxCalories = searchParams.get("maxCalories");
    const ingredients = searchParams.get("ingredients") ?? "";
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "24", 10)));
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

    const conditions: Prisma.RecipeWhereInput[] = [];
    const textSearchCondition: Prisma.RecipeWhereInput = {
      OR: [
        { title: { contains: q.trim(), mode: "insensitive" } },
        { cuisine: { contains: q.trim(), mode: "insensitive" } },
        { summary: { contains: q.trim(), mode: "insensitive" } },
      ],
    };
    if (q.trim()) conditions.push(textSearchCondition);
    if (cuisine.trim()) conditions.push({ cuisine: { contains: cuisine.trim(), mode: "insensitive" } });
    const dietaryListForTags = dietaryListForPrismaTagQuery(dietaryList);
    if (dietaryListForTags.length > 0) {
      const dietaryConditions = dietaryListForTags
        .map((d) => {
          const tags = expandDietaryInput(d);
          return tags.length > 0 ? { OR: tags.map((tag) => ({ dietaryTags: { has: tag } })) } : null;
        })
        .filter(Boolean);
      if (dietaryConditions.length > 0) {
        conditions.push({ AND: dietaryConditions } as Prisma.RecipeWhereInput);
      }
    }
    let where: Prisma.RecipeWhereInput = conditions.length > 0 ? { AND: conditions } : {};
    if (maxTime) {
      const t = parseInt(maxTime, 10);
      if (!Number.isNaN(t)) where = { ...where, time: { lte: t } };
    }

    const baseSelect = {
      id: true,
      title: true,
      cuisine: true,
      mealType: true,
      servings: true,
      summary: true,
      time: true,
      difficultyLevel: true,
      dietaryTags: true,
      source: true,
      img: true,
      nutrition: true,
    } as const;
    const needDietaryIngredientScan = dietaryNeedsIngredientScan(dietaryList);
    const select = {
      ...baseSelect,
      ...(ingredients.trim() && { ingredients: true }),
      ...(needDietaryIngredientScan && { ingredients: true, preparation: true }),
    };
    type RecipeRow = Prisma.RecipeGetPayload<{ select: typeof baseSelect }> & {
      ingredients?: Prisma.JsonValue;
      preparation?: Prisma.JsonValue;
    };
    let recipes: RecipeRow[];

    if (q.trim()) {
      try {
        const ragService = new AiRecipeRagService();
        const vectorResults = await ragService.retrieveRecipes(q.trim(), VECTOR_SEARCH_LIMIT);
        const vectorIds = vectorResults.map((r) => r.id);
        if (vectorIds.length > 0) {
          const idOrder = new Map(vectorIds.map((id, i) => [id, i]));
          const vectorWhere: Prisma.RecipeWhereInput = { id: { in: vectorIds }, ...where };
          const fetched = await prisma.recipe.findMany({
            where: vectorWhere,
            select,
          });
          recipes = fetched.sort(
            (a: RecipeRow, b: RecipeRow) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999)
          );
        } else {
          recipes = await prisma.recipe.findMany({ where, select, orderBy: { title: "asc" } });
        }
      } catch {
        recipes = await prisma.recipe.findMany({ where, select, orderBy: { title: "asc" } });
      }
    } else {
      recipes = await prisma.recipe.findMany({
        where,
        select,
        orderBy: { title: "asc" },
      });
    }

    if (needDietaryIngredientScan && dietaryList.length > 0) {
      recipes = recipes.filter((r) =>
        recipeTextRespectsDietaryFilters(collectRecipeTextForDietaryFilter(r), dietaryList)
      );
    }

    if (ingredients.trim()) {
      const term = ingredients.trim().toLowerCase();
      recipes = recipes.filter((r) => {
        const ings = r.ingredients as Array<{ name?: string }> | null;
        if (!Array.isArray(ings)) return false;
        return ings.some((i) => (i.name ?? "").toLowerCase().includes(term));
      });
    }
    if (maxCalories) {
      const cal = parseInt(maxCalories, 10);
      if (!Number.isNaN(cal)) {
        recipes = recipes.filter((r) => {
          const nut = r.nutrition as { calories?: number } | null;
          if (!nut || nut.calories == null) return true;
          return nut.calories <= cal;
        });
      }
    }

    const total = recipes.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageSafe = Math.min(page, totalPages);
    const paginated = recipes.slice((pageSafe - 1) * limit, pageSafe * limit);

    const data = paginated.map((r) => enrichRecipeForApi(r));
    return NextResponse.json(
      { success: true, data, total, page: pageSafe, totalPages },
      { status: 200 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to search recipes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
