import { NextResponse } from "next/server";
import { PrivacyService } from "@wellness-app/server";

/**
 * Blocks AI-backed routes when the user has explicitly disabled AI processing (REVIEWED pattern).
 */
export async function requireAIProcessingAllowed(userId: string): Promise<NextResponse | null> {
  if (await PrivacyService.isAIProcessingExplicitlyDisabled(userId)) {
    return NextResponse.json(
      {
        error:
          "AI processing is disabled in your privacy settings. Enable it under Profile → Privacy to use this feature.",
      },
      { status: 403 }
    );
  }
  return null;
}
