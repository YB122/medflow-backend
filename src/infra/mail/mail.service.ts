import { Injectable, Logger } from '@nestjs/common';

/**
 * Email skeleton. In prod plug nodemailer/SES here and consume
 * appointment.* events from the in-memory bus. Never blocks booking:
 * failures are logged, not thrown.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async send(to: string, subject: string, text: string): Promise<void> {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.logger.log(`[dev-mail] to=${to} subject=${subject} :: ${text}`);
      return;
    }
    try {
      // Optional dep: only resolved at runtime when SMTP is configured.
      // @ts-ignore - nodemailer is an optional peer, may not be installed
      const nodemailer: any = await import('nodemailer').catch(() => null);
      if (!nodemailer) {
        this.logger.warn('nodemailer not installed, skipping send');
        return;
      }
      const transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({ from: process.env.SMTP_FROM ?? 'no-reply@medflow.local', to, subject, text });
    } catch (e: any) {
      this.logger.warn(`mail send failed: ${e?.message}`);
    }
  }
}
