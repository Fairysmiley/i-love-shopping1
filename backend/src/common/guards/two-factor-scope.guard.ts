import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_2FA_SETUP_SCOPE_KEY } from '../decorators/allow-2fa-setup-scope.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

/**
 * A 'twofa_setup'-scoped token (issued to a privileged user who must enroll
 * in 2FA before getting a real session — see TokensService.issueTwoFactorSetupToken)
 * may only reach routes explicitly marked with @Allow2faSetupScope(). This is
 * what makes mandatory 2FA enforceable without permanently locking out an
 * admin who has never set it up: they get just enough access to enroll,
 * nothing else.
 */
@Injectable()
export class TwoFactorScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user || user.scope !== 'twofa_setup') return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_2FA_SETUP_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed) {
      throw new ForbiddenException(
        'Complete Two-Factor Authentication enrollment before continuing.',
      );
    }
    return true;
  }
}
