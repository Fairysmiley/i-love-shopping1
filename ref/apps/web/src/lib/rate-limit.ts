import { NextRequest, NextResponse } from "next/server";
import { rateLimitService, RATE_LIMIT_CONFIGS, type RateLimitConfig } from "@wellness-app/server";
import { getUserSession } from "./get-user-session";

/**
 * Rate limit middleware for API routes
 * 
 * Usage:
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
 *   if (rateLimitResponse) return rateLimitResponse;
 *   
 *   // Your route handler code...
 * }
 * ```
 */
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  identifier?: string
): Promise<NextResponse | null> {
  // Get identifier (user ID or IP address)
  let id = identifier;
  
  if (!id) {
    // Try to get user ID from session
    try {
      const user = await getUserSession();
      if (user) {
        id = user.userId;
      }
    } catch {
      // If session check fails, use IP address
    }
  }

  // Fallback to IP address if no user ID
  if (!id) {
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || "unknown";
    id = `ip:${ip}`;
  }

  // In development, use much higher limits to avoid 429 during normal browsing
  const effectiveConfig =
    process.env.NODE_ENV === "development"
      ? { ...config, requestsPerMinute: 300, requestsPerHour: 10000 }
      : config;

  const result = rateLimitService.checkLimit(id, effectiveConfig);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        message: `Too many requests. Please try again after ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter,
        resetAt: new Date(result.resetAt).toISOString(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": result.retryAfter?.toString() || "60",
          "X-RateLimit-Limit": config.requestsPerMinute.toString(),
          "X-RateLimit-Remaining": result.remaining.toString(),
          "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
        },
      }
    );
  }

  // Add rate limit headers to successful responses
  return null; // Return null to indicate request should proceed
}

/**
 * Wrapper function to add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  config: RateLimitConfig,
  remaining: number,
  resetAt: number
): NextResponse {
  response.headers.set("X-RateLimit-Limit", config.requestsPerMinute.toString());
  response.headers.set("X-RateLimit-Remaining", remaining.toString());
  response.headers.set("X-RateLimit-Reset", new Date(resetAt).toISOString());
  return response;
}

// Re-export configs for convenience
export { RATE_LIMIT_CONFIGS };
