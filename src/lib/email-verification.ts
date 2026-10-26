import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { wrapBrandedEmailLayout } from '@/lib/email-templates';
import { dispatchTransactionalEmailSafe } from '@/lib/notifications';
import { invalidateUserSessionCache } from '@/lib/auth';

export const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const RESEND_COOLDOWN_SECONDS = 60; // 1 minute between verification email requests

export interface GenerateTokenResult {
  rawToken: string;
  expiresAt: Date;
}

export interface VerifyTokenResult {
  success: boolean;
  code?: 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'TOKEN_ALREADY_USED' | 'USER_NOT_FOUND';
  error?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    emailVerified: Date | null;
  };
}

/**
 * Generates a cryptographically secure 256-bit token for email verification.
 * Only the SHA-256 hash is persisted in the database.
 */
export async function createEmailVerificationToken(
  userId: string,
  meta?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<GenerateTokenResult> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashVerificationToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_MS);

  // Invalidate any previously active unconsumed verification tokens for this user
  await prisma.emailVerificationToken.updateMany({
    where: {
      userId,
      consumedAt: null,
    },
    data: {
      consumedAt: now,
    },
  });

  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress: meta?.ipAddress || null,
      userAgent: meta?.userAgent || null,
    },
  });

  return { rawToken, expiresAt };
}

/**
 * Hashes a raw verification token using SHA-256
 */
export function hashVerificationToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Checks whether a user must wait before requesting a new verification email
 */
export async function getResendCooldown(userId: string): Promise<{
  canResend: boolean;
  retryAfterSeconds: number;
}> {
  const latestToken = await prisma.emailVerificationToken.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  if (!latestToken) {
    return { canResend: true, retryAfterSeconds: 0 };
  }

  const elapsedSeconds = Math.floor((Date.now() - latestToken.createdAt.getTime()) / 1000);
  if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
    return {
      canResend: false,
      retryAfterSeconds: RESEND_COOLDOWN_SECONDS - elapsedSeconds,
    };
  }

  return { canResend: true, retryAfterSeconds: 0 };
}

/**
 * Verifies a single-use email verification token inside an atomic transaction.
 * Upon success, marks the token consumed and sets User.emailVerified = now().
 */
export async function verifyEmailToken(rawToken: string): Promise<VerifyTokenResult> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length < 16) {
    return {
      success: false,
      code: 'INVALID_TOKEN',
      error: 'رمز تأكيد البريد الإلكتروني غير صالح أو غير مكتمل.',
    };
  }

  const tokenHash = hashVerificationToken(rawToken);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const record = await tx.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            emailVerified: true,
          },
        },
      },
    });

    if (!record) {
      return {
        success: false,
        code: 'INVALID_TOKEN',
        error: 'رابط تأكيد البريد غير صالح أو تم إلغاؤه.',
      };
    }

    if (record.consumedAt) {
      return {
        success: false,
        code: 'TOKEN_ALREADY_USED',
        error: 'تم استخدام رابط التأكيد هذا مسبقاً. تم تأكيد حسابك بالفعل.',
      };
    }

    if (record.expiresAt < now) {
      return {
        success: false,
        code: 'TOKEN_EXPIRED',
        error: 'انتهت صلاحية رابط التأكيد (صالح لمدة 24 ساعة). يرجى طلب رابط جديد.',
      };
    }

    if (!record.user || record.user.status === 'SUSPENDED') {
      return {
        success: false,
        code: 'USER_NOT_FOUND',
        error: 'الحساب المرتبط برمز التأكيد غير موجود أو تم تعليقه.',
      };
    }

    // Mark token consumed
    await tx.emailVerificationToken.update({
      where: { id: record.id },
      data: { consumedAt: now },
    });

    // Mark user verified
    const verifiedUser = await tx.user.update({
      where: { id: record.userId },
      data: {
        emailVerified: now,
        updatedAt: now,
      },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
      },
    });

    // Invalidate cached session
    invalidateUserSessionCache(record.userId);

    return {
      success: true,
      user: verifiedUser,
    };
  });
}

/**
 * Validates whether an incoming Origin is trusted.
 * 
 * Rules:
 * 1. Must parse as a valid HTTP/HTTPS URL.
 * 2. Matches canonical configured APP_URL or NEXT_PUBLIC_APP_URL.
 * 3. Matches any origin in ALLOWED_ORIGINS (comma-separated).
 * 4. In non-production (development/test): accepts localhost, 127.0.0.1, or [::1] on any port.
 * 5. In production: strictly rejects any origin not explicitly matching APP_URL, NEXT_PUBLIC_APP_URL, or ALLOWED_ORIGINS.
 */
export function isTrustedOrigin(rawOrigin?: string | null): boolean {
  if (!rawOrigin || typeof rawOrigin !== 'string') return false;
  const trimmed = rawOrigin.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  // Only http and https protocols are eligible
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  // Check against explicitly configured canonical origins
  const configuredUrls = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    ...(process.env.ALLOWED_ORIGINS || '').split(','),
  ]
    .map((u) => u?.trim())
    .filter(Boolean) as string[];

  for (const cfg of configuredUrls) {
    try {
      const cfgUrl = new URL(cfg);
      if (cfgUrl.origin.toLowerCase() === parsed.origin.toLowerCase()) {
        return true;
      }
    } catch {
      // Ignore malformed config entries
    }
  }

  // In non-production environments (development & testing), allow local loopback origins
  const isNonProd = process.env.NODE_ENV !== 'production';
  if (isNonProd) {
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return true;
    }
  }

  return false;
}

/**
 * Resolves the canonical base URL for constructing user-facing links (verification, password reset, etc.).
 * 
 * Precedence and Trust Model:
 * 1. Prefer explicitly configured canonical application base URL (APP_URL or NEXT_PUBLIC_APP_URL).
 * 2. In production: ALWAYS strictly enforce the configured canonical URL (untrusted / spoofed origins are discarded).
 * 3. In non-production: if candidate origin is an explicitly trusted local loopback origin, allow it for multi-port dev.
 * 4. If no canonical URL is configured:
 *    - If an origin is passed and matches the trusted-origin policy: use it.
 *    - Otherwise, fall back to safe environment default ('https://leadforge.eg' in prod, 'http://localhost:3000' in dev).
 */
export function getApplicationBaseUrl(candidateOrigin?: string | null): string {
  const configured = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL)?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  // 1. If canonical URL is explicitly configured:
  if (configured) {
    const normalizedConfigured = configured.replace(/\/$/, '');

    // In production, ALWAYS strictly enforce the configured canonical URL
    if (isProd) {
      return normalizedConfigured;
    }

    // In local development: if candidate origin is an explicitly trusted local loopback origin,
    // allow it so multi-port local dev (e.g. localhost:3001) works smoothly.
    if (candidateOrigin && isTrustedOrigin(candidateOrigin)) {
      return candidateOrigin.trim().replace(/\/$/, '');
    }

    return normalizedConfigured;
  }

  // 2. If no canonical URL is configured:
  if (candidateOrigin && isTrustedOrigin(candidateOrigin)) {
    return candidateOrigin.trim().replace(/\/$/, '');
  }

  // 3. Fallback based on environment
  if (isProd) {
    return 'https://leadforge.eg';
  }
  return 'http://localhost:3000';
}

/**
 * Sends a transactional verification email with a branded one-click activation link
 */
export async function sendVerificationEmailSafe(params: {
  email: string;
  rawToken: string;
  name?: string | null;
  origin?: string | null;
}): Promise<boolean> {
  const baseUrl = getApplicationBaseUrl(params.origin);

  const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(params.rawToken)}`;
  const userName = params.name?.trim() || 'مطورنا العزيز';

  const html = wrapBrandedEmailLayout({
    title: 'تأكيد البريد الإلكتروني',
    preheader: 'يرجى تأكيد بريدك الإلكتروني لتفعيل حسابك في LeadForge Egypt واقتناص الفرص.',
    contentHtml: `
      <h2 style="margin-top:0; color:#1C1917; font-size:20px; font-weight:700;">أهلاً بك يا ${userName} في LeadForge Egypt</h2>
      <p style="color:#44403C; font-size:15px; line-height:1.6;">
        شكراً لتسجيلك في منصة <strong>LeadForge Egypt</strong>. لتتمكن من فحص وتأكيد بيانات الشركات واقتناص فرص المشاريع الحصرية، يرجى تأكيد ملكيتك لهذا البريد الإلكتروني.
      </p>
      <p style="color:#78716C; font-size:13px; line-height:1.5;">
        هذا الرابط مخصص لحسابك فقط وصالح للاستخدام <strong>لمرة واحدة خلال 24 ساعة</strong>.
      </p>
    `,
    ctaText: 'تأكيد البريد الإلكتروني واقتناص الفرص',
    ctaUrl: verifyUrl,
    footerNote: 'إذا لم تقم بإنشاء حساب على LeadForge Egypt، يمكنك تجاهل هذا البريد بأمان.',
  });

  const text = `أهلاً بك يا ${userName} في LeadForge Egypt\n\nيرجى تأكيد بريدك الإلكتروني عبر الرابط التالي (صالح لمدة 24 ساعة):\n${verifyUrl}\n\nإذا لم تطلب هذا الحساب، يرجى تجاهل هذه الرسالة.`;

  try {
    await dispatchTransactionalEmailSafe({
      message: {
        to: params.email,
        subject: 'تأكيد البريد الإلكتروني - LeadForge Egypt',
        bodyText: text,
        bodyHtml: html,
      },
    });
    return true;
  } catch (err) {
    console.error('[sendVerificationEmailSafe Error]:', err);
    return false;
  }
}
