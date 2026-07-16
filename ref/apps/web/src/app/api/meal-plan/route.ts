import { NextRequest, NextResponse } from "next/server";
import { MealPlanService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/** GET /api/meal-plan?date=YYYY-MM-DD – get active meal plan for date */
/** GET /api/meal-plan?from=YYYY-MM-DD&to=YYYY-MM-DD – list saved plans in range */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const fromStr = request.nextUrl.searchParams.get("from");
    const toStr = request.nextUrl.searchParams.get("to");
    if (fromStr && toStr) {
      const from = new Date(fromStr);
      const to = new Date(toStr);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
        return NextResponse.json({ error: "Invalid from/to date" }, { status: 400 });
      const plans = await MealPlanService.getList(user.userId, from, to);
      return NextResponse.json({ success: true, data: plans }, { status: 200 });
    }

    const dateStr = request.nextUrl.searchParams.get("date");
    if (!dateStr) return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });

    const date = new Date(dateStr + "T12:00:00.000Z");
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

    const plan = await MealPlanService.getByDate(user.userId, date);
    return NextResponse.json({ success: true, data: plan }, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to get meal plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
