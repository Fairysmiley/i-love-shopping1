import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@wellness-app/server";
import { registerSchema } from "@wellness-app/shared";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { z } from "zod";

export async function POST(request: NextRequest) {
  // Check rate limit (auth operations have strict limits)
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.AUTH_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();

    // Validate input
    const validatedData = registerSchema.parse(body);

    // Get base URL from environment or request
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      new URL(request.url).origin ||
      process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    // Normalize 0.0.0.0 to localhost for local development
    baseUrl = baseUrl.replace(/0\.0\.0\.0/g, "localhost");

    // Register user with base URL for email
    const result = await AuthService.register(validatedData, baseUrl);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((i) => i.message);
      return NextResponse.json(
        { error: messages.join(". ") },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      // Business logic error
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Unknown error
    console.error("[Register API] Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

