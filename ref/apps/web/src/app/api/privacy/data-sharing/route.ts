import { NextRequest, NextResponse } from "next/server";
import { PrivacyService, USER_NOT_FOUND_MESSAGE } from "@wellness-app/server";
import { auth } from "@/lib/auth";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/**
 * GET /api/privacy/data-sharing
 * Get user's data sharing preferences
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

    const preferences = await PrivacyService.getDataSharingPreferences(session.user.id);

    // Also check consent logs for data collection and AI processing
    const allowsDataCollection = await PrivacyService.allowsDataCollection(session.user.id);
    const allowsAIProcessing = await PrivacyService.allowsAIProcessing(session.user.id);
    const allowsDataSharing = preferences.visibility !== "PRIVATE";

    return NextResponse.json({
      preferences: {
        visibility: preferences.visibility,
        sharedWith: preferences.sharedWith,
        allowDataCollection: allowsDataCollection,
        allowAIProcessing: allowsAIProcessing,
        allowDataSharing: allowsDataSharing,
      },
    });
  } catch (error) {
    console.error("[Data Sharing API] Error:", error);
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
 * POST /api/privacy/data-sharing
 * Update user's data sharing preferences
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

    // Validate input. If allowDataSharing is explicitly provided in body, map it to SHARED / PRIVATE
    let visibility = body.visibility;
    if (typeof body.allowDataSharing === "boolean") {
      visibility = body.allowDataSharing ? "SHARED" : "PRIVATE";
    } else if (!visibility) {
      visibility = "PRIVATE";
    }

    if (!["PRIVATE", "PUBLIC", "SHARED"].includes(visibility)) {
      return NextResponse.json(
        { error: "Invalid visibility value" },
        { status: 400 }
      );
    }

    const preferences = await PrivacyService.updateDataSharingPreferences(
      session.user.id,
      {
        visibility,
        sharedWith: body.sharedWith || [],
      }
    );

    // Also update general consent logs if they were passed (which the UI does)
    if (typeof body.allowDataCollection === "boolean" && typeof body.allowAIProcessing === "boolean") {
      await PrivacyService.updateConsents(
        session.user.id,
        body.allowDataCollection,
        body.allowAIProcessing
      );
    }

    return NextResponse.json({
      success: true,
      preferences: {
        visibility: preferences.visibility,
        sharedWith: preferences.sharedWith,
        allowDataCollection: body.allowDataCollection,
        allowAIProcessing: body.allowAIProcessing,
        allowDataSharing: visibility !== "PRIVATE"
      },
      message: "Data sharing preferences updated successfully",
    });
  } catch (error) {
    console.error("[Data Sharing API] Error:", error);
    if (error instanceof Error && error.message === USER_NOT_FOUND_MESSAGE) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
