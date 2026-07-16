import { NextRequest, NextResponse } from "next/server";
import { ProgressService, ProfileService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/**
 * POST /api/progress/metrics
 * Record a health metric snapshot (weight, height, endurance, strength, etc.)
 * This creates time-series data for progress tracking
 */
export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();

    // Get user from NextAuth session
    const user = await getUserSession();

    if (!user) {
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json(
          {
            success: true,
            snapshot: {
              id: "mock-snapshot",
              userId: "mock-user",
              ...body,
              recordedAt: new Date().toISOString(),
            },
            message: "Metric recorded successfully (mock data)",
            mock: true,
          },
          { status: 200 }
        );
      }
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Validate input
    const data: {
      weightKg?: number;
      heightCm?: number;
      enduranceMinutes?: number;
      strengthPushups?: number;
      strengthSquats?: number;
      bodyFatPercentage?: number;
      notes?: string;
      activityLevel?: string;
      weeklyActivityFrequency?: number;
    } = {};

    if (body.weightKg !== undefined) {
      const weight = Number(body.weightKg);
      if (weight < 20 || weight > 500) {
        return NextResponse.json(
          { error: "Weight must be between 20kg and 500kg" },
          { status: 400 }
        );
      }
      data.weightKg = weight;
    }

    if (body.heightCm !== undefined) {
      const height = Number(body.heightCm);
      if (height < 50 || height > 300) {
        return NextResponse.json(
          { error: "Height must be between 50cm and 300cm" },
          { status: 400 }
        );
      }
      data.heightCm = height;
    }

    if (body.enduranceMinutes !== undefined) {
      const value = Number(body.enduranceMinutes);
      if (value < 0) {
        return NextResponse.json({ error: "Endurance minutes cannot be negative" }, { status: 400 });
      }
      data.enduranceMinutes = value;
    }

    if (body.strengthPushups !== undefined) {
      const value = Number(body.strengthPushups);
      if (value < 0) {
        return NextResponse.json({ error: "Push-ups count cannot be negative" }, { status: 400 });
      }
      data.strengthPushups = value;
    }

    if (body.strengthSquats !== undefined) {
      const value = Number(body.strengthSquats);
      if (value < 0) {
        return NextResponse.json({ error: "Squats count cannot be negative" }, { status: 400 });
      }
      data.strengthSquats = value;
    }

    if (body.bodyFatPercentage !== undefined) {
      const bfp = Number(body.bodyFatPercentage);
      if (bfp < 0 || bfp > 100) {
        return NextResponse.json(
          { error: "Body fat percentage must be between 0% and 100%" },
          { status: 400 }
        );
      }
      data.bodyFatPercentage = bfp;
    }

    if (body.notes) {
      data.notes = String(body.notes);
    }

    // Handle activity updates
    if (body.activityLevel || body.weeklyActivityFrequency !== undefined) {
      const [existingProfile, latestAssessment] = await Promise.all([
        ProfileService.getHealthProfile(user.userId),
        ProfileService.getLatestFitnessAssessment(user.userId)
      ]);

      // Only update profile if level has actually changed
      if (body.activityLevel && existingProfile && existingProfile.activityLevel !== body.activityLevel) {
        data.activityLevel = body.activityLevel;
        await ProfileService.updateHealthProfile(user.userId, {
          ...existingProfile,
          activityLevel: body.activityLevel as any,
        } as any);
      }

      // Only create new assessment if frequency or other lifestyle factors have changed
      if (body.weeklyActivityFrequency !== undefined && latestAssessment) {
        const newFreq = Number(body.weeklyActivityFrequency);
        if (latestAssessment.weeklyActivityFrequency !== newFreq) {
          data.weeklyActivityFrequency = newFreq;
          await ProfileService.createFitnessAssessment(user.userId, {
            ...latestAssessment,
            weeklyActivityFrequency: newFreq,
          } as any);
        }
      }
    }

    // Record the metric snapshot
    const snapshot = await ProgressService.recordHealthMetric(
      user.userId,
      data,
      body.timestamp ? new Date(body.timestamp) : undefined
    );

    return NextResponse.json(
      {
        success: true,
        snapshot,
        message: "Metric recorded successfully"
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (error instanceof Error) {
      // Handle duplicate entry error
      if (error.message.includes("Duplicate entry") || error.message.includes("duplicate")) {
        return NextResponse.json(
          { error: "You've already recorded a metric for this date. Please choose a different date." },
          { status: 409 }
        );
      }

      // Convert technical errors to user-friendly messages
      let userMessage = error.message;
      if (userMessage.includes("Invalid") || userMessage.includes("expected")) {
        userMessage = "Please make sure all values are entered correctly";
      } else if (userMessage.includes("Required")) {
        userMessage = "Please fill in at least one metric to record";
      } else if (userMessage.includes("must be") || userMessage.includes("between")) {
        // Keep validation messages as they're already user-friendly
        userMessage = error.message;
      }

      return NextResponse.json(
        { error: userMessage },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.error("[Progress Metrics API] Error:", error);
    }
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
