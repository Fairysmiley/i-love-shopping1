import { NextRequest, NextResponse } from "next/server";
import { ProfileService, USER_NOT_FOUND_MESSAGE } from "@wellness-app/server";
import { healthProfileSchema } from "@wellness-app/shared";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS, addRateLimitHeaders } from "@/lib/rate-limit";

/** Avoid importing `Prisma` from `@prisma/client` here — types only exist after `prisma generate` (CI/Docker without scripts would break `next build`). */
function isPrismaForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; name?: unknown };
  return e.code === "P2003" && e.name === "PrismaClientKnownRequestError";
}

export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    
    // Validate input
    const validatedData = healthProfileSchema.parse(body);
    
    // Get user from NextAuth session
    const user = await getUserSession();

    if (!user) {
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json(
          { 
            success: true,
            profile: {
              ...validatedData,
              userId: "mock-user",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            message: "Profile updated successfully (mock data)",
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

    // Update profile with real data
    const profile = await ProfileService.updateHealthProfile(user.userId, validatedData);
    
    return NextResponse.json(
      { 
        success: true,
        profile,
        message: "Profile updated successfully"
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    // Stale session after DB reset: JWT userId no longer exists in User table
    if (isPrismaForeignKeyViolation(error)) {
      return NextResponse.json({ error: USER_NOT_FOUND_MESSAGE }, { status: 401 });
    }

    // Handle Zod validation errors with user-friendly messages
    if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues: unknown }).issues)) {
      const zodError = error as { issues: Array<{ path?: unknown[]; message?: string }> };
      // Zod validation error
      const firstError = zodError.issues[0];
      const fieldName = firstError.path?.[0] || "field";
      let userMessage = "";
      
      if (fieldName === "dateOfBirth") {
        userMessage = "Please enter a valid date of birth";
      } else if (fieldName === "gender") {
        userMessage = "Please select your gender";
      } else if (fieldName === "heightCm") {
        userMessage = "Please enter a valid height";
      } else if (fieldName === "weightKg") {
        userMessage = "Please enter a valid weight";
      } else if (fieldName === "activityLevel") {
        userMessage = "Please select your activity level";
      } else if (fieldName === "dietaryPreferences") {
        userMessage = "Please check your dietary preferences";
      } else if (fieldName === "dietaryRestrictions") {
        userMessage = "Please check your dietary restrictions";
      } else if (fieldName === "timezone") {
        userMessage = "Please select your timezone";
      } else {
        userMessage = firstError.message || "Please check your input and try again";
      }
      
      return NextResponse.json(
        { error: userMessage },
        { status: 400 }
      );
    }
    
    if (error instanceof Error) {
      if (error.message === USER_NOT_FOUND_MESSAGE) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }

      // Handle other errors with user-friendly messages
      let userMessage = error.message;

      if (
        userMessage.includes("Foreign key constraint") ||
        userMessage.includes("UserProfile_userId_fkey")
      ) {
        return NextResponse.json({ error: USER_NOT_FOUND_MESSAGE }, { status: 401 });
      }

      // Convert technical errors to user-friendly messages
      if (userMessage.includes("Invalid") || userMessage.includes("expected one of")) {
        userMessage = "Please make sure all required fields are filled correctly";
      } else if (userMessage.includes("Required")) {
        userMessage = "Please fill in all required fields";
      } else if (userMessage.includes("must be")) {
        userMessage = "Please check that your input values are correct";
      }
      
      return NextResponse.json(
        { error: userMessage },
        { status: 400 }
      );
    }
    
    if (process.env.NODE_ENV === "development") {
      console.error("[Profile API] Error:", error);
    }
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
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
          profile: {
            userId: "mock-user",
            dateOfBirth: new Date("1990-01-01"),
            gender: "male",
            heightCm: 175,
            weightKg: 70,
            activityLevel: "MODERATE",
            dietaryPreferences: ["vegetarian"],
            dietaryRestrictions: [],
            timezone: "UTC",
          },
          mock: true,
        });
      }
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get real profile
    const profile = await ProfileService.getHealthProfile(user.userId);
    
    return NextResponse.json({ profile }, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Get Profile API] Error:", error);
    }
    
    // Return mock data on error only in development
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({
        profile: {
          userId: "mock-user",
          dateOfBirth: new Date("1990-01-01"),
          gender: "male",
          heightCm: 175,
          weightKg: 70,
          activityLevel: "MODERATE",
          dietaryPreferences: [],
          dietaryRestrictions: [],
          timezone: "UTC",
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




