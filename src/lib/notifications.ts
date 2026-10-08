import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './db';

export interface EmailMessage {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}

export interface EmailNotificationProvider {
  readonly name: string;
  sendEmail(message: EmailMessage): Promise<{ delivered: boolean; messageId: string }>;
}

/**
 * Local/No-Op Email Provider ready to be swapped with SMTP / Resend / Postmark in production.
 */
export class ConsoleEmailNotificationProvider implements EmailNotificationProvider {
  readonly name = 'LocalConsoleEmailProvider';

  async sendEmail(message: EmailMessage): Promise<{ delivered: boolean; messageId: string }> {
    return {
      delivered: true,
      messageId: `local-email-${Date.now()}-${message.to}`,
    };
  }
}

export const emailProvider: EmailNotificationProvider = new ConsoleEmailNotificationProvider();

export async function createInAppNotification(
  params: {
    userId: string;
    title: string;
    message: string;
    type?: 'MATCHED_LEADS' | 'LOW_CREDITS' | 'LEAD_WON' | 'SUBSCRIPTION' | 'SYSTEM';
    link?: string;
  },
  db: PrismaClient = defaultPrisma
) {
  return db.notification.create({
    data: {
      userId: params.userId,
      title: params.title,
      message: params.message,
      type: params.type || 'SYSTEM',
      link: params.link || null,
      isRead: false,
    },
  });
}
