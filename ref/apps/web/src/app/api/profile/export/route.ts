import { NextRequest, NextResponse } from "next/server";
import { ProfileService, AnalyticsService, InsightsService, MealPlanService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/**
 * GET /api/profile/export
 * Export all user data including historical metrics
 */
export async function GET(request: NextRequest) {
  // Check rate limit (read operation, but more expensive)
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.READ_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json"; // json or csv

    // Get user from NextAuth session
    const user = await getUserSession();

    // If no user, return mock export data only in development
    if (!user) {
      if (process.env.NODE_ENV !== "development") {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
      const mockData = {
        profile: {
          dateOfBirth: "1990-01-01",
          gender: "male",
          heightCm: 175,
          weightKg: 70,
          activityLevel: "MODERATE",
          dietaryPreferences: ["vegetarian"],
          dietaryRestrictions: [],
        },
        goals: [],
        fitnessAssessment: null,
        healthMetrics: [],
        wellnessScores: [],
        insights: [],
        exportedAt: new Date().toISOString(),
      };

      if (format === "csv") {
        return new NextResponse(
          `Metric,Value\nDate of Birth,${mockData.profile.dateOfBirth}\nGender,${mockData.profile.gender}\nHeight (cm),${mockData.profile.heightCm}\nWeight (kg),${mockData.profile.weightKg}\nActivity Level,${mockData.profile.activityLevel}\n`,
          {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": `attachment; filename="wellness-export-${new Date().toISOString().split("T")[0]}.csv"`,
            },
          }
        );
      }

      return NextResponse.json(mockData, {
        headers: {
          "Content-Disposition": `attachment; filename="wellness-export-${new Date().toISOString().split("T")[0]}.json"`,
        },
      });
    }

    // Get all user data
    const [profile, goals, assessment, metrics, scores, insights, mealPlans] = await Promise.all([
      ProfileService.getHealthProfile(user.userId).catch(() => null),
      ProfileService.getUserGoals(user.userId).catch(() => []),
      ProfileService.getLatestFitnessAssessment(user.userId).catch(() => null),
      ProfileService.getHealthMetricHistory(user.userId, 1000).catch(() => []),
      AnalyticsService.getWellnessScoreHistory(user.userId, 1000).catch(() => []),
      new InsightsService().getUserInsights(user.userId, 100).catch(() => []),
      MealPlanService.exportMealPlansForDataExport(user.userId, 80).catch(() => []),
    ]);

    const exportData = {
      profile: profile ? {
        dateOfBirth: profile.dateOfBirth?.toISOString(),
        gender: profile.gender,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        activityLevel: profile.activityLevel,
        occupation: profile.occupation,
        dietaryPreferences: profile.dietaryPreferences,
        dietaryRestrictions: profile.dietaryRestrictions,
        timezone: profile.timezone,
        createdAt: profile.createdAt?.toISOString(),
        updatedAt: profile.updatedAt?.toISOString(),
      } : null,
      goals: goals.map((g: any) => ({
        type: g.type,
        targetValue: g.targetValue,
        unit: g.unit,
        createdAt: g.createdAt?.toISOString(),
      })),
      fitnessAssessment: assessment ? {
        weeklyActivityFrequency: assessment.weeklyActivityFrequency,
        preferredExerciseTypes: assessment.preferredExerciseTypes,
        averageSessionDuration: assessment.averageSessionDuration,
        selfAssessedLevel: assessment.selfAssessedLevel,
        preferredEnvironment: assessment.preferredEnvironment,
        preferredExerciseTime: assessment.preferredExerciseTime,
        createdAt: assessment.createdAt?.toISOString(),
      } : null,
      healthMetrics: metrics.map((m: any) => ({
        weightKg: m.weightKg,
        heightCm: m.heightCm,
        bmi: m.bmi,
        bmiClassification: m.bmiClassification,
        recordedAt: m.recordedAt?.toISOString(),
      })),
      wellnessScores: scores.map((s: any) => ({
        score: s.score,
        bmiScore: s.bmiScore,
        activityScore: s.activityScore,
        progressScore: s.progressScore,
        habitsScore: s.habitsScore,
        recordedAt: s.recordedAt?.toISOString(),
      })),
      insights: insights.map((i: any) => ({
        title: i.title,
        body: i.body,
        priority: i.priority,
        createdAt: i.createdAt?.toISOString(),
      })),
      mealPlans,
      exportedAt: new Date().toISOString(),
    };

    if (format === "csv") {
      // Convert to CSV format
      let csv = "Metric,Value,Date\n";
      
      if (exportData.profile) {
        csv += `Date of Birth,${exportData.profile.dateOfBirth || ""},${exportData.profile.createdAt || ""}\n`;
        csv += `Gender,${exportData.profile.gender || ""},${exportData.profile.createdAt || ""}\n`;
        csv += `Height (cm),${exportData.profile.heightCm || ""},${exportData.profile.updatedAt || ""}\n`;
        csv += `Weight (kg),${exportData.profile.weightKg || ""},${exportData.profile.updatedAt || ""}\n`;
        csv += `Activity Level,${exportData.profile.activityLevel || ""},${exportData.profile.updatedAt || ""}\n`;
      }

      // Add health metrics
      exportData.healthMetrics.forEach((m: any) => {
        csv += `Weight Record,${m.weightKg},${m.recordedAt}\n`;
        csv += `BMI Record,${m.bmi},${m.recordedAt}\n`;
      });

      // Add wellness scores
      exportData.wellnessScores.forEach((s: any) => {
        csv += `Wellness Score,${s.score},${s.recordedAt}\n`;
      });

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="wellness-export-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    return NextResponse.json(exportData, {
      headers: {
        "Content-Disposition": `attachment; filename="wellness-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Export API] Error:", error);
    }
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
}

