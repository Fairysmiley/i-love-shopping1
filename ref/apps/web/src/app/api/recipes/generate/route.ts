import { NextRequest, NextResponse } from "next/server";
import { AiRecipeRagService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { requireAIProcessingAllowed } from "@/lib/require-ai-processing";
import { toUserFriendlyApiError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.AI_OPERATIONS || RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const blocked = await requireAIProcessingAllowed(user.userId);
    if (blocked) return blocked;

    const { query, dietaryPrefs = [], cuisinePref = "Any" } = await request.json();
    
    if (!query) {
       return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const recipeService = new AiRecipeRagService();
    const recipeResult = await recipeService.generateCustomRecipe(query, dietaryPrefs, cuisinePref);

    return NextResponse.json({
      success: true,
      data: recipeResult,
      message: "Custom recipe generated successfully via RAG"
    }, { status: 200 });

  } catch (error: any) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Recipe Generation API] Error:", error);
    }
    const friendly = toUserFriendlyApiError(error, "We couldn't generate a recipe right now. Please try again.");
    return NextResponse.json(
      { error: friendly.message },
      { status: friendly.status }
    );
  }
}
