import { NextRequest, NextResponse } from "next/server";
import { AiNutritionService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { toUserFriendlyApiError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.AI_OPERATIONS || RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { text } = await request.json();
    if (!text) {
      return NextResponse.json({ error: "Recipe text is required" }, { status: 400 });
    }

    const nutritionService = new AiNutritionService();
    const analysis = await nutritionService.analyzeRecipeNutrition(text);

    return NextResponse.json({
      success: true,
      data: analysis,
      message: "Nutrition analysis generated successfully"
    }, { status: 200 });

  } catch (error: any) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Nutrition Analysis API] Error:", error);
    }
    const friendly = toUserFriendlyApiError(error, "We couldn't analyze this meal right now. Please try again.");
    return NextResponse.json(
      { error: friendly.message },
      { status: friendly.status }
    );
  }
}
