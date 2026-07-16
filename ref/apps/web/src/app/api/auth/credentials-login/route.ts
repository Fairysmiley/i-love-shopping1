import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { z } from "zod";

const credentialsLoginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  twoFactorCode: z.string().optional(),
  redirectUrl: z.string().optional(),
});

const isDev = process.env.NODE_ENV === "development";

/**
 * POST /api/auth/credentials-login
 * Handles credentials-based login via NextAuth
 * This route creates a session after validating credentials
 */
export async function POST(request: NextRequest) {
  let email = "unknown";

  try {
    // Check rate limit
    const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.AUTH_OPERATIONS);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    
    // Better error handling for JSON parsing
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const parsed = credentialsLoginSchema.parse(body);
    email = parsed.email.trim();
    // Don't trim password - passwords should preserve whitespace
    const password = parsed.password;
    const twoFactorCode = parsed.twoFactorCode;
    const redirectUrl = parsed.redirectUrl;

    if (isDev) {
      console.log(`[Credentials-Login API] Login attempt for: ${email.slice(0, 3)}***`);
    }

    // Call NextAuth's signIn function with credentials
    // This will trigger the authorize function in auth.ts
    try {
      const result = await signIn("credentials", {
        email: email, // Already trimmed above
        password, // Don't trim - preserve exact password
        twoFactorCode: twoFactorCode || undefined, // Ensure undefined if not provided
        redirect: false, // We'll handle redirect manually
      });

      // signIn can return undefined on success or an object with error on failure
      if (result?.error) {
        const errorMessage = result.error;
        if (isDev) {
          console.error(`[Credentials-Login API] Login failed for ${email}:`, errorMessage);
        }
        return NextResponse.json(
          { error: errorMessage },
          { status: 401 }
        );
      }

      // Success - signIn returns undefined on success
      if (isDev) {
        console.log(`[Credentials-Login API] Login successful for: ${email}`);
      }

      // Return success with redirect URL
      const finalRedirectUrl = redirectUrl || "/dashboard?firstLogin=true";
      return NextResponse.json({
        success: true,
        redirectUrl: finalRedirectUrl,
      });
    } catch (signInError) {
      // signIn throws errors for authentication failures
      const errorMessage = signInError instanceof Error ? signInError.message : "Login failed";
      if (isDev) {
        console.error(`[Credentials-Login API] signIn error for ${email}:`, errorMessage);
      }
      
      // Check for specific error types
      if (errorMessage.includes("VERIFY_EMAIL")) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 403 }
        );
      }

      if (errorMessage.includes("2FA_REQUIRED")) {
        return NextResponse.json(
          { error: errorMessage, requires2FA: true },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      );
    }
  } catch (error) {
    try {
      if (error instanceof z.ZodError) {
        if (isDev) console.error(`[Credentials-Login API] Validation error:`, error.issues);
        return NextResponse.json(
          { error: error.issues[0]?.message || "Invalid input" },
          { status: 400 }
        );
      }

      const errorMessage = error instanceof Error ? error.message : "Login failed";
      const safeMessage = errorMessage || "Login failed. Please check your credentials.";

      if (isDev) {
        console.error(`[Credentials-Login API] Login failed for ${email}:`, errorMessage);
      }

      // Check for specific error types
      if (errorMessage.includes("VERIFY_EMAIL")) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 403 }
        );
      }

      if (errorMessage.includes("2FA_REQUIRED")) {
        return NextResponse.json(
          { error: errorMessage, requires2FA: true },
          { status: 401 }
        );
      }

      return NextResponse.json(
        {
          error: safeMessage,
          ...(isDev && error instanceof Error ? { details: { name: error.name, message: error.message } } : {}),
        },
        { status: 401 }
      );
    } catch (fallback) {
      if (isDev) console.error(`[Credentials-Login API] Unexpected error:`, fallback);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
}
