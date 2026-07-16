import { NextRequest, NextResponse } from "next/server";
import { TwoFactorService } from "@wellness-app/server";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { z } from "zod";

const verifyLoginSchema = z.object({
  userId: z.string(),
  // Accept either a 6-digit TOTP code or a base32 secret key (with optional spaces/dashes)
  code: z.string().min(6, "Code must be at least 6 characters"),
});

/**
 * POST /api/auth/2fa/verify-login
 * Verify 2FA code during login
 * This is called after password verification when user has 2FA enabled
 */
export async function POST(request: NextRequest) {
  // Check rate limit (strict for login)
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.AUTH_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { userId, code } = verifyLoginSchema.parse(body);

    // Verify the code
    const isValid = await TwoFactorService.verifyLoginCode(userId, code);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid verification code. Please try again." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "2FA verification successful",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error("[2FA Verify Login API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify 2FA code" },
      { status: 500 }
    );
  }
}
