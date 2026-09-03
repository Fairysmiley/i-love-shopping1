import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  private supportInbox!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.from = this.config.get<string>('mail.from')!;
    this.webUrl = this.config.get<string>('webPublicUrl')!;
    this.supportInbox = this.config.get<string>('mail.supportInbox') || this.from;
    const host = this.config.get<string>('mail.host');
    if (host) {
      const user = this.config.get<string>('mail.user') ?? '';
      const pass = this.config.get<string>('mail.password') ?? '';
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('mail.port'),
        secure: this.config.get<boolean>('mail.secure'),
        ...(user || pass ? { auth: { user, pass } } : {}),
      });
      this.logger.log(`SMTP configured (${host}:${this.config.get<number>('mail.port')}).`);
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

  async sendOrderConfirmation(to: string, orderId: string): Promise<void> {
    if (!to) return;
    const link = `${this.webUrl}/order-confirmation/${orderId}`;
    await this.send(
      to,
      `Order Confirmation - ${orderId}`,
      `<p>Thank you for your purchase! Your order has been successfully paid and is being processed.</p>
       <p>Order reference: <strong>${orderId}</strong></p>
       <p><a href="${link}">View your order confirmation</a>.</p>`,
    );
  }

  async sendPaymentFailed(to: string, orderId: string, errorDetail?: string): Promise<void> {
    if (!to) return;
    await this.send(
      to,
      `Payment Failed - ${orderId}`,
      `<p>There was an issue processing your payment for order <strong>${orderId}</strong>.</p>
       <p>Reason: ${errorDetail ?? 'Unknown'}</p>
       <p>Your items have been released back into stock. Please try again.</p>`,
    );
  }

  /** Forwards a Contact/Support form submission to the support inbox, and
   * sends the submitter a confirmation that it was received. */
  async sendContactMessage(input: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<void> {
    await this.send(
      this.supportInbox,
      `[Contact] ${input.subject} — ${input.name}`,
      `<p>New contact form submission:</p>
       <p><strong>Name:</strong> ${escapeHtml(input.name)}</p>
       <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
       <p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
       <p><strong>Message:</strong></p>
       <p>${escapeHtml(input.message).replace(/\n/g, '<br/>')}</p>`,
    );
    await this.send(
      input.email,
      'We received your message — Villi Support',
      `<p>Hi ${escapeHtml(input.name)}, thanks for reaching out — our support team will get back to you within 24 hours.</p>
       <p>For your records, here's what you sent us:</p>
       <p>${escapeHtml(input.message).replace(/\n/g, '<br/>')}</p>`,
    );
  }
}
