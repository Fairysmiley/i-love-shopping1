import { NextRequest, NextResponse } from "next/server";
import { ProfileService, AnalyticsService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/**
 * GET /api/profile/history
 * Get historical changes to user profile metrics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "30");
    const metric = searchParams.get("metric") || "all"; // weight, height, activity, all

    // Get user from NextAuth session
    const user = await getUserSession();

    // If no user, return mock history only in development
    if (!user) {
      if (process.env.NODE_ENV !== "development") {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
      const mockHistory = {
        weight: Array.from({ length: 10 }, (_, i) => ({
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
          value: 70 - i * 0.1,
          change: i === 0 ? 0 : -0.1,
        })),
        height: [],
        activity: [],
        mock: true,
      };

      return NextResponse.json({ history: mockHistory });
    }

    // Get real history
    const [metrics, scores] = await Promise.all([
      ProfileService.getHealthMetricHistory(user.userId, limit).catch(() => []),
      AnalyticsService.getWellnessScoreHistory(user.userId, limit).catch(() => []),
    ]);

    // Get current profile for comparison
    const profile = await ProfileService.getHealthProfile(user.userId).catch(() => null);

    // Build history object
    const history: any = {
      weight: [],
      height: [],
      activity: [],
      wellnessScore: [],
      metrics: [], // Include full metrics with notes
    };

    // Sort metrics by date ascending (oldest first) to calculate changes correctly
    const sortedMetricsForCalc = [...metrics].sort((a: any, b: any) => 
      new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );

    let previousWeight: number | null = null;
    let previousHeight: number | null = null;

    // Build weight and height history with changes calculated from previous entry
    sortedMetricsForCalc.forEach((m: any) => {
      const date = m.recordedAt?.toISOString() || new Date().toISOString();
      
      // Add full metric entry with notes
      if (m.notes || m.enduranceMinutes || m.strengthPushups || m.strengthSquats) {
        history.metrics.push({
          date,
          weightKg: m.weightKg ? Number(m.weightKg) : null,
          enduranceMinutes: m.enduranceMinutes,
          strengthPushups: m.strengthPushups,
          strengthSquats: m.strengthSquats,
          notes: m.notes,
        });
      }

      if (m.weightKg && (metric === "all" || metric === "weight")) {
        const weight = Number(m.weightKg);
        history.weight.push({
          date,
          value: weight,
          change: previousWeight !== null ? weight - previousWeight : 0,
          bmi: m.bmi,
        });
        previousWeight = weight;
      }

      if (m.heightCm && (metric === "all" || metric === "height")) {
        const height = Number(m.heightCm);
        history.height.push({
          date,
          value: height,
          change: previousHeight !== null ? height - previousHeight : 0,
        });
        previousHeight = height;
      }
    });
    
    // Reverse to show newest first in the UI
    history.weight.reverse();
    history.height.reverse();
    history.metrics.reverse();

    // Add activity level changes (from profile updates)
    if (profile && (metric === "all" || metric === "activity")) {
      history.activity.push({
        date: profile.updatedAt?.toISOString() || profile.createdAt?.toISOString(),
        value: profile.activityLevel,
        change: null,
      });
    }

    // Add wellness scores - only show as many as there are health metrics
    // Since wellness scores should correspond to health metric recordings,
    // we limit to the number of health metrics and use their dates
    const sortedMetrics = [...metrics]
      .filter((m: any) => m.recordedAt)
      .sort((a: any, b: any) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
    
    // Sort scores chronologically (oldest first) for matching
    const sortedScores = [...scores].sort((a: any, b: any) => 
      new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );
    
    // Only show wellness scores up to the number of health metrics
    const maxEntries = sortedMetrics.length;
    
    sortedScores.slice(0, maxEntries).forEach((s: any, index: number) => {
      // Use the health metric date for alignment
      const alignedDate = sortedMetrics[index]?.recordedAt?.toISOString() || s.recordedAt?.toISOString();
      
      history.wellnessScore.push({
        date: alignedDate,
        value: s.score,
        bmiScore: s.bmiScore,
        activityScore: s.activityScore,
        progressScore: s.progressScore,
        habitsScore: s.habitsScore,
      });
    });

    return NextResponse.json({ history });
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

