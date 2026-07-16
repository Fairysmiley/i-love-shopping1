import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@wellness-app/server";
import { verifyEmailSchema } from "@wellness-app/shared";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { token } = verifyEmailSchema.parse(body);

    // Verify email
    const result = await AuthService.verifyEmail(token);

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
      const msg = error.message;
      const dbUnreachable =
        /Can't reach database server|P1001/i.test(msg);
      return NextResponse.json(
        {
          error: dbUnreachable
            ? "Database unreachable from this server. If you use Docker for the app, open the verification link on the same URL (e.g. http://localhost:3000). For local `pnpm dev`, publish Postgres with docker-compose.host-ports.yml first."
            : msg,
        },
        { status: 400 }
      );
    }

    console.error("[Verify API] Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

