import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@wellness-app/server";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/auth/login-direct
 * Direct login endpoint that returns user info including 2FA requirement
 * Used by frontend to check if 2FA is needed before calling NextAuth
 */
export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.AUTH_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const user = await AuthService.login(email, password);

    return NextResponse.json({
      userId: user.userId,
      email: user.email,
      requires2FA: user.requires2FA,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : "Login failed";
    return NextResponse.json(
      { error: errorMessage },
      { status: 401 }
    );
  }
}
