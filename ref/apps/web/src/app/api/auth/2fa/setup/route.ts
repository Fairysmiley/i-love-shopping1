import { NextRequest, NextResponse } from "next/server";
import { TwoFactorService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/**
 * POST /api/auth/2fa/setup
 * Generate a new 2FA secret and QR code for setup
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

    // Get user email for QR code
    const { prisma } = await import("@wellness-app/server");
    const userRecord = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { email: true },
    });

    if (!userRecord) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Generate secret and QR code
    const result = await TwoFactorService.generateSecret(user.userId, userRecord.email);

    // Development only: Generate a valid code for easy testing
    let debugCode: string | undefined;
    if (process.env.NODE_ENV === "development") {
      debugCode = TwoFactorService.generateCurrentToken(result.secret);
    }

    return NextResponse.json({
      success: true,
      secret: result.secret,
      qrCodeUrl: result.qrCodeUrl,
      manualEntryKey: result.manualEntryKey,
      debugCode,
      message: "Scan the QR code with your authenticator app, then verify with a code to enable 2FA",
    });
  } catch (error) {
    console.error("[2FA Setup API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate 2FA secret" },
      { status: 500 }
    );
  }
}
