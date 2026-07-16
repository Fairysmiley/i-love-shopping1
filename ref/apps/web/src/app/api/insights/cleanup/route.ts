import { NextRequest, NextResponse } from "next/server";
import { InsightsService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/**
 * POST /api/insights/cleanup
 * Clean up stale/outdated insights for the current user
 */
export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserSession();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { prisma } = await import("@wellness-app/server");
    
    // Get count of insights before cleanup
    const beforeCount = await prisma.insight.count({
      where: { userId: user.userId },
    });
    
    const insightsService = new InsightsService();
    
    // Force cleanup of stale insights (including wellness score mismatches)
    // This will delete insights that reference outdated BMI/weight/wellness score values
    await insightsService.cleanupStaleInsights(user.userId);
    
    // Also clean up duplicates and invalid insights
    const service = insightsService as any;
    if (service.cleanupDuplicates) {
      await service.cleanupDuplicates(user.userId);
    }
    if (service.cleanupInvalidInsights) {
      await service.cleanupInvalidInsights(user.userId);
    }

    // Also delete insights with generic "Improving Your Wellness Score" title that have old scores
    // This catches the specific pattern the user mentioned
    const userData = await (insightsService as any).prepareUserData(user.userId);
    const currentWellnessScore = userData.userMetrics.current_state.wellness_score || 0;
    
    if (currentWellnessScore > 0) {
      // Delete insights with "Improving Your Wellness Score" title that mention old scores
      await prisma.insight.deleteMany({
        where: {
          userId: user.userId,
          title: {
            contains: "Improving Your Wellness Score",
          },
          body: {
            contains: "wellness score of",
          },
        },
      });
      
      // Also delete any insight that mentions a wellness score more than 15 points different
      const allInsights = await prisma.insight.findMany({
        where: { userId: user.userId },
      });
      
      const toDelete: string[] = [];
      for (const insight of allInsights) {
        const body = insight.body || "";
        const matches = body.match(/wellness\s+score\s+of\s+(\d+\.?\d*)/gi) || 
                       body.match(/score\s+of\s+(\d+\.?\d*)/gi);
        if (matches) {
          for (const match of matches) {
            const score = parseFloat(match.replace(/wellness\s+score\s+of\s+/gi, "").replace(/score\s+of\s+/gi, ""));
            if (!isNaN(score) && Math.abs(score - currentWellnessScore) > 15) {
              toDelete.push(insight.id);
              break;
            }
          }
        }
      }
      
      if (toDelete.length > 0) {
        await prisma.insight.deleteMany({
          where: {
            id: { in: toDelete },
            userId: user.userId,
          },
        });
      }
    }

    // Get count of insights after cleanup
    const afterCount = await prisma.insight.count({
      where: { userId: user.userId },
    });
    
    const deletedCount = beforeCount - afterCount;

    return NextResponse.json({
      success: true,
      message: deletedCount > 0 
        ? `Successfully cleaned up ${deletedCount} outdated insight${deletedCount === 1 ? '' : 's'}`
        : "No outdated insights found to clean up",
      deletedCount,
      beforeCount,
      afterCount,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Cleanup Insights API] Error:", error);
    }
    
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
