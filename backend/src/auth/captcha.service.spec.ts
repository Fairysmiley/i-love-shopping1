import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CaptchaService } from './captcha.service';

describe('CaptchaService', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as typeof fetch;
  });

  async function createService(secret: string) {
    const module = await Test.createTestingModule({
      providers: [
        CaptchaService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'recaptcha.secret') return secret;
              if (key === 'recaptcha.minScore') return 0.5;
              return undefined;
            },
          },
        },
      ],
    }).compile();
    return module.get(CaptchaService);
  }

  it('skips verification when no secret is configured (dev)', async () => {
    const service = await createService('');
    await expect(service.verify(undefined)).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('requires a token when secret is configured', async () => {
    const service = await createService('test-secret');
    await expect(service.verify(undefined)).rejects.toThrow(BadRequestException);
  });

  it('verifies token with Google siteverify when secret is set', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: true }),
    });
    const service = await createService('test-secret');
    await service.verify('captcha-token-xyz');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.google.com/recaptcha/api/siteverify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects failed verification', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: false }),
    });
    const service = await createService('test-secret');
    await expect(service.verify('bad')).rejects.toThrow('CAPTCHA verification failed');
  });
});
