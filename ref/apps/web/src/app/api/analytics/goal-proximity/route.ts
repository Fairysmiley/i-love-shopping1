import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/**
 * GET /api/analytics/goal-proximity
 * Get goal proximity calculations (distance to targets)
 */
export async function GET(_request: NextRequest) {
  try {
    // Get user from NextAuth session
    const user = await getUserSession();

    if (!user) {
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json({
          proximities: {
            weight_loss_goal: 65,
            activity_goal: 40,
            fitness_goal: 55,
          },
          mock: true,
        });
      }
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get real goal proximities
    const proximities = await AnalyticsService.calculateGoalProximity(user.userId);

    return NextResponse.json({
      proximities,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Goal Proximity API] Error:", error);
    }
    
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

