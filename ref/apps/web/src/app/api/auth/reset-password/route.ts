import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@wellness-app/server";
import { resetPasswordSchema } from "@wellness-app/shared";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { z } from "zod";

export async function POST(request: NextRequest) {
  // Check rate limit (auth operations have strict limits)
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.AUTH_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();

    // Validate input
    const { token, password } = resetPasswordSchema.parse(body);

    // Reset password
    const result = await AuthService.resetPassword(token, password);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((i) => i.message);
      return NextResponse.json(
        { error: messages.join(". ") },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error("[Reset Password API] Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}




