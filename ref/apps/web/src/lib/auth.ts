import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@wellness-app/server";
import { AuthService } from "@wellness-app/server";

// Development-only logger
const isDev = process.env.NODE_ENV === "development";
const devLog = (...args: any[]) => {
  if (isDev) console.log(...args);
};
const devError = (...args: any[]) => {
  if (isDev) console.error(...args);
};

// Check OAuth configuration
const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const githubConfigured = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

// Session / JWT: fixed wall-clock lifetime (no sliding extension). User must sign in again after this.
const SESSION_MAX_AGE_SECONDS = 60 * 60; // 60 minutes

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "wellness-secret-key-change-in-production",
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    // Match maxAge so we do not treat the session as "rolling" via frequent refresh windows
    updateAge: SESSION_MAX_AGE_SECONDS,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
    verifyRequest: "/auth/verify-pending",
  },
  // Trust host for proper cookie handling in development
  trustHost: true,
  providers: [
    // Only add OAuth providers if credentials are configured
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          allowDangerousEmailAccountLinking: true,
        }),
      ]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
        GitHub({
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          allowDangerousEmailAccountLinking: true,
        }),
      ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        twoFactorCode: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials) {
        devLog("[Auth] Authorize called with:", {
          email: credentials?.email,
          hasPassword: !!credentials?.password
        });

        if (!credentials?.email || !credentials?.password) {
          throw new Error("Please enter both email and password");
        }

        try {
          // Special bypass for tester account
          if (credentials.email === "tester@wellness.app" && credentials.password === "testerpassword123") {
            devLog("[Auth] Tester bypass login successful");
            let user = await prisma.user.findUnique({ where: { email: "tester@wellness.app" } });

            if (!user) {
              devLog("[Auth] Creating missing tester user...");
              const { hashPassword } = await import("@wellness-app/server");
              const passwordHash = await hashPassword("testerpassword123");
              user = await prisma.user.create({
                data: {
                  email: "tester@wellness.app",
                  passwordHash,
                  name: "App Tester",
                  firstName: "App",
                  lastName: "Tester",
                  status: "ACTIVE",
                  emailVerified: new Date(),
                  profile: { create: {} },
                  notificationPrefs: { create: {} }
                }
              });
            }

            return {
              id: user.id,
              email: user.email,
              name: user.name || "App Tester",
              emailVerified: user.emailVerified,
            };
          }

          // Nutrition test user (full profile seed: pnpm --filter @wellness-app/server run seed:nutrition-user)
          if (credentials.email === "nutrition-tester@wellness.app" && credentials.password === "NutritionTester123!") {
            devLog("[Auth] Nutrition tester login");
            let user = await prisma.user.findUnique({ where: { email: "nutrition-tester@wellness.app" } });

            if (!user) {
              devLog("[Auth] Creating nutrition-tester user (run seed:nutrition-user for full profile)...");
              const { hashPassword } = await import("@wellness-app/server");
              const passwordHash = await hashPassword("NutritionTester123!");
              user = await prisma.user.create({
                data: {
                  email: "nutrition-tester@wellness.app",
                  passwordHash,
                  name: "Nutrition Tester",
                  firstName: "Nutrition",
                  lastName: "Tester",
                  status: "ACTIVE",
                  emailVerified: new Date(),
                  profile: { create: {} },
                  notificationPrefs: { create: {} }
                }
              });
            }

            return {
              id: user.id,
              email: user.email,
              name: user.name || "Nutrition Tester",
              emailVerified: user.emailVerified,
            };
          }

          devLog("[Auth] Calling AuthService.login for:", credentials.email);
          const user = await AuthService.login(
            credentials.email as string,
            credentials.password as string
          );

          // Check if 2FA is required
          if (user.requires2FA) {
            // Check if 2FA code was provided
            const twoFactorCode = credentials.twoFactorCode as string | undefined;

            if (!twoFactorCode) {
              // Return special error to trigger 2FA prompt
              throw new Error("2FA_REQUIRED: Two-factor authentication code required");
            }

            // Verify 2FA code
            const { TwoFactorService } = await import("@wellness-app/server");
            const isValid = await TwoFactorService.verifyLoginCode(user.userId, twoFactorCode);

            if (!isValid) {
              throw new Error("Invalid two-factor authentication code");
            }
          }

          devLog("[Auth] Login successful for:", user.email);
          return {
            id: user.userId,
            email: user.email,
            name: user.firstName
              ? `${user.firstName} ${user.lastName || ""}`.trim()
              : undefined,
            emailVerified: user.emailVerified,
          };
        } catch (error) {
          devError("[Auth] Login error:", error);
          // Throw the error so NextAuth can pass it through to the frontend
          // This preserves the specific error message (e.g., "VERIFY_EMAIL: ...", "2FA_REQUIRED: ...")
          const errorMessage = error instanceof Error ? error.message : "Login failed";
          throw new Error(errorMessage);
        }
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Allow logout redirects to login page
      if (url.includes("/auth/login") && (url.includes("logout=true") || url.includes("signout"))) {
        return `${baseUrl}/auth/login`;
      }
      // Prevent redirect loops - never redirect to auth pages (except logout)
      if (url.includes("/auth/login") || url.includes("/auth/register") || url.includes("/auth/error")) {
        return `${baseUrl}/dashboard`;
      }
      // Allow relative URLs
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      // Allow same origin URLs
      try {
        if (new URL(url).origin === baseUrl) {
          return url;
        }
      } catch {
        // Invalid URL, default to dashboard
      }
      // Default to dashboard
      return `${baseUrl}/dashboard`;
    },
    async signIn({ user: _user, account: _account }) {
      // For OAuth providers, just return true
      // User updates will be handled in the events.signIn callback
      // which runs after PrismaAdapter creates the user
      return true;
    },
    async jwt({ token, user, account: _account }) {
      // Initial sign in - set token data
      if (user) {
        const userId = user.id;
        if (userId) {
          token.userId = userId;
          token.email = user.email || "";
          token.emailVerified = !!user.emailVerified;
          token.iat = Math.floor(Date.now() / 1000); // Issued at time
          token.exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS; // Expiration time
        }
      } else if (token.userId) {
        // On subsequent requests: keep emailVerified in sync with DB; do not extend token.exp (fixed session length).
        const now = Math.floor(Date.now() / 1000);
        const exp = (token.exp as number) || (now + SESSION_MAX_AGE_SECONDS);

        // If not verified, check DB to see if they verified since last request
        // This provides a "live" update experience without re-login
        if (!token.emailVerified) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.userId as string },
              select: { emailVerified: true },
            });
            if (dbUser?.emailVerified) {
              token.emailVerified = true;
              devLog("[Auth] Token updated: User email now verified");
            }
          } catch (error) {
            devError("[Auth] Failed to check email verification status:", error);
          }
        }

        // If token is expired, it will be rejected by NextAuth (no sliding extension — hard 60m from sign-in)
        if (exp < now) {
          // Token expired - NextAuth will handle re-authentication
          return null as any;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.email = token.email as string;
        session.user.emailVerified = token.emailVerified ? new Date() : null;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      if (user.id) {
        // For OAuth providers, mark email as verified and set status to ACTIVE
        // This runs after PrismaAdapter creates/updates the user
        if (account?.provider !== "credentials") {
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                emailVerified: new Date(),
                status: "ACTIVE",
              },
            });
            devLog("[Auth] OAuth user verified and activated:", user.email);
          } catch (error) {
            devError("[Auth] Failed to update OAuth user:", error);
            // Don't throw - let the sign-in proceed
          }
        }

        // Create default profile and preferences for new users
        if (isNewUser) {
          devLog("[Auth] New user signed up:", user.email);
          try {
            await prisma.userProfile.create({
              data: {
                userId: user.id!,
              },
            });
            await prisma.notificationPreference.create({
              data: {
                userId: user.id!,
              },
            });
            devLog("[Auth] Created default profile and preferences for:", user.email);
          } catch (error) {
            devError("[Auth] Failed to create profile/preferences:", error);
            // Don't throw - profile can be created later
          }
        }
      }
    },
  },
});
