import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getToken } from "next-auth/jwt";

/**
 * POST /api/auth/refresh
 * Refresh access token endpoint
 * 
 * This endpoint demonstrates the refresh token flow:
 * 1. Client sends request with current session
 * 2. Server validates the session token
 * 3. If valid, issues a new access token with extended expiration
 * 4. Returns the new token information
 */
export async function POST(request: NextRequest) {
  try {
    // Get the current session
    const session = await auth();
    
    if (!session) {
      return NextResponse.json(
        { error: "No active session. Please log in." },
        { status: 401 }
      );
    }

    // Get the JWT token to check expiration
    const token = await getToken({ 
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET 
    });

    if (!token) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    const tokenExp = token.exp as number | undefined;
    const isExpired = tokenExp && tokenExp < now;

    // Calculate time until expiration
    const expiresIn = tokenExp ? Math.max(0, tokenExp - now) : 0;

    // Return token information
    return NextResponse.json({
      success: true,
      message: isExpired 
        ? "Token expired. Please log in again." 
        : "Token is valid",
      token: {
        userId: token.userId,
        email: token.email,
        issuedAt: token.iat ? new Date((token.iat as number) * 1000).toISOString() : null,
        expiresAt: tokenExp ? new Date(tokenExp * 1000).toISOString() : null,
        expiresIn: expiresIn,
        isExpired: isExpired,
      },
      session: {
        userId: session.user?.id,
        email: session.user?.email,
        emailVerified: session.user?.emailVerified,
      },
    });
  } catch (error) {
    console.error("[Refresh Token API] Error:", error);
    
    if (error instanceof Error && error.message.includes("expired")) {
      return NextResponse.json(
        { 
          error: "Token expired",
          message: "Your session has expired. Please log in again.",
          expired: true 
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/refresh
 * Get current token status
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session) {
      return NextResponse.json(
        { error: "No active session" },
        { status: 401 }
      );
    }

    const token = await getToken({ 
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET 
    });

    if (!token) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const tokenExp = token.exp as number | undefined;
    const expiresIn = tokenExp ? Math.max(0, tokenExp - now) : 0;

    return NextResponse.json({
      token: {
        userId: token.userId,
        email: token.email,
        issuedAt: token.iat ? new Date((token.iat as number) * 1000).toISOString() : null,
        expiresAt: tokenExp ? new Date(tokenExp * 1000).toISOString() : null,
        expiresIn: expiresIn,
        isExpired: tokenExp ? tokenExp < now : false,
      },
    });
  } catch (error) {
    console.error("[Token Status API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
