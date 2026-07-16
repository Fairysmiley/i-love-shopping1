import { NextRequest, NextResponse } from "next/server";
import { ProfileService } from "@wellness-app/server";
import { fitnessAssessmentSchema } from "@wellness-app/shared";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    
    // Validate input
    const validatedData = fitnessAssessmentSchema.parse(body);
    
    // Get user from NextAuth session
    const user = await getUserSession();

    if (!user) {
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json(
          { 
            success: true,
            assessment: {
              ...validatedData,
              userId: "mock-user",
              id: "mock-assessment",
              createdAt: new Date().toISOString(),
            },
            message: "Fitness assessment saved successfully (mock data)",
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

    // Create fitness assessment with real data
    const assessment = await ProfileService.createFitnessAssessment(user.userId, validatedData);
    
    return NextResponse.json(
      { 
        success: true,
        assessment,
        message: "Fitness assessment saved successfully"
      },
      { status: 200 }
    );
  } catch (error: any) {
    // Handle Zod validation errors with user-friendly messages
    if (error?.issues && Array.isArray(error.issues)) {
      // Zod validation error
      const firstError = error.issues[0];
      const fieldName = firstError.path?.[0] || "field";
      let userMessage = "";
      
      if (fieldName === "selfAssessedLevel") {
        userMessage = "Please select your fitness level (Beginner, Intermediate, or Advanced)";
      } else if (fieldName === "averageSessionDuration") {
        userMessage = "Please select your average workout session duration";
      } else if (fieldName === "preferredEnvironment") {
        userMessage = "Please select where you prefer to exercise";
      } else if (fieldName === "preferredExerciseTime") {
        userMessage = "Please select when you prefer to exercise";
      } else if (fieldName === "preferredExerciseTypes") {
        userMessage = "Please select at least one type of exercise you enjoy";
      } else if (fieldName === "weeklyActivityFrequency") {
        userMessage = "Please enter how many days per week you exercise (0-7)";
      } else {
        userMessage = firstError.message || "Please check your input and try again";
      }
      
      return NextResponse.json(
        { error: userMessage },
        { status: 400 }
      );
    }
    
    if (error instanceof Error) {
      // Handle other errors with user-friendly messages
      let userMessage = error.message;
      
      // Convert technical errors to user-friendly messages
      if (userMessage.includes("Invalid option") || userMessage.includes("expected one of")) {
        userMessage = "Please make sure all required fields are filled correctly";
      }
      
      return NextResponse.json(
        { error: userMessage },
        { status: 400 }
      );
    }
    
    if (process.env.NODE_ENV === "development") {
      console.error("[Fitness Assessment API] Error:", error);
    }
    return NextResponse.json(
      { error: "An error occurred while saving your fitness assessment. Please try again." },
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
          assessment: {
            id: "mock-assessment",
            userId: "mock-user",
            weeklyActivityFrequency: 3,
            preferredExerciseTypes: ["cardio", "strength"],
            averageSessionDuration: "30-60min",
            selfAssessedLevel: "intermediate",
            preferredEnvironment: "gym",
            preferredExerciseTime: "evening",
            createdAt: new Date().toISOString(),
          },
          mock: true,
        });
      }
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get real assessment
    const assessment = await ProfileService.getLatestFitnessAssessment(user.userId);
    
    return NextResponse.json({ assessment }, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Get Fitness Assessment API] Error:", error);
    }
    
    // Return mock data on error only in development
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({
        assessment: {
          id: "mock-assessment",
          userId: "mock-user",
          weeklyActivityFrequency: 3,
          preferredExerciseTypes: ["cardio"],
          averageSessionDuration: "30-60min",
          selfAssessedLevel: "beginner",
          preferredEnvironment: "home",
          preferredExerciseTime: "flexible",
          createdAt: new Date().toISOString(),
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




