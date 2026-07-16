import { NextRequest, NextResponse } from "next/server";
import { MealPlanService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/** GET /api/meal-plan/versions?date=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dateStr = request.nextUrl.searchParams.get("date");
    if (!dateStr) return NextResponse.json({ error: "date required" }, { status: 400 });

    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

    const versions = await MealPlanService.getVersions(user.userId, date);
    return NextResponse.json({ success: true, data: versions }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to get versions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
