import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';

export interface TwoFactorSetup {
  otpauthUrl: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
}

/** Manages optional, user-enabled TOTP-based two-factor authentication. */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Generates (or regenerates) a pending TOTP secret + QR code for enrollment. */
  async beginSetup(userId: string, email: string): Promise<TwoFactorSetup> {
    const secret = authenticator.generateSecret();
    const appName = this.config.get<string>('twoFactorAppName') ?? 'Villi';
    const otpauthUrl = authenticator.keyuri(email, appName, secret);

    const recoveryCodes = Array.from({ length: 8 }, () =>
      randomBytes(5).toString('hex'),
    );
    const hashedCodes = await Promise.all(recoveryCodes.map((c) => argon2.hash(c)));

    await this.prisma.twoFactorSecret.upsert({
      where: { userId },
      create: { userId, secret, enabled: false, recoveryCodes: hashedCodes },
      update: { secret, enabled: false, recoveryCodes: hashedCodes, confirmedAt: null },
    });

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { otpauthUrl, qrCodeDataUrl, recoveryCodes };
  }

  /** Confirms enrollment by validating the first TOTP code. */
  async confirm(userId: string, code: string): Promise<void> {
    const record = await this.prisma.twoFactorSecret.findUnique({ where: { userId } });
    if (!record) throw new NotFoundException('2FA setup not started');
    if (!authenticator.check(code, record.secret)) {
      throw new BadRequestException('Invalid 2FA code');
    }
    await this.prisma.$transaction([
      this.prisma.twoFactorSecret.update({
        where: { userId },
        data: { enabled: true, confirmedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: userId }, data: {} }),
    ]);
  }

  async disable(userId: string): Promise<void> {
    await this.prisma.twoFactorSecret.deleteMany({ where: { userId } });
  }

  async isEnabled(userId: string): Promise<boolean> {
    const record = await this.prisma.twoFactorSecret.findUnique({ where: { userId } });
    return !!record?.enabled;
  }

  /** Verifies a login-time TOTP code, falling back to single-use recovery codes. */
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const record = await this.prisma.twoFactorSecret.findUnique({ where: { userId } });
    if (!record || !record.enabled) return false;

    if (authenticator.check(code, record.secret)) return true;

    for (let i = 0; i < record.recoveryCodes.length; i++) {
      if (await argon2.verify(record.recoveryCodes[i], code)) {
        const remaining = record.recoveryCodes.filter((_, idx) => idx !== i);
        await this.prisma.twoFactorSecret.update({
          where: { userId },
          data: { recoveryCodes: remaining },
        });
        return true;
      }
    }
    return false;
  }
}
