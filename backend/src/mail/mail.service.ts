import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Sends transactional email via SMTP. When SMTP is not configured (dev),
 * messages are logged to the console so flows remain testable offline.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private from!: string;
  private webUrl!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.from = this.config.get<string>('mail.from')!;
    this.webUrl = this.config.get<string>('webPublicUrl')!;
    const host = this.config.get<string>('mail.host');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('mail.port'),
        secure: this.config.get<boolean>('mail.secure'),
        auth: {
          user: this.config.get<string>('mail.user'),
          pass: this.config.get<string>('mail.password'),
        },
      });
    } else {
      this.logger.warn('SMTP not configured — emails will be logged to the console.');
    }
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[DEV EMAIL] to=${to} subject="${subject}"\n${html}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, html });
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${this.webUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.send(
      to,
      'Reset your Villi password',
      `<p>We received a request to reset your password.</p>
       <p><a href="${link}">Click here to choose a new password</a>. This link expires in 30 minutes.</p>
       <p>If you didn't request this, you can safely ignore this email.</p>`,
    );
  }

  async sendWelcome(to: string, firstName: string): Promise<void> {
    await this.send(
      to,
      'Welcome to Villi',
      `<p>Hi ${firstName}, welcome to Villi — verified pre-loved Nordic outdoor apparel. Your account is ready.</p>`,
    );
  }
}
