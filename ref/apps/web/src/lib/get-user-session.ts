import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * Get authenticated user session from NextAuth
 * Returns null if user is not authenticated
 * 
 * This replaces the old verifyAccessToken pattern
 */
export async function getUserSession() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return null;
    }

    return {
      userId: session.user.id,
      email: session.user.email!,
      emailVerified: !!session.user.emailVerified,
    };
  } catch (error) {
    logger.error("[getUserSession] Error:", error);
    return null;
  }
}
