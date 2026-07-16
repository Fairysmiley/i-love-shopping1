import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

/** POST /api/feedback – submit user feedback for RAG quality */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMIT_CONFIGS.WRITE_OPERATIONS);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const type = body.type ?? body.kind;
    if (!type || !["recipe", "ingredient", "generated_recipe"].includes(type)) {
      return NextResponse.json({ error: "type must be recipe, ingredient, or generated_recipe" }, { status: 400 });
    }

    const rating = body.rating != null ? Math.min(5, Math.max(1, Number(body.rating))) : null;
    const correction = typeof body.correction === "string" ? body.correction.trim() || null : null;
    const targetId = typeof body.targetId === "string" ? body.targetId : null;
    const context = body.context && typeof body.context === "object" ? body.context : null;

    const feedback = await prisma.ragFeedback.create({
      data: {
        userId: user.userId,
        type,
        targetId,
        rating: rating ?? undefined,
        correction: correction ?? undefined,
        context: context ?? undefined,
      },
    });

    return NextResponse.json({ success: true, data: { id: feedback.id } }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to submit feedback";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
