import { NextResponse } from "next/server";

/**
 * GET /api/auth/debug
 * Diagnostic endpoint to check OAuth configuration
 * Only available in development
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  
  const config = {
    environment: process.env.NODE_ENV,
    baseUrl,
    expectedCallbacks: {
      google: `${baseUrl}/api/auth/callback/google`,
      github: `${baseUrl}/api/auth/callback/github`,
    },
    credentials: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.substring(0, 20)}...` : "NOT SET",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ? "SET" : "NOT SET",
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID ? `${process.env.GITHUB_CLIENT_ID.substring(0, 20)}...` : "NOT SET",
        clientSecret: process.env.GITHUB_CLIENT_SECRET ? "SET" : "NOT SET",
      },
    },
    instructions: {
      google: "Go to Google Cloud Console → Your OAuth client → Authorized redirect URIs must include the callback URL above",
      github: "Go to GitHub Settings → Developer settings → OAuth Apps → Edit your app → Authorization callback URL must match the callback URL above exactly",
    },
  };

  return NextResponse.json(config, { 
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
