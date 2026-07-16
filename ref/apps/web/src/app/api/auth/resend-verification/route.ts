import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@wellness-app/server";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Check rate limit (auth operations have strict limits)
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.AUTH_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { email } = body;
    
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }
    
    // Get base URL from environment or request
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   new URL(request.url).origin || 
                   process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    // Normalize 0.0.0.0 to localhost for local development
    baseUrl = baseUrl.replace(/0\.0\.0\.0/g, "localhost");
    
    const result = await AuthService.resendVerificationEmail(email, baseUrl);
    
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    console.error("[Resend Verification API] Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

