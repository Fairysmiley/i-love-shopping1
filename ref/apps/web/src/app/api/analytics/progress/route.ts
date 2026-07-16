import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/**
 * GET /api/analytics/progress
 * Get progress metrics (weight changes, activity frequency, goal progress, milestones)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "weekly"; // weekly or monthly

    // Get user from NextAuth session
    const user = await getUserSession();

    // If no user, return mock data only in development
    if (!user) {
      if (process.env.NODE_ENV !== "development") {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
      const mockProgress = period === "monthly"
        ? {
          weightChange: -2.5,
          activityFrequencyChange: 2,
          goalProgress: 45,
          milestonesAchieved: [
            "Weight loss: 5% towards goal",
            "Activity: +2 day(s) per week",
          ],
        }
        : {
          weightChange: -0.8,
          activityFrequencyChange: 1,
          goalProgress: 15,
          milestonesAchieved: ["Activity: +1 day(s) per week"],
        };

      return NextResponse.json({
        progress: mockProgress,
        period,
        mock: true,
      });
    }

    // Get real progress data
    const progress = await AnalyticsService.trackProgress(user.userId, period as "weekly" | "monthly");
    const progressData = period === "monthly"
      ? await AnalyticsService.getMonthlyProgress(user.userId)
      : await AnalyticsService.getWeeklyProgress(user.userId);

    // Get starting weight for motivational display
    const startingWeight = await AnalyticsService.getInitialWeight(user.userId);

    return NextResponse.json({
      progress: {
        weightChange: progress.weightChange,
        activityFrequencyChange: progress.activityFrequencyChange,
        goalProgress: progress.goalProgress,
        milestonesAchieved: progress.milestonesAchieved,
        projectedCompletionDates: progress.projectedCompletionDates,
        startingWeight, // First recorded weight
      },
      period,
      details: progressData,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Progress API] Error:", error);
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

