import { Injectable, Logger } from '@nestjs/common';
import { MailerPort } from './mailer.port';

/**
 * ConsoleMailer — dev/Docker implementation of MailerPort.
 *
 * Logs the verification link to the backend console instead of sending real email.
 * This eliminates the SMTP dependency in development. Swap this provider for a real
 * implementation (SES, SendGrid, etc.) in production by binding MAILER_PORT to a
 * different class in auth.module.ts.
 */
@Injectable()
export class ConsoleMailer implements MailerPort {
  private readonly logger = new Logger(ConsoleMailer.name);

  async sendEmailVerification(opts: {
    to: string;
    handle: string;
    token: string;
    expiresInMinutes: number;
  }): Promise<void> {
    this.logger.log(
      `\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `  [DEV EMAIL] Email Verification\n` +
        `  To:       ${opts.to}\n` +
        `  Handle:   @${opts.handle}\n` +
        `  Token:    ${opts.token}\n` +
        `  Expires:  in ${opts.expiresInMinutes} minutes\n` +
        `  Verify:   POST /api/v1/auth/verify-email  { "token": "${opts.token}" }\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    );
  }
}
