import { NextRequest, NextResponse } from "next/server";
import { ProfileService } from "@wellness-app/server";
import { getUserSession } from "@/lib/get-user-session";

export async function GET(_request: NextRequest) {
  try {
    const user = await getUserSession();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", isComplete: false },
        { status: 401 }
      );
    }

    const isComplete = await ProfileService.isProfileComplete(user.userId);
    
    return NextResponse.json({ isComplete }, { status: 200 });
  } catch (error) {
    console.error("[Profile Check Complete API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", isComplete: false },
      { status: 500 }
    );
  }
}
