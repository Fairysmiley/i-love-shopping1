import { NextRequest, NextResponse } from "next/server";
import { PrivacyService, USER_NOT_FOUND_MESSAGE } from "@wellness-app/server";
import { auth } from "@/lib/auth";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/**
 * GET /api/privacy/notifications
 * Get user's notification preferences
 */
export async function GET(request: NextRequest) {
  // Check rate limit (read operation)
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.READ_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const preferences = await PrivacyService.getNotificationPreferences(session.user.id);

    return NextResponse.json({
      preferences: {
        emailUpdates: preferences.emailUpdates,
        aiInsights: preferences.aiInsights,
        progressReminders: preferences.progressReminders,
      },
    });
  } catch (error) {
    console.error("[Notification Preferences API] Error:", error);
    if (error instanceof Error && error.message === USER_NOT_FOUND_MESSAGE) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/privacy/notifications
 * Update user's notification preferences
 */
export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate input
    const preferences = await PrivacyService.updateNotificationPreferences(
      session.user.id,
      {
        emailUpdates: body.emailUpdates,
        aiInsights: body.aiInsights,
        progressReminders: body.progressReminders,
      }
    );

    return NextResponse.json({
      success: true,
      preferences: {
        emailUpdates: preferences.emailUpdates,
        aiInsights: preferences.aiInsights,
        progressReminders: preferences.progressReminders,
      },
      message: "Notification preferences updated successfully",
    });
  } catch (error) {
    console.error("[Notification Preferences API] Error:", error);
    if (error instanceof Error && error.message === USER_NOT_FOUND_MESSAGE) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
