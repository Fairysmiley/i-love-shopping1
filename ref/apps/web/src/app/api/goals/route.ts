import { NextRequest, NextResponse } from "next/server";
import { ProfileService } from "@wellness-app/server";
import { goalSchema } from "@wellness-app/shared";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    
    // Validate input
    const validatedData = goalSchema.parse(body);
    
    // Get user from NextAuth session
    const user = await getUserSession();

    if (!user) {
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json(
          { 
            success: true,
            goal: {
              ...validatedData,
              id: `mock-goal-${Date.now()}`,
              userId: "mock-user",
              achieved: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            message: "Goal saved successfully (mock data)",
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

    // Create/update goal with real data
    const goal = await ProfileService.upsertGoal(user.userId, validatedData);
    
    return NextResponse.json(
      { 
        success: true,
        goal,
        message: "Goal saved successfully"
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    console.error("[Goals API] Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function GET(_request: NextRequest) {
  try {
    // Get user from NextAuth session
    const user = await getUserSession();

    if (!user) {
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json({
          goals: [
            {
              id: "mock-goal-1",
              userId: "mock-user",
              type: "WEIGHT_LOSS",
              targetValue: 65,
              unit: "kg",
              achieved: false,
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

    // Get real goals
    const goals = await ProfileService.getUserGoals(user.userId);
    
    return NextResponse.json({ goals }, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Get Goals API] Error:", error);
    }
    
    // Return mock data on error only in development
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({
        goals: [],
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




