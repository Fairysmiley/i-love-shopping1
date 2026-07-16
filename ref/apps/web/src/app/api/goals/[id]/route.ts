import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check rate limit
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id: goalId } = await params;

    // Get user from NextAuth session
    const user = await getUserSession();

    if (!user) {
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json(
          { 
            success: true,
            message: "Goal deleted successfully (mock data)",
            mock: true,
          },
          { status: 200 }
        );
      }
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Delete goal (verify ownership)
    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
    });

    if (!goal) {
      return NextResponse.json(
        { error: "Goal not found" },
        { status: 404 }
      );
    }

    if (goal.userId !== user.userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    await prisma.goal.delete({
      where: { id: goalId },
    });

    return NextResponse.json(
      { 
        success: true,
        message: "Goal deleted successfully"
      },
      { status: 200 }
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Delete Goal API] Error:", error);
    }
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

