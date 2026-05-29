import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  'error-codes'?: string[];
}

/**
 * Verifies Google reCAPTCHA tokens server-side. If no secret is configured
 * (dev), verification is skipped so local registration still works.
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(private readonly config: ConfigService) {}

  async verify(token: string | undefined): Promise<void> {
    const secret = this.config.get<string>('recaptcha.secret');
    if (!secret) {
      this.logger.debug('reCAPTCHA disabled (no secret configured).');
      return;
    }
    if (!token) {
      throw new BadRequestException('CAPTCHA token is required');
    }

    const params = new URLSearchParams({ secret, response: token });
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = (await res.json()) as RecaptchaResponse;

    const minScore = this.config.get<number>('recaptcha.minScore') ?? 0.5;
    if (!data.success || (data.score !== undefined && data.score < minScore)) {
      throw new BadRequestException('CAPTCHA verification failed');
    }
  }
}
