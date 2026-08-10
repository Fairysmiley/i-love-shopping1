import { Test } from '@nestjs/testing';
import { OAuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService.findOrCreateFromOAuth', () => {
  let service: UsersService;
  let prisma: {
    oAuthAccount: { findUnique: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      oAuthAccount: { findUnique: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('returns an existing user when the OAuth link already exists', async () => {
    // Plain (unencrypted-looking) values are fine here — decrypt() passes
    // through anything without the iv:authTag:ciphertext shape unchanged.
    const existing = { id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B' };
    prisma.oAuthAccount.findUnique.mockResolvedValue({ user: existing });

    const user = await service.findOrCreateFromOAuth({
      provider: OAuthProvider.GOOGLE,
      providerAccountId: 'gid-1',
      email: 'a@b.com',
      firstName: 'A',
      lastName: 'B',
    });

    // The OAuth-link path now decrypts before returning (fixes a pre-existing
    // bug where it skipped decryption), so this is a new object, not `existing`.
    expect(user).toEqual(existing);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a user and OAuth link when new', async () => {
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    const created = {
      id: 'u2',
      email: 'new@example.com',
      isEmailVerified: true,
    };
    prisma.user.create.mockResolvedValue(created);

    const user = await service.findOrCreateFromOAuth({
      provider: OAuthProvider.GITHUB,
      providerAccountId: 'gh-99',
      email: 'new@example.com',
      firstName: 'New',
      lastName: 'User',
    });

    expect(user).toEqual(created);
    expect(prisma.oAuthAccount.create).toHaveBeenCalledWith({
      data: {
        provider: OAuthProvider.GITHUB,
        providerAccountId: 'gh-99',
        userId: 'u2',
      },
    });
  });
});
