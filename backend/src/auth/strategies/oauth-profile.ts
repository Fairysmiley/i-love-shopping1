import { OAuthProvider } from '@prisma/client';

/** Normalized identity from any Passport OAuth strategy. */
export interface OAuthProfile {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  firstName: string;
  lastName: string;
}
