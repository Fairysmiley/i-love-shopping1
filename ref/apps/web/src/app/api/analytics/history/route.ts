import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService, ProfileService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/**
 * GET /api/analytics/history
 * Get historical wellness scores and health metrics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "30");

    // Get user from NextAuth session
    const user = await getUserSession();

    // If no user, return mock historical data only in development
    if (!user) {
      if (process.env.NODE_ENV !== "development") {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
      const mockScores = Array.from({ length: Math.min(limit, 30) }, (_, i) => ({
        id: `mock-${i}`,
        recordedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        score: 65 + Math.floor(Math.random() * 15),
        bmiScore: 70 + Math.floor(Math.random() * 10),
        activityScore: 60 + Math.floor(Math.random() * 15),
        progressScore: 65 + Math.floor(Math.random() * 10),
        habitsScore: 70 + Math.floor(Math.random() * 10),
      }));

      const mockMetrics = Array.from({ length: Math.min(limit, 30) }, (_, i) => ({
        id: `mock-metric-${i}`,
        recordedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        weightKg: 70 - (i * 0.1),
        heightCm: 175,
        bmi: 22.9 - (i * 0.03),
        bmiClassification: "normal_weight",
      }));

      return NextResponse.json({
        scores: mockScores,
        metrics: mockMetrics,
        mock: true,
      });
    }

    // Get real historical data
    const [scores, metrics] = await Promise.all([
      AnalyticsService.getWellnessScoreHistory(user.userId, limit),
      ProfileService.getHealthMetricHistory(user.userId, limit),
    ]);

    return NextResponse.json({
      scores,
      metrics,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[History API] Error:", error);
    }
    
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

