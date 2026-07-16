import { NextRequest, NextResponse } from "next/server";
import { InsightsService, ProfileService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/**
 * GET /api/insights
 * Get user's recent health insights
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");

    // Get user from NextAuth session
    const user = await getUserSession();

    if (!user) {
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json({
          insights: [
            {
              id: "mock-insight-1",
              title: "Maintain Your Progress",
              body: "You're making steady progress toward your wellness goals. Continue tracking your metrics and maintaining your activity level.",
              priority: "MEDIUM",
              sourceModel: "mock-ai",
              createdAt: new Date().toISOString(),
            },
          ],
          mock: true,
        });
      }
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if profile is complete - if not, return empty insights
    const isProfileComplete = await ProfileService.isProfileComplete(user.userId);
    if (!isProfileComplete) {
      return NextResponse.json({ insights: [] });
    }

    // Get real insights
    const insights = await InsightsService.prototype.getUserInsights.call(
      new InsightsService(),
      user.userId,
      limit
    );

    // Extract aspect from rawResponse if available
    const insightsWithAspect = insights.map((insight: any) => {
      const rawResponse = insight.rawResponse || {};
      const aspect = rawResponse.aspect || "general";
      return {
        ...insight,
        aspect,
      };
    });

    return NextResponse.json({ insights: insightsWithAspect });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Insights API] Error:", error);
    }
    
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



