import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';

describe('AuthService password recovery', () => {
  const user = {
    id: 'user-1',
    email: 'reset@example.com',
    passwordHash: 'old',
    firstName: 'Reset',
    lastName: 'User',
    role: Role.USER,
    isEmailVerified: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let users: { findByEmail: jest.Mock; create: jest.Mock };
  let mail: { sendPasswordReset: jest.Mock; sendWelcome: jest.Mock };
  let prisma: {
    passwordResetToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    user: { update: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let captcha: { verify: jest.Mock };
  let twoFactor: { isEnabled: jest.Mock; verifyCode: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    users = { findByEmail: jest.fn(), create: jest.fn() };
    mail = {
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendWelcome: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({ id: 'prt-1' }),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { update: jest.fn() },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };
    captcha = { verify: jest.fn() };
    twoFactor = { isEnabled: jest.fn(), verifyCode: jest.fn() };
    service = new AuthService(
      prisma as any,
      users as any,
      mail as any,
      captcha as any,
      twoFactor as any,
    );
  });

  it('emails a reset link when the account exists (stores only a hash)', async () => {
    users.findByEmail.mockResolvedValue(user);

    await service.forgotPassword({ email: user.email });

    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    });
    const emailedToken = mail.sendPasswordReset.mock.calls[0][1] as string;
    expect(mail.sendPasswordReset).toHaveBeenCalledWith(user.email, emailedToken);
    expect(emailedToken.length).toBeGreaterThan(20);
  });

  it('does not reveal unknown emails (no mail sent)', async () => {
    users.findByEmail.mockResolvedValue(null);

    await service.forgotPassword({ email: 'unknown@example.com' });

    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('resets the password, marks the token used, and revokes refresh sessions', async () => {
    const rawToken = 'reset-token-plain';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'prt-1',
      userId: user.id,
      tokenHash,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.resetPassword(rawToken, 'NewStr0ng!Pass');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { passwordHash: expect.any(String) },
    });
    const hash = prisma.user.update.mock.calls[0][0].data.passwordHash;
    expect(await argon2.verify(hash, 'NewStr0ng!Pass')).toBe(true);
    expect(prisma.passwordResetToken.update).toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects an invalid or expired reset token', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);
    await expect(service.resetPassword('bad', 'NewStr0ng!Pass')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('does not fail a password reset request when the mail service is down', async () => {
    users.findByEmail.mockResolvedValue(user);
    mail.sendPasswordReset.mockRejectedValue(new Error('SMTP unreachable'));

    // Must resolve, not throw — a mail outage would otherwise turn this
    // into a 500 only for real accounts (the unknown-email branch never
    // calls mail at all), reopening the user-enumeration side channel this
    // endpoint is designed to avoid.
    await expect(service.forgotPassword({ email: user.email })).resolves.toBeUndefined();
    expect(prisma.passwordResetToken.create).toHaveBeenCalled();
  });

  it('registers the user even if the welcome email fails to send', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockResolvedValue(user);
    mail.sendWelcome.mockRejectedValue(new Error('SMTP unreachable'));

    const result = await service.register({
      email: user.email,
      password: 'NewStr0ng!Pass',
      firstName: user.firstName,
      lastName: user.lastName,
      captchaToken: 'token',
    } as any);

    expect(result).toBe(user);
    expect(users.create).toHaveBeenCalled();
  });
});
