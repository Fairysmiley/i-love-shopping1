import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService, ProfileService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/**
 * GET /api/analytics/wellness-score
 * Get current wellness score and component breakdown
 */
export async function GET(_request: NextRequest) {
  try {
    // Get user from NextAuth session
    const user = await getUserSession();

    // If no user, return mock data only in development
    if (!user) {
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json({
          score: {
            totalScore: 72,
            bmiScore: 80,
            activityScore: 65,
            progressScore: 70,
            habitsScore: 75,
          },
          mock: true,
        });
      }
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if profile is complete - if not, return null
    const isProfileComplete = await ProfileService.isProfileComplete(user.userId);
    if (!isProfileComplete) {
      return NextResponse.json({ score: null });
    }

    // Calculate wellness score
    const score = await AnalyticsService.calculateWellnessScore(user.userId);

    return NextResponse.json({
      score: {
        totalScore: score.totalScore,
        bmiScore: score.bmiScore,
        activityScore: score.activityScore,
        progressScore: score.progressScore,
        habitsScore: score.habitsScore,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Wellness Score API] Error:", error);
    }
    
    // Return mock data on error only in development
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({
        score: {
          totalScore: 65,
          bmiScore: 70,
          activityScore: 60,
          progressScore: 65,
          habitsScore: 70,
        },
        error: "Using fallback data",
        mock: true,
      });
    }
    
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

