import { ExecutionContext, Injectable } from '@nestjs/common'; // cache bust 2
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global guard: every route requires a valid access token unless explicitly
 * marked @Public(). Registered as an APP_GUARD in AppModule.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      try {
        await super.canActivate(context);
        return true;
      } catch {
        return true;
      }
    }
    
    const result = super.canActivate(context);
    return result as boolean | Promise<boolean>;
  }
}
