import { NextRequest, NextResponse } from "next/server";
import { TwoFactorService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { z } from "zod";

const verifySetupSchema = z.object({
  // Accept either a 6-digit TOTP code or a base32 secret key (with optional spaces/dashes)
  code: z.string().min(6, "Code must be at least 6 characters"),
});

/**
 * POST /api/auth/2fa/verify-setup
 * Verify 2FA code during setup and enable 2FA
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

    const body = await request.json();
    const { code } = verifySetupSchema.parse(body);

    // Verify the code
    const isValid = await TwoFactorService.verifySetupCode(user.userId, code);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid verification code. Please try again." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "2FA has been enabled successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error("[2FA Verify Setup API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify 2FA code" },
      { status: 500 }
    );
  }
}
