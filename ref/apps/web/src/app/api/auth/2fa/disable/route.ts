import { NextRequest, NextResponse } from "next/server";
import { TwoFactorService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/**
 * POST /api/auth/2fa/disable
 * Disable 2FA for the current user
 */
export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.AUTH_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserSession();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    await TwoFactorService.disable(user.userId);

    return NextResponse.json({
      success: true,
      message: "2FA has been disabled successfully",
    });
  } catch (error) {
    console.error("[2FA Disable API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disable 2FA" },
      { status: 500 }
    );
  }
}
