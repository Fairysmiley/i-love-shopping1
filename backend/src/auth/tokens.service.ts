import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  jti: string;
}

interface RequestContext {
  userAgent?: string;
  ip?: string;
}

/**
 * Issues and rotates JWT access tokens + opaque refresh tokens.
 *
 * - Access tokens are short-lived JWTs carrying a `jti` so they can be
 *   individually denylisted on logout.
 * - Refresh tokens are high-entropy opaque strings; only their SHA-256 hash is
 *   stored. Each refresh rotates the token (single-use). Presenting an
 *   already-rotated token is treated as theft and revokes the whole family.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  accessTtlSeconds(): number {
    const ttl = this.config.get<string>('jwt.accessTtl') ?? '900s';
    return this.parseDurationToSeconds(ttl);
  }

  refreshCookieMaxAgeMs(): number {
    return this.refreshTtlSeconds() * 1000;
  }

  private refreshTtlSeconds(): number {
    const ttl = this.config.get<string>('jwt.refreshTtl') ?? '7d';
    return this.parseDurationToSeconds(ttl);
  }

  private parseDurationToSeconds(value: string): number {
    const match = /^(\d+)(s|m|h|d)?$/.exec(value.trim());
    if (!match) return 900;
    const n = parseInt(match[1], 10);
    switch (match[2]) {
      case 'd':
        return n * 86400;
      case 'h':
        return n * 3600;
      case 'm':
        return n * 60;
      default:
        return n;
    }
  }

  private signAccessToken(user: Pick<User, 'id' | 'email' | 'role'>, jti: string): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti,
    };
    // Secret + expiresIn come from the JwtModule registration.
    return this.jwt.sign(payload);
  }

  /** Issues a fresh access + refresh pair, starting a new refresh-token family. */
  async issuePair(
    user: Pick<User, 'id' | 'email' | 'role'>,
    ctx: RequestContext = {},
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    const jti = randomUUID();
    const accessToken = this.signAccessToken(user, jti);

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds() * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        familyId,
        expiresAt,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      },
    });

    return { accessToken, refreshToken, accessExpiresIn: this.accessTtlSeconds() };
  }

  /** Validates and rotates a presented refresh token, detecting reuse. */
  async rotate(presented: string, ctx: RequestContext = {}): Promise<TokenPair> {
    const tokenHash = this.hash(presented);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Reuse detection: a revoked/already-rotated token being presented again
    // means it was leaked. Burn the entire family.
    if (stored.revokedAt || stored.replacedById) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const jti = randomUUID();
    const accessToken = this.signAccessToken(stored.user, jti);
    const newRefresh = randomBytes(48).toString('base64url');
    const newExpiresAt = new Date(Date.now() + this.refreshTtlSeconds() * 1000);

    await this.prisma.$transaction(async (tx) => {
      const replacement = await tx.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: this.hash(newRefresh),
          familyId: stored.familyId,
          expiresAt: newExpiresAt,
          userAgent: ctx.userAgent,
          ip: ctx.ip,
        },
      });
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedById: replacement.id },
      });
    });

    return { accessToken, refreshToken: newRefresh, accessExpiresIn: this.accessTtlSeconds() };
  }

  /** Revokes a single refresh token (used on logout). */
  async revokeRefreshToken(presented: string): Promise<void> {
    const tokenHash = this.hash(presented);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
