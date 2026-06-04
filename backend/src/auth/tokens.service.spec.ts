import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TokensService } from './tokens.service';

const SECRET = 'test-access-secret';

function makeConfig(): any {
  const map: Record<string, string> = {
    'jwt.accessSecret': SECRET,
    'jwt.accessTtl': '900s',
    'jwt.refreshTtl': '7d',
  };
  return { get: (k: string) => map[k] };
}

function makePrisma() {
  return {
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (cb: any) => {
      const tx = {
        refreshToken: {
          create: jest.fn().mockResolvedValue({ id: 'rt-2' }),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return cb(tx);
    }),
  };
}

describe('TokensService (JWT handling + refresh rotation)', () => {
  const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '900s' } });
  const user = { id: 'user-1', email: 'a@b.com', role: Role.USER };

  let prisma: ReturnType<typeof makePrisma>;
  let service: TokensService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new TokensService(jwt, makeConfig() as any, prisma as any);
  });

  it('issues a verifiable access token carrying sub/email/role/jti', async () => {
    const pair = await service.issuePair(user);
    const payload = jwt.verify<{ sub: string; jti: string; email: string; role: string }>(
      pair.accessToken,
      { secret: SECRET },
    );
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('a@b.com');
    expect(payload.role).toBe('USER');
    expect(payload.jti).toEqual(expect.any(String));
    expect(pair.accessExpiresIn).toBe(900);
  });

  it('persists only a SHA-256 hash of the refresh token', async () => {
    const pair = await service.issuePair(user);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    const data = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.tokenHash).not.toEqual(pair.refreshToken);
  });

  it('rejects an expired access token on verify', () => {
    const expired = jwt.sign({ sub: 'x' }, { secret: SECRET, expiresIn: '-1s' });
    expect(() => jwt.verify(expired, { secret: SECRET })).toThrow();
  });

  it('rotates a valid refresh token into a new pair (single-use)', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      familyId: 'fam-1',
      revokedAt: null,
      replacedById: null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
    });
    const pair = await service.rotate('some-refresh-token');
    expect(pair.accessToken).toEqual(expect.any(String));
    expect(pair.refreshToken).toEqual(expect.any(String));
    expect(pair.refreshToken).not.toBe('some-refresh-token');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('detects reuse of an already-rotated token and burns the family', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      familyId: 'fam-1',
      revokedAt: new Date(),
      replacedById: 'rt-2',
      expiresAt: new Date(Date.now() + 60_000),
      user,
    });
    await expect(service.rotate('leaked-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam-1', revokedAt: null },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown refresh token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.rotate('nope')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired refresh token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      familyId: 'fam-1',
      revokedAt: null,
      replacedById: null,
      expiresAt: new Date(Date.now() - 1000),
      user,
    });
    await expect(service.rotate('expired')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
