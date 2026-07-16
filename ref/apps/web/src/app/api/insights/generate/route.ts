import { NextRequest, NextResponse } from "next/server";
import { InsightsService, ProfileService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

export const maxDuration = 300; // 5 minutes

/**
 * POST /api/insights/generate
 * Generate a new health insight for the user
 */
export async function POST(request: NextRequest) {
  // Check rate limit (AI operations have stricter limits)
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.AI_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const insightType = body.type || "health_insight"; // health_insight, weekly_summary, progress_evaluation
    const aspect = body.aspect; // Optional: bmi, activity, goals, habits for aspect-specific regeneration

    // Get user from NextAuth session
    const user = await getUserSession();

    // If no user, return mock insight only in development
    if (!user) {
      if (process.env.NODE_ENV !== "development") {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
      const mockInsights = {
        health_insight: {
          title: "Focus on Consistent Activity",
          body: "Based on your current metrics, increasing your weekly activity frequency will help you reach your fitness goals faster. Aim for at least 4 days of activity per week.",
          priority: "MEDIUM",
          recommendations: [
            "Schedule 4-5 workout sessions this week",
            "Mix cardio and strength training",
            "Track your progress daily",
          ],
          sourceModel: "mock-ai",
          cached: false,
          mock: true,
        },
        weekly_summary: {
          title: "Your Week in Review",
          body: "This week you maintained consistent activity. Your wellness score is stable, and you're making progress toward your goals.",
          priority: "MEDIUM",
          recommendations: [
            "Continue tracking daily metrics",
            "Maintain activity schedule",
            "Review goals weekly",
          ],
          sourceModel: "mock-ai",
          cached: false,
          mock: true,
        },
        progress_evaluation: {
          title: "Progress Evaluation",
          body: "You're making steady progress toward your goals. Continue with your current approach and adjust as needed.",
          priority: "MEDIUM",
          recommendations: [
            "Track metrics consistently",
            "Review goals weekly",
            "Celebrate small wins",
          ],
          sourceModel: "mock-ai",
          cached: false,
          mock: true,
        },
        monthly_summary: {
          title: "Your Monthly Health Summary",
          body: "This month you've maintained consistent activity and made progress toward your goals. Your wellness score has remained stable, and you're on track with your health journey.",
          priority: "MEDIUM",
          recommendations: [
            "Review monthly trends and patterns",
            "Set goals for the upcoming month",
            "Maintain consistent tracking habits",
          ],
          sourceModel: "mock-ai",
          cached: false,
          mock: true,
        },
      };

      return NextResponse.json({
        insight: mockInsights[insightType as keyof typeof mockInsights] || mockInsights.health_insight,
      });
    }

    // Check if profile is complete - if not, return error
    const isProfileComplete = await ProfileService.isProfileComplete(user.userId);
    if (!isProfileComplete) {
      return NextResponse.json(
        { error: "Please complete your profile before generating insights. Required fields: date of birth, gender, height, weight, and activity level." },
        { status: 400 }
      );
    }

    // Generate real insight
    const insightsService = new InsightsService();
    let insight;

    switch (insightType) {
      case "weekly_summary":
        insight = await insightsService.generateWeeklySummary(user.userId);
        break;
      case "monthly_summary":
        insight = await insightsService.generateMonthlySummary(user.userId);
        break;
      case "progress_evaluation":
        insight = await insightsService.generateProgressEvaluation(user.userId);
        break;
      case "multiple":
        // Generate multiple insights covering different aspects
        const multipleInsights = await insightsService.generateMultipleInsights(user.userId);
        return NextResponse.json({
          insights: multipleInsights.map(i => ({
            title: i.title,
            body: i.body,
            priority: i.priority,
            recommendations: i.recommendations || [],
            sourceModel: i.sourceModel,
            cached: i.cached,
            aspect: i.aspect,
          })),
        });
      default:
        // If aspect is specified, generate insight for that specific aspect
        if (aspect && ["bmi", "activity", "goals", "habits"].includes(aspect)) {
          const forceRefresh = body.forceRefresh === true;
          const aspectInsight = await insightsService.generateHealthInsightForAspect(user.userId, aspect as "bmi" | "activity" | "goals" | "habits", forceRefresh);
          return NextResponse.json({
            insight: {
              title: aspectInsight.title,
              body: aspectInsight.body,
              priority: aspectInsight.priority,
              recommendations: aspectInsight.recommendations || [],
              sourceModel: aspectInsight.sourceModel,
              cached: aspectInsight.cached,
              aspect: aspectInsight.aspect,
            },
          });
        }
        insight = await insightsService.generateHealthInsight(user.userId);
    }

    return NextResponse.json({
      insight: {
        title: insight.title,
        body: insight.body,
        priority: insight.priority,
        recommendations: insight.recommendations || [],
        sourceModel: insight.sourceModel,
        cached: insight.cached,
        aspect: (insight as any).aspect, // Include aspect if present
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Generate Insight API] Error:", error);
    }

    if (error instanceof Error && error.message.includes("Rate limit")) {
      return NextResponse.json(
        { error: error.message },
        { status: 429 }
      );
    }

    // Fall back to most recent cached insights from database
    // This ensures users always see recommendations even when AI service is unavailable
    try {
      const user = await getUserSession();
      if (user) {
        const insightsService = new InsightsService();
        const cachedInsights = await InsightsService.prototype.getUserInsights.call(
          insightsService,
          user.userId,
          5
        );

        if (cachedInsights && cachedInsights.length > 0) {
          const latestCached = cachedInsights[0];
          const rawResponse = (latestCached.rawResponse || {}) as Record<string, any>;
          return NextResponse.json({
            insight: {
              title: latestCached.title,
              body: latestCached.body,
              priority: latestCached.priority,
              recommendations: rawResponse.recommendations || [],
              sourceModel: latestCached.sourceModel,
              cached: true,
              fallback: true,
            },
            message: "AI service is currently unavailable. Showing your most recent cached insight.",
          });
        }
      }
    } catch (fallbackError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Generate Insight API] Fallback also failed:", fallbackError);
      }
    }

    return NextResponse.json(
      { error: "AI service is currently unavailable. Please try again later." },
      { status: 503 }
    );
  }
}



