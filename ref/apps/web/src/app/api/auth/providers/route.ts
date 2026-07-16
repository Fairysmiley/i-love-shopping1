import { NextResponse } from "next/server";

/**
 * GET /api/auth/providers
 * Returns which OAuth providers are configured
 */
export async function GET() {
  // Debug: Log environment variables (values masked for security)
  const googleId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  const githubId = process.env.GITHUB_CLIENT_ID;
  const githubSecret = process.env.GITHUB_CLIENT_SECRET;

  const providers = {
    google: !!(googleId && googleSecret),
    github: !!(githubId && githubSecret),
  };

  return NextResponse.json({ providers });
}

