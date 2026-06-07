/**
 * MailerPort — interface for sending transactional email.
 *
 * In dev/Docker: ConsoleMailer implements this by logging to stdout.
 * In production: swap with an SMTP or SES provider behind this interface.
 */
export interface MailerPort {
  sendEmailVerification(opts: {
    to: string;
    handle: string;
    token: string;
    expiresInMinutes: number;
  }): Promise<void>;
}

export const MAILER_PORT = Symbol('MAILER_PORT');
