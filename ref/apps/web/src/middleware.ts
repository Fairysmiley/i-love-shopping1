import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Auth routes - login, register, password reset, etc. (accessible without auth)
const authRoutes = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify",
  "/auth/verify-pending",
  "/auth/error",
];

// Public routes - accessible without authentication
const publicRoutes = [
  "/", // Home page
];

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Allow NextAuth API routes to pass through (they handle their own auth)
  if (pathname.startsWith("/api/auth")) {
    // Sanitize callbackUrl in NextAuth signin requests to prevent redirect loops
    if (pathname === "/api/auth/signin") {
      const callbackUrl = searchParams.get("callbackUrl");
      if (callbackUrl && (callbackUrl.includes("/auth/login") || callbackUrl.includes("/auth/register") || callbackUrl.includes("/auth/error"))) {
        const url = new URL(request.url);
        url.searchParams.set("callbackUrl", "/dashboard");
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next();
  }

  // Skip middleware for Next.js internal routes
  if (pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  // Decode the session token to check for authentication and email verification
  // This securely verifies the JWT signature
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "wellness-secret-key-change-in-production"
  });

  const hasSession = !!token;
  const isEmailVerified = !!token?.emailVerified;

  // Check if it's a public route
  const isPublicRoute = publicRoutes.some((route) => pathname === route);

  // Check if it's an auth route
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // Allow public routes without authentication
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Allow auth routes if not logged in
  if (isAuthRoute && !hasSession) {
    return NextResponse.next();
  }

  // Handle authenticated users on auth pages
  if (isAuthRoute && hasSession) {
    // Allow verify routes (for clicking email links or checking status)
    if (pathname.startsWith("/auth/verify")) {
      // If on verify-pending but already verified, go to dashboard
      if (pathname === "/auth/verify-pending" && isEmailVerified) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return NextResponse.next();
    }

    // Allow signout
    if (pathname.startsWith("/auth/signout")) {
      return NextResponse.next();
    }

    // Redirect unverified users to pending page if they try to access login/register
    if (!isEmailVerified) {
      return NextResponse.redirect(new URL("/auth/verify-pending", request.url));
    }

    // Redirect verified users to dashboard
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Protected routes (dashboard, profile, etc.)
  if (!hasSession) {
    // For API routes, return 401 Unauthorized
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // For page routes, redirect to login
    const url = new URL("/auth/login", request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Enforce email verification for protected routes
  if (!isEmailVerified) {
    if (!pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/auth/verify-pending", request.url));
    }
    // For API, return 403 Forbidden for unverified users
    return NextResponse.json(
      { error: "Email verification required" },
      { status: 403 }
    );
  }

  // User is authenticated and verified - allow access
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     * - api/auth routes (handled separately in middleware)
     * 
     * Note: We include /api/auth/signin to sanitize callbackUrl
     */
    /*
     * Match all paths except:
     * - api/auth (NextAuth routes)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - files with extensions (images, etc.)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*|_next).*)",
  ],
};

