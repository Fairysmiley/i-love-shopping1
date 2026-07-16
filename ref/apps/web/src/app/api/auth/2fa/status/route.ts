import { NextRequest, NextResponse } from "next/server";
import { TwoFactorService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/**
 * GET /api/auth/2fa/status
 * Get 2FA status for the current user
 */
export async function GET(request: NextRequest) {
  // Check rate limit (read operation)
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.READ_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserSession();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const status = await TwoFactorService.getStatus(user.userId);

    return NextResponse.json({
      status,
    });
  } catch (error) {
    console.error("[2FA Status API] Error:", error);
    return NextResponse.json(
      { error: "Failed to get 2FA status" },
      { status: 500 }
    );
  }
}
