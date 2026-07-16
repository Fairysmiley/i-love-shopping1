import { NextRequest, NextResponse } from "next/server";
import { ConsentService } from "@wellness-app/server";
import { consentSchema } from "@wellness-app/shared";
import { auth } from "@/lib/auth";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    // Get user from NextAuth session
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate input
    const validatedData = consentSchema.parse(body);
    
    // Record consent
    const result = await ConsentService.recordConsent(session.user.id, validatedData);
    
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      // Handle invalid session / user not found - return 401 to trigger re-authentication
      if (error.message.startsWith("USER_NOT_FOUND:")) {
        return NextResponse.json(
          { error: error.message, requiresReauth: true },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    console.error("[Consent API] Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function GET(_request: NextRequest) {
  try {
    // Get user from NextAuth session
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user consents
    const consents = await ConsentService.getUserConsents(session.user.id);
    
    return NextResponse.json({ consents }, { status: 200 });
  } catch (error) {
    console.error("[Get Consent API] Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}




