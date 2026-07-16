import { NextRequest, NextResponse } from "next/server";
import { MealPlanService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

/** PATCH /api/meal-plan/shopping-list/[itemId] – body: { quantity?, excluded? } */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const user = await getUserSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { itemId } = await params;
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

    const body = await request.json();
    const updates: {
      quantity?: number;
      excluded?: boolean;
      checked?: boolean;
      ingredientName?: string;
      unit?: string;
      category?: string;
    } = {};
    if (typeof body.quantity === "number") updates.quantity = body.quantity;
    if (typeof body.excluded === "boolean") updates.excluded = body.excluded;
    if (typeof body.checked === "boolean") updates.checked = body.checked;
    if (typeof body.ingredientName === "string") updates.ingredientName = body.ingredientName;
    if (typeof body.unit === "string") updates.unit = body.unit;
    if (typeof body.category === "string") updates.category = body.category;
    if (typeof updates.quantity === "number" && (!Number.isFinite(updates.quantity) || updates.quantity <= 0)) {
      return NextResponse.json({ error: "quantity must be a positive number" }, { status: 400 });
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Provide at least one updatable field: quantity, excluded, checked, ingredientName, unit, category" },
        { status: 400 }
      );
    }

    const item = await MealPlanService.updateShoppingItem(user.userId, itemId, updates);
    return NextResponse.json({ success: true, data: item }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to update item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
