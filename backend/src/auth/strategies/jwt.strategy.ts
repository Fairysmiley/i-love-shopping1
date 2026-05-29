import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { RedisService } from '../../redis/redis.service';
import { AccessTokenPayload } from '../tokens.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    // Honor token revocation: a denylisted jti (logged out) is rejected even
    // though the JWT signature/expiry are still valid.
    if (await this.redis.isAccessTokenDenied(payload.jti)) {
      throw new UnauthorizedException('Token has been revoked');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      jti: payload.jti,
    };
  }
}
