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

/**
 * Redacts raw Egyptian phone numbers and email addresses from notification bodies
 * when notifying about unclaimed/matched leads so private contact details are never leaked.
 */
export function sanitizeNotificationContent(
  text: string,
  options?: { redactContactDetails?: boolean }
): string {
  if (!options?.redactContactDetails) return text;
  return text
    .replace(/(\+?20|0)(1[0125]\d{8}|[2-9]\d{7,8})/g, '[REDACTED_PHONE]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
}

const recentNotificationKeys = new Map<string, { notificationId: string; timestamp: number }>();

export async function createInAppNotification(
  params: {
    userId: string;
    title: string;
    message: string;
    type?: 'MATCHED_LEADS' | 'LOW_CREDITS' | 'LEAD_WON' | 'SUBSCRIPTION' | 'SYSTEM';
    link?: string;
    idempotencyKey?: string;
    redactContactDetails?: boolean;
  },
  db: PrismaClient = defaultPrisma
) {
  const shouldRedact = params.redactContactDetails ?? params.type === 'MATCHED_LEADS';
  const safeTitle = sanitizeNotificationContent(params.title, { redactContactDetails: shouldRedact });
  const safeMessage = sanitizeNotificationContent(params.message, { redactContactDetails: shouldRedact });

  if (params.idempotencyKey) {
    const dedupKey = `${params.userId}:${params.idempotencyKey}`;
    const existingMem = recentNotificationKeys.get(dedupKey);
    if (existingMem && Date.now() - existingMem.timestamp < 5 * 60 * 1000) {
      const found = await db.notification.findUnique({ where: { id: existingMem.notificationId } });
      if (found) return found;
    }

    const recentDuplicate = await db.notification.findFirst({
      where: {
        userId: params.userId,
        title: safeTitle,
        message: safeMessage,
        type: params.type || 'SYSTEM',
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recentDuplicate) {
      recentNotificationKeys.set(dedupKey, {
        notificationId: recentDuplicate.id,
        timestamp: Date.now(),
      });
      return recentDuplicate;
    }
  }

  const created = await db.notification.create({
    data: {
      userId: params.userId,
      title: safeTitle,
      message: safeMessage,
      type: params.type || 'SYSTEM',
      link: params.link || null,
      isRead: false,
    },
  });

  if (params.idempotencyKey) {
    recentNotificationKeys.set(`${params.userId}:${params.idempotencyKey}`, {
      notificationId: created.id,
      timestamp: Date.now(),
    });
  }

  return created;
}

const dispatchedEmailIds = new Map<string, string>();

/**
 * Dispatches transactional email with idempotency deduplication, PII redaction guard,
 * and bounded retries so critical notifications do not silently disappear.
 */
export async function dispatchTransactionalEmailSafe(params: {
  message: EmailMessage;
  idempotencyKey?: string;
  redactLeadContacts?: boolean;
  maxRetries?: number;
  provider?: EmailNotificationProvider;
}): Promise<{
  delivered: boolean;
  messageId: string;
  attempts: number;
  deduplicated: boolean;
  errorMessage?: string;
}> {
  if (params.idempotencyKey && dispatchedEmailIds.has(params.idempotencyKey)) {
    return {
      delivered: true,
      messageId: dispatchedEmailIds.get(params.idempotencyKey)!,
      attempts: 0,
      deduplicated: true,
    };
  }

  const provider = params.provider ?? emailProvider;
  const maxRetries = Math.max(0, Math.min(params.maxRetries ?? 2, 5));
  const safeMessage: EmailMessage = {
    ...params.message,
    subject: sanitizeNotificationContent(params.message.subject, {
      redactContactDetails: params.redactLeadContacts,
    }),
    bodyText: sanitizeNotificationContent(params.message.bodyText, {
      redactContactDetails: params.redactLeadContacts,
    }),
  };

  let attempts = 0;
  let lastError = '';

  while (attempts <= maxRetries) {
    attempts++;
    try {
      const res = await provider.sendEmail(safeMessage);
      if (res.delivered) {
        if (params.idempotencyKey) {
          dispatchedEmailIds.set(params.idempotencyKey, res.messageId);
        }
        return {
          delivered: true,
          messageId: res.messageId,
          attempts,
          deduplicated: false,
        };
      }
      lastError = 'Provider reported delivered=false';
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
  }

  return {
    delivered: false,
    messageId: '',
    attempts,
    deduplicated: false,
    errorMessage: lastError,
  };
}

