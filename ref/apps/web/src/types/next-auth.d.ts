import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      emailVerified: Date | null;
    } & DefaultSession["user"];
  }

  interface User {
    emailVerified: Date | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    email: string;
    emailVerified: boolean;
    iat?: number; // Issued at time (Unix timestamp)
    exp?: number; // Expiration time (Unix timestamp)
  }
}




