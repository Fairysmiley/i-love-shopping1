import { NextRequest, NextResponse } from "next/server";
import {
  AiMealPlanService,
  tryAcquireMealPlanGenerationLock,
  releaseMealPlanGenerationLock,
  mealPlanGenerationLockKey,
} from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { requireAIProcessingAllowed } from "@/lib/require-ai-processing";
import { toUserFriendlyApiError } from "@/lib/api-error";

/** Shown with `fallbackUsed` so users know what to check without exposing internal errors. */
const MEAL_PLAN_FALLBACK_HINTS = [
  "Confirm Ollama is running and `OLLAMA_BASE_URL` is reachable from the process serving this API (Next.js in Docker uses `http://ollama:11434`; `pnpm dev` on the host uses your `.env` URL, often `http://localhost:11434` — start Ollama there or publish it with `docker-compose.host-ports.yml`).",
  "On CPU or for weekly plans, try raising MEAL_PLAN_OLLAMA_MS (see .env.example).",
  "For automatic cloud retry on Ollama errors (meal plans only), set `GEMINI_API_KEY` from Google AI Studio; use `MEAL_PLAN_GEMINI_FALLBACK=false` to turn that off. With a key set, Ollama gets a short first attempt (`MEAL_PLAN_OLLAMA_PRIMARY_MS`, default 90s) then Gemini uses the full `MEAL_PLAN_OLLAMA_MS` budget.",
  "If JSON parse errors persist, try a slightly larger model or generate a daily plan first.",
];

const MEAL_PLAN_PROFILE_FALLBACK_HINTS = [
  "Save a complete Health profile under Edit profile → Physical & Bio (height, weight, date of birth, gender, activity level).",
  "If you recreated the dev database, sign out and sign in again so your session matches the new User rows.",
];

/** Accepts finite numbers and numeric strings so meal structure overrides are never dropped silently. */
function parseOptionalMealPlanInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return undefined;
}

function messageFromUnknownError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "unknown error";
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const blocked = await requireAIProcessingAllowed(user.userId);
    if (blocked) return blocked;

    const body = await request.json();
    const duration = body.duration ?? "daily";
    const date = body.date ?? new Date().toISOString();
    const nutritionTargetSource = body.nutritionTargetSource === "ai" ? "ai" : "user";
    const mealsPerDayOverride = parseOptionalMealPlanInt(body.mealsPerDay);
    const snacksPerDayOverride = parseOptionalMealPlanInt(body.snacksPerDay);
    const lockKey = mealPlanGenerationLockKey(user.userId, duration, date);
    if (!tryAcquireMealPlanGenerationLock(lockKey)) {
      return NextResponse.json(
        { error: "A meal plan is already being generated for this day. Please wait." },
        { status: 409 }
      );
    }

    try {
      const rateLimitResponse = await checkRateLimit(
        request,
        RATE_LIMIT_CONFIGS.AI_OPERATIONS || RATE_LIMIT_CONFIGS.WRITE_OPERATIONS,
        user.userId
      );
      if (rateLimitResponse) return rateLimitResponse;

      const mealPlanService = new AiMealPlanService();
      let mealPlan;
      let usedFallback = false;
      let fallbackHints = MEAL_PLAN_FALLBACK_HINTS;
      let primaryFailureMessage: string | undefined;
      try {
        mealPlan = await mealPlanService.generateMealPlan(user.userId, {
          duration,
          date,
          nutritionTargetSource,
          mealsPerDayOverride,
          snacksPerDayOverride,
        });
      } catch (primaryError) {
        // Recovery mechanism: return deterministic fallback instead of failing the request.
        const errMsg = messageFromUnknownError(primaryError);
        primaryFailureMessage = errMsg;
        console.warn(
          "[Meal Plan API] Primary AI generation failed; serving deterministic fallback.",
          errMsg.slice(0, 500)
        );
        mealPlan = await mealPlanService.generateMockMealPlanFallback(user.userId, {
          duration,
          date,
          nutritionTargetSource,
          mealsPerDayOverride,
          snacksPerDayOverride,
        });
        usedFallback = true;
        fallbackHints = /user profile not found/i.test(errMsg)
          ? MEAL_PLAN_PROFILE_FALLBACK_HINTS
          : MEAL_PLAN_FALLBACK_HINTS;
      }

      const fallbackReason =
        usedFallback && primaryFailureMessage
          ? primaryFailureMessage.replace(/\s+/g, " ").trim().slice(0, 420)
          : undefined;

      const mealPlanDebug =
        usedFallback || process.env.MEAL_PLAN_DEBUG === "1" || process.env.NODE_ENV === "development";
      if (mealPlanDebug) {
        const dayMeals = Array.isArray(mealPlan?.plan?.meals)
          ? mealPlan.plan.meals
          : Array.isArray(mealPlan?.plan?.days?.[0]?.meals)
            ? mealPlan.plan.days[0].meals
            : [];
        const returnedTypes = dayMeals.map((m: { type?: string }) => String(m.type ?? "unknown").toLowerCase());
        console.info("[Meal Plan API] Structure debug", {
          duration,
          date,
          mealsPerDayOverride,
          snacksPerDayOverride,
          fallbackUsed: usedFallback,
          returnedMealCount: dayMeals.length,
          returnedTypes,
        });
      }

      return NextResponse.json(
        {
          success: true,
          data: mealPlan,
          message: usedFallback
            ? "Meal plan generated using recovery fallback due to a temporary AI issue."
            : "Meal plan generated successfully",
          fallbackUsed: usedFallback,
          ...(usedFallback ? { fallbackHints, ...(fallbackReason ? { fallbackReason } : {}) } : {}),
        },
        { status: 200 }
      );
    } finally {
      releaseMealPlanGenerationLock(lockKey);
    }

  } catch (error: any) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Meal Plan API] Error:", error);
    }
    const friendly = toUserFriendlyApiError(error, "We couldn't generate a meal plan right now. Please try again.");
    return NextResponse.json(
      { error: friendly.message },
      { status: friendly.status }
    );
  }
}
