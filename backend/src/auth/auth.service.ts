import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { CaptchaService } from './captcha.service';
import { TwoFactorService } from './two-factor.service';
import { ForgotPasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly captcha: CaptchaService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async register(dto: RegisterDto): Promise<User> {
    await this.captcha.verify(dto.captchaToken);

    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    await this.mail.sendWelcome(user.email, user.firstName);
    return user;
  }

  private async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.users.findByEmail(email);
    if (!user || !user.passwordHash) {
      // Same message whether the email exists or not (no user enumeration).
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('This account is deactivated.');
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    return user;
  }

  /**
   * Validates credentials and, when 2FA is enabled, the TOTP code. Returns the
   * user on success, or signals that a second factor is still required.
   */
  async login(dto: LoginDto): Promise<{ user: User } | { requiresTwoFactor: true }> {
    const user = await this.validateCredentials(dto.email, dto.password);

    if (await this.twoFactor.isEnabled(user.id)) {
      if (!dto.twoFactorCode) {
        return { requiresTwoFactor: true };
      }
      const valid = await this.twoFactor.verifyCode(user.id, dto.twoFactorCode);
      if (!valid) {
        throw new UnauthorizedException('Invalid two-factor code.');
      }
    }
    return { user };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.users.findByEmail(dto.email);
    // Always succeed silently to avoid leaking which emails are registered.
    if (!user) return;

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    await this.mail.sendPasswordReset(user.email, rawToken);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all sessions: a password reset invalidates existing refresh tokens.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
