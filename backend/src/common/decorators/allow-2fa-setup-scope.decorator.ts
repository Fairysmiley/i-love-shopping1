import { SetMetadata } from '@nestjs/common';

export const ALLOW_2FA_SETUP_SCOPE_KEY = 'allow2faSetupScope';

/** Marks a route as reachable with a 'twofa_setup'-scoped access token
 * (issued to ADMIN/SUPPORT/SALES logging in for the first time, before
 * they've enrolled in mandatory 2FA). See TwoFactorScopeGuard. */
export const Allow2faSetupScope = () => SetMetadata(ALLOW_2FA_SETUP_SCOPE_KEY, true);
