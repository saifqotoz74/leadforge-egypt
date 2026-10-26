import { PrismaClient } from '@prisma/client';
import { createAuditLog } from '../audit';
import { createInAppNotification } from '../notifications';
import { syncSubscriptionCreditsToLedgerInTx } from '../claims/credit-service';
import { AppSecurityError } from '../security/error-taxonomy';

export interface PaymentChargeRequest {
  userId: string;
  planId: string;
  planSlug: string;
  amountEgp: number;
  currency: 'EGP';
  paymentMethod?: string;
}

export interface PaymentChargeResult {
  success: boolean;
  provider: string;
  providerRef: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  errorMessage?: string;
}

/**
 * PaymentProvider abstraction per Section 15 of specification.
 * Enables seamless integration with Paymob, Fawry, Kashier, or Stripe later.
 */
export interface PaymentProvider {
  readonly providerName: string;
  processSubscriptionCharge(req: PaymentChargeRequest): Promise<PaymentChargeResult>;
}

/**
 * Detects whether a payment provider is a sandbox / simulation provider.
 */
export function isSandboxPaymentProvider(provider?: PaymentProvider | string | null): boolean {
  if (!provider) return true;
  if (typeof provider === 'string') {
    return provider.toUpperCase().includes('SANDBOX');
  }
  return (
    provider instanceof SandboxPaymentProvider ||
    (typeof provider.providerName === 'string' &&
      provider.providerName.toUpperCase().includes('SANDBOX'))
  );
}

export class SandboxPaymentProvider implements PaymentProvider {
  readonly providerName = 'SANDBOX_LOCAL_PROVIDER';

  async processSubscriptionCharge(req: PaymentChargeRequest): Promise<PaymentChargeResult> {
    if (req.amountEgp < 0) {
      return {
        success: false,
        provider: this.providerName,
        providerRef: '',
        status: 'FAILED',
        errorMessage: 'قيمة الدفع غير صالحة.',
      };
    }

    // Phase 1A: Sandbox charges for paid amounts are forbidden in production
    if (process.env.NODE_ENV === 'production' && req.amountEgp > 0) {
      return {
        success: false,
        provider: this.providerName,
        providerRef: '',
        status: 'FAILED',
        errorMessage: 'بوابة الدفع التجريبية (Sandbox) غير مسموح بها لتفعيل الباقات المدفوعة في بيئة الإنتاج.',
      };
    }

    return {
      success: true,
      provider: this.providerName,
      providerRef: `LF-EGP-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`,
      status: 'COMPLETED',
    };
  }
}

export const defaultPaymentProvider: PaymentProvider = new SandboxPaymentProvider();

export const DEFAULT_PLANS = [
  {
    slug: 'free',
    name: 'الباقة المجانية (Free)',
    nameEn: 'Free',
    priceEgp: 0,
    monthlyCredits: 3,
    allowsExclusive: false,
    maxConcurrentClaims: 10,
    features: [
      '3 نقاط رصيد (3 Leads) للتجربة',
      'الوصول إلى فرص العملاء المشتركة (Shared Leads)',
      'تصفية متقدمة حسب المدينة والتصنيف',
      'عرض أسباب التأهيل وتقييم الفرص',
    ],
    isActive: true,
    sortOrder: 1,
  },
  {
    slug: 'starter',
    name: 'باقة البداية (Starter)',
    nameEn: 'Starter',
    priceEgp: 299,
    monthlyCredits: 20,
    allowsExclusive: true,
    maxConcurrentClaims: 50,
    features: [
      '20 نقطة رصيد شهريًا (20 Leads)',
      'إمكانية الحصول على الفرص الحصرية والمشتركة',
      'مطابقة ذكية تلقائية حسب تخصصك ومدينتك',
      'تحليل فني كامل للمواقع القديمة أو الضعيفة',
      'نظام إدارة ومتابعة العملاء (CRM Pipeline)',
    ],
    isActive: true,
    sortOrder: 2,
  },
  {
    slug: 'pro',
    name: 'الباقة الاحترافية (Pro)',
    nameEn: 'Pro',
    priceEgp: 599,
    monthlyCredits: 50,
    allowsExclusive: true,
    maxConcurrentClaims: 150,
    features: [
      '50 نقطة رصيد شهريًا (50 Leads)',
      'أولوية الوصول للفرص الساخنة (HOT & PREMIUM)',
      'دعم الفرص الحصرية بالكامل (Exclusive Leads)',
      'تنبيهات فورية عند توفر عملاء مطابقين لملفك',
      'تتبع كامل لمراحل التعاقد والملاحظات',
    ],
    isActive: true,
    sortOrder: 3,
  },
  {
    slug: 'business',
    name: 'باقة الشركات والوكالات (Business)',
    nameEn: 'Business',
    priceEgp: 999,
    monthlyCredits: 100,
    allowsExclusive: true,
    maxConcurrentClaims: 500,
    features: [
      '100 نقطة رصيد شهريًا (100 Leads)',
      'مخصصة لشركات البرمجة ووكالات تطوير المواقع',
      'أولوية قصوى في الفرص الحصرية ذات الميزانيات المرتفعة',
      'تقارير تحويل وأداء تفصيلية للفريق',
      'دعم فني مخصص وتحديث دوري للبيانات',
    ],
    isActive: true,
    sortOrder: 4,
  },
];

export async function subscribeUserToPlan(params: {
  prisma: PrismaClient;
  userId: string;
  planId: string;
  paymentProvider?: PaymentProvider;
}) {
  const { prisma, userId, planId, paymentProvider = defaultPaymentProvider } = params;

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) {
    throw new Error('الباقة المختارة غير متاحة حاليًا.');
  }

  // Phase 1A: Reject sandbox payments in production for paid plans before mutating any records
  if (
    process.env.NODE_ENV === 'production' &&
    plan.priceEgp > 0 &&
    isSandboxPaymentProvider(paymentProvider)
  ) {
    throw new AppSecurityError(
      'FORBIDDEN',
      'لا يمكن تفعيل الباقات المدفوعة عبر بوابة الدفع التجريبية في بيئة الإنتاج.',
      403,
      { planId: plan.id, planSlug: plan.slug, priceEgp: plan.priceEgp }
    );
  }

  const chargeResult = await paymentProvider.processSubscriptionCharge({
    userId,
    planId: plan.id,
    planSlug: plan.slug,
    amountEgp: plan.priceEgp,
    currency: 'EGP',
  });

  if (!chargeResult.success) {
    throw new Error(chargeResult.errorMessage || 'تعذر إتمام عملية الدفع.');
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Deduplication / Idempotency check by providerRef (FIN-03)
    if (chargeResult.providerRef && chargeResult.providerRef.trim().length > 0) {
      const existingPayment = await tx.payment.findFirst({
        where: { providerRef: chargeResult.providerRef.trim() },
      });
      if (existingPayment && existingPayment.status === 'COMPLETED') {
        const existingSub = await tx.subscription.findUnique({
          where: { userId },
          include: { plan: true },
        });
        if (existingSub) {
          return { payment: existingPayment, subscription: existingSub };
        }
      }
    }

    const existingSub = await tx.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    const isFreePlan = plan.priceEgp === 0 || plan.slug === 'free';
    // If switching to Free plan, do not grant extra points if developer already had a subscription;
    // for paid plans, grant the plan's monthly credits.
    const creditsToGrant = isFreePlan
      ? (existingSub ? 0 : plan.monthlyCredits)
      : plan.monthlyCredits;

    // Load or initialize credit account to preserve existing unused points
    const account = await ensureDeveloperCreditAccount(tx, userId);
    const balanceBefore = account.balance;
    const newBalance = balanceBefore + creditsToGrant;

    const payment = await tx.payment.create({
      data: {
        userId,
        planId: plan.id,
        amountEgp: plan.priceEgp,
        creditsGranted: creditsToGrant,
        provider: chargeResult.provider,
        providerRef: chargeResult.providerRef,
        status: chargeResult.status,
        metadata: {
          planSlug: plan.slug,
          planName: plan.name,
          mode: isSandboxPaymentProvider(chargeResult.provider)
            ? 'SANDBOX_SIMULATION'
            : 'LIVE_PAYMENT',
          balanceBefore,
          balanceAfter: newBalance,
          creditsToGrant,
        },
      },
    });

    // Atomically increment credit account and append immutable ledger entry
    if (creditsToGrant > 0) {
      await tx.developerCreditAccount.update({
        where: { id: account.id },
        data: {
          balance: newBalance,
          lifetimePurchased: { increment: creditsToGrant },
          totalGranted: { increment: creditsToGrant },
          version: { increment: 1 },
        },
      });

      await tx.creditTransaction.create({
        data: {
          accountId: account.id,
          developerId: userId,
          type: 'PURCHASE',
          amount: creditsToGrant,
          balanceBefore,
          balanceAfter: newBalance,
          referenceType: 'PAYMENT',
          referenceId: payment.id,
          reason: `Subscription purchase: ${plan.nameEn} (${plan.slug})`,
          idempotencyKey: `payment-${payment.id}`,
          performedById: userId,
        },
      });
    }

    const subscription = existingSub
      ? await tx.subscription.update({
          where: { userId },
          data: {
            planId: plan.id,
            status: 'ACTIVE',
            credits: newBalance,
            totalCreditsGranted: { increment: creditsToGrant },
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          include: { plan: true },
        })
      : await tx.subscription.create({
          data: {
            userId,
            planId: plan.id,
            status: 'ACTIVE',
            credits: newBalance,
            totalCreditsGranted: creditsToGrant,
            creditsUsed: 0,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          include: { plan: true },
        });

    return { payment, subscription };
  });

  await createInAppNotification(
    {
      userId,
      title: 'تم تفعيل اشتراكك بنجاح',
      message: `تم الاشتراك في ${plan.name} وإضافة ${plan.monthlyCredits} نقطة رصيد إلى حسابك.`,
      type: 'SUBSCRIPTION',
      link: '/subscription',
    },
    prisma
  );

    await createAuditLog(
      {
        userId,
        action: 'SUBSCRIPTION_CHANGED',
        entityType: 'Subscription',
        entityId: result.subscription.id,
        details: {
          planSlug: plan.slug,
          priceEgp: plan.priceEgp,
          creditsGranted: plan.monthlyCredits,
          providerRef: chargeResult.providerRef,
        },
      },
      prisma
    );

  return result;
}

/**
 * Submits a manual transfer (InstaPay / Vodafone Cash) payment request with receipt screenshot.
 * The receipt is stored temporarily in status PENDING and permanently purged upon approve/reject.
 */
export async function submitTransferPayment(params: {
  prisma: PrismaClient;
  userId: string;
  planId: string;
  receiptImageBase64: string;
  transferPhone?: string;
  senderPhone?: string;
}) {
  const { prisma, userId, planId, receiptImageBase64, transferPhone = '01229105279', senderPhone } = params;

  const [user, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { subscription: true } }),
    prisma.plan.findUnique({ where: { id: planId } }),
  ]);

  if (!user) throw new Error('المستخدم غير موجود.');
  if (!plan) throw new Error('الباقة المختارة غير موجودة.');
  if (!receiptImageBase64) throw new Error('صورة إيصال التحويل مطلوبة.');

  const now = new Date();
  const providerRef = `TRANSFER-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const payment = await prisma.payment.create({
    data: {
      userId,
      planId: plan.id,
      amountEgp: plan.priceEgp,
      creditsGranted: plan.monthlyCredits,
      provider: 'INSTAPAY_WALLET',
      providerRef,
      status: 'PENDING',
      metadata: {
        receiptImage: receiptImageBase64,
        paymentMethod: 'INSTAPAY_WALLET',
        transferredTo: transferPhone,
        senderPhone: senderPhone || null,
        submittedAt: now.toISOString(),
      },
    },
    include: {
      plan: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  await createInAppNotification(
    {
      userId,
      title: 'تم استلام إيصال التحويل',
      message: `تم استلام إيصال تحويل ${plan.name} بمبلغ ${plan.priceEgp} ج.م. جاري مراجعة الإيصال وتفعيل باقتك فوراً.`,
      type: 'SUBSCRIPTION',
      link: '/subscription',
    },
    prisma
  );

  await createAuditLog(
    {
      userId,
      action: 'PAYMENT_RECEIPT_SUBMITTED',
      entityType: 'Payment',
      entityId: payment.id,
      details: {
        planSlug: plan.slug,
        priceEgp: plan.priceEgp,
        providerRef,
        transferredTo: transferPhone,
      },
    },
    prisma
  );

  return payment;
}

/**
 * Approves a pending manual transfer payment.
 * Upgrades subscription, awards credits, and PERMANENTLY PURGES the receipt image for privacy.
 */
export async function approveTransferPayment(params: {
  prisma: PrismaClient;
  paymentId: string;
  adminId: string;
}) {
  const { prisma, paymentId, adminId } = params;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { plan: true, user: { include: { subscription: true } } },
  });

  if (!payment) throw new Error('سجل الدفع غير موجود.');
  if (payment.status !== 'PENDING') {
    throw new Error(`حالة المعاملة الحالية (${payment.status}) لا تسمح بالموافقة.`);
  }

  const { plan, user } = payment;
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const existingMeta = (payment.metadata as Record<string, unknown>) || {};
  // CRITICAL: Permanently purge the receipt image per privacy policy
  const { receiptImage: _purged, ...cleanMeta } = existingMeta;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Atomic compare-and-set: update Payment WHERE id = paymentId AND status = PENDING
    const updateResult = await tx.payment.updateMany({
      where: {
        id: paymentId,
        status: 'PENDING',
      },
      data: {
        status: 'COMPLETED',
        metadata: {
          ...cleanMeta,
          approvedAt: now.toISOString(),
          approvedBy: adminId,
          receiptPurged: true,
        },
      },
    });

    if (updateResult.count !== 1) {
      const conflictErr = new Error('حالة المعاملة الحالية لا تسمح بالموافقة.');
      (conflictErr as any).statusCode = 409;
      (conflictErr as any).code = 'CONFLICT';
      throw conflictErr;
    }

    const updatedPayment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { plan: true, user: true },
    });

    // 2. Fetch latest subscription state inside the transaction
    const currentSubscription = await tx.subscription.findUnique({
      where: { userId: user.id },
      include: { plan: true },
    });

    const subscription = currentSubscription
      ? await tx.subscription.update({
          where: { id: currentSubscription.id },
          data: {
            planId: plan.id,
            status: 'ACTIVE',
            credits: { increment: plan.monthlyCredits },
            totalCreditsGranted: { increment: plan.monthlyCredits },
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          include: { plan: true },
        })
      : await tx.subscription.create({
          data: {
            userId: user.id,
            planId: plan.id,
            status: 'ACTIVE',
            credits: plan.monthlyCredits,
            totalCreditsGranted: plan.monthlyCredits,
            creditsUsed: 0,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          include: { plan: true },
        });

    // 3. Sync credit ledger
    await syncSubscriptionCreditsToLedgerInTx(tx, {
      developerId: user.id,
      targetBalance: subscription.credits,
      type: 'PURCHASE',
      reason: `Manual transfer approved: ${plan.nameEn} (${plan.slug})`,
      referenceType: 'PAYMENT',
      referenceId: payment.id,
      performedById: adminId,
    });

    return { payment: updatedPayment, subscription };
  });

  // 4. In-app notification
  await createInAppNotification(
    {
      userId: user.id,
      title: 'تم تفعيل باقتك بنجاح ✅',
      message: `تم التحقق من إيصال التحويل وتفعيل ${plan.name} وإضافة ${plan.monthlyCredits} نقطة رصيد إلى حسابك.`,
      type: 'SUBSCRIPTION',
      link: '/subscription',
    },
    prisma
  );

  // 5. Audit log
  await createAuditLog(
    {
      userId: adminId,
      action: 'PAYMENT_TRANSFER_APPROVED',
      entityType: 'Payment',
      entityId: paymentId,
      details: {
        planSlug: plan.slug,
        priceEgp: plan.priceEgp,
        creditsGranted: plan.monthlyCredits,
        recipientUserId: user.id,
      },
    },
    prisma
  );

  return result;
}

/**
 * Rejects a pending manual transfer payment.
 * Marks status as REJECTED and PERMANENTLY PURGES the receipt image.
 */
export async function rejectTransferPayment(params: {
  prisma: PrismaClient;
  paymentId: string;
  adminId: string;
  reason?: string;
}) {
  const { prisma, paymentId, adminId, reason = 'إيصال التحويل غير صالح أو لم يصل إلى الحساب.' } = params;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { plan: true, user: true },
  });

  if (!payment) throw new Error('سجل الدفع غير موجود.');
  if (payment.status !== 'PENDING') {
    throw new Error(`حالة المعاملة الحالية (${payment.status}) لا تسمح بالرفض.`);
  }

  const now = new Date();
  const existingMeta = (payment.metadata as Record<string, unknown>) || {};
  // CRITICAL: Permanently purge the receipt image per privacy policy
  const { receiptImage: _purged, ...cleanMeta } = existingMeta;

  const updatedPayment = await prisma.$transaction(async (tx) => {
    // Atomic compare-and-set: update Payment WHERE id = paymentId AND status = PENDING
    const updateResult = await tx.payment.updateMany({
      where: {
        id: paymentId,
        status: 'PENDING',
      },
      data: {
        status: 'REJECTED',
        metadata: {
          ...cleanMeta,
          rejectedAt: now.toISOString(),
          rejectedBy: adminId,
          rejectionReason: reason,
          receiptPurged: true,
        },
      },
    });

    if (updateResult.count !== 1) {
      const conflictErr = new Error('حالة المعاملة الحالية لا تسمح بالرفض.');
      (conflictErr as any).statusCode = 409;
      (conflictErr as any).code = 'CONFLICT';
      throw conflictErr;
    }

    return tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { plan: true, user: true },
    });
  });

  await createInAppNotification(
    {
      userId: payment.userId,
      title: 'تعذر قبول إيصال التحويل ❌',
      message: `لم نتمكن من تأكيد التحويل الخاص بـ ${payment.plan.name}. السبب: ${reason}`,
      type: 'SUBSCRIPTION',
      link: '/pricing',
    },
    prisma
  );

  await createAuditLog(
    {
      userId: adminId,
      action: 'PAYMENT_TRANSFER_REJECTED',
      entityType: 'Payment',
      entityId: paymentId,
      details: {
        planSlug: payment.plan.slug,
        priceEgp: payment.amountEgp,
        reason,
        developerUserId: payment.userId,
      },
    },
    prisma
  );

  return updatedPayment;
}

// ============================================================================
// PHASE 10 — PAYMENT PRODUCTION READINESS & WEBHOOK PROCESSING (SECTIONS 21 & 22)
// ============================================================================

import { createHmac, timingSafeEqual } from 'crypto';
import { ensureDeveloperCreditAccount } from '../claims/credit-service';
import { withResourceLocks } from '../claims/locks';
import { incrementCounter } from '../observability/metrics';

export type SupportedWebhookEventType =
  | 'payment.ping'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.cancelled'
  | 'payment.refunded'
  | 'subscription.expired'
  | 'subscription.renewed';

const SUPPORTED_WEBHOOK_EVENTS = new Set<SupportedWebhookEventType>([
  'payment.ping',
  'payment.succeeded',
  'payment.failed',
  'payment.cancelled',
  'payment.refunded',
  'subscription.expired',
  'subscription.renewed',
]);

export interface PaymentWebhookPayload {
  eventId: string;
  type: string;
  provider?: string;
  providerRef?: string;
  userId?: string;
  planId?: string;
  planSlug?: string;
  amountEgp?: number;
  credits?: number;
  reason?: string;
  simulateTimeout?: boolean;
  occurredAt?: string;
}

export interface WebhookSignatureVerificationResult {
  valid: boolean;
  errorCode?:
    | 'MISSING_SIGNATURE'
    | 'MISSING_WEBHOOK_SECRET'
    | 'INVALID_TIMESTAMP'
    | 'TIMESTAMP_EXPIRED'
    | 'INVALID_SIGNATURE';
  message?: string;
}

export function getConfiguredWebhookSecret(env: Record<string, string | undefined> = process.env): string {
  const configured = (env.PAYMENT_WEBHOOK_SECRET || '').trim();
  if (configured) return configured;
  if ((env.NODE_ENV || '').toLowerCase() === 'production') {
    return '';
  }
  return 'dev_sandbox_webhook_secret_key_leadforge_egypt_2025';
}

export function signPaymentWebhookPayload(
  rawBody: string,
  webhookSecret: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const signedPayload = `${timestampSeconds}.${rawBody}`;
  const digest = createHmac('sha256', webhookSecret).update(signedPayload, 'utf8').digest('hex');
  return `t=${timestampSeconds},v1=${digest}`;
}

export function verifyPaymentWebhookSignature(params: {
  rawBody: string;
  signatureHeader?: string | null;
  timestampHeader?: string | null;
  webhookSecret?: string | null;
  maxSkewSeconds?: number;
}): WebhookSignatureVerificationResult {
  const secret = (params.webhookSecret ?? getConfiguredWebhookSecret()).trim();
  if (!secret) {
    return {
      valid: false,
      errorCode: 'MISSING_WEBHOOK_SECRET',
      message: 'Payment webhook signing secret is not configured.',
    };
  }

  const rawHeader = (params.signatureHeader || '').trim();
  if (!rawHeader) {
    return {
      valid: false,
      errorCode: 'MISSING_SIGNATURE',
      message: 'Missing payment webhook signature header.',
    };
  }

  let timestampStr = (params.timestampHeader || '').trim();
  let signatureHex = rawHeader;

  if (rawHeader.includes('v1=')) {
    const parts = rawHeader.split(',').map((p) => p.trim());
    for (const part of parts) {
      if (part.startsWith('t=')) timestampStr = part.slice(2);
      if (part.startsWith('v1=')) signatureHex = part.slice(3);
    }
  }

  const timestampSec = Number(timestampStr);
  if (!timestampStr || !Number.isFinite(timestampSec) || timestampSec <= 0) {
    return {
      valid: false,
      errorCode: 'INVALID_TIMESTAMP',
      message: 'Invalid or missing webhook timestamp.',
    };
  }

  const maxSkew = params.maxSkewSeconds ?? 300;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestampSec) > maxSkew) {
    return {
      valid: false,
      errorCode: 'TIMESTAMP_EXPIRED',
      message: 'Webhook timestamp is outside the allowed replay tolerance window.',
    };
  }

  const expectedPayload = `${timestampSec}.${params.rawBody}`;
  const expectedHex = createHmac('sha256', secret).update(expectedPayload, 'utf8').digest('hex');

  const expectedBuf = Buffer.from(expectedHex, 'utf8');
  const providedBuf = Buffer.from(signatureHex, 'utf8');

  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    return {
      valid: false,
      errorCode: 'INVALID_SIGNATURE',
      message: 'Webhook HMAC signature verification failed.',
    };
  }

  return { valid: true };
}

export interface PaymentWebhookProcessResult {
  ok: boolean;
  httpStatus: number;
  code:
    | 'PROCESSED'
    | 'IDEMPOTENT_DUPLICATE'
    | 'OUT_OF_ORDER_IGNORED'
    | 'MISSING_SIGNATURE'
    | 'INVALID_SIGNATURE'
    | 'MALFORMED_PAYLOAD'
    | 'UNSUPPORTED_EVENT'
    | 'PROVIDER_TIMEOUT'
    | 'ENTITY_NOT_FOUND';
  eventId?: string;
  eventType?: string;
  idempotentReplay?: boolean;
  creditsGranted?: number;
  creditsReversed?: number;
  paymentStatus?: string;
  message: string;
}

const processedWebhookEventIds = new Set<string>();

/**
 * Processes incoming payment webhooks with signature verification, replay protection,
 * idempotency guarantees, out-of-order terminal state guards, and atomic ledger updates.
 */
export async function processPaymentWebhookEvent(params: {
  prisma: PrismaClient;
  rawBody: string;
  signatureHeader?: string | null;
  timestampHeader?: string | null;
  webhookSecret?: string | null;
}): Promise<PaymentWebhookProcessResult> {
  const { prisma, rawBody, signatureHeader, timestampHeader, webhookSecret } = params;

  const sigCheck = verifyPaymentWebhookSignature({
    rawBody,
    signatureHeader,
    timestampHeader,
    webhookSecret,
  });

  if (!sigCheck.valid) {
    incrementCounter('payment_webhook_failures_total');
    const isMissing = sigCheck.errorCode === 'MISSING_SIGNATURE';
    return {
      ok: false,
      httpStatus: 401,
      code: isMissing ? 'MISSING_SIGNATURE' : 'INVALID_SIGNATURE',
      message: sigCheck.message || 'Invalid webhook signature.',
    };
  }

  let payload: PaymentWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    incrementCounter('payment_webhook_failures_total');
    return {
      ok: false,
      httpStatus: 400,
      code: 'MALFORMED_PAYLOAD',
      message: 'Webhook body is not valid JSON.',
    };
  }

  if (!payload || typeof payload !== 'object' || !payload.eventId || !payload.type) {
    incrementCounter('payment_webhook_failures_total');
    return {
      ok: false,
      httpStatus: 400,
      code: 'MALFORMED_PAYLOAD',
      message: 'Webhook payload requires eventId and type.',
    };
  }

  if (payload.simulateTimeout) {
    incrementCounter('payment_webhook_failures_total');
    return {
      ok: false,
      httpStatus: 504,
      code: 'PROVIDER_TIMEOUT',
      eventId: payload.eventId,
      eventType: payload.type,
      message: 'Payment provider webhook processing timed out safely; retryable.',
    };
  }

  if (!SUPPORTED_WEBHOOK_EVENTS.has(payload.type as SupportedWebhookEventType)) {
    return {
      ok: false,
      httpStatus: 422,
      code: 'UNSUPPORTED_EVENT',
      eventId: payload.eventId,
      eventType: payload.type,
      message: `Unsupported webhook event type: ${payload.type}`,
    };
  }

  const eventType = payload.type as SupportedWebhookEventType;
  if (eventType === 'payment.ping') {
    return {
      ok: true,
      httpStatus: 200,
      code: 'PROCESSED',
      eventId: payload.eventId,
      eventType,
      idempotentReplay: false,
      message: 'Webhook ping verified.',
    };
  }

  const providerRef = (payload.providerRef || `wh_ref_${payload.eventId}`).trim();
  const providerName = (payload.provider || 'WEBHOOK_PROVIDER').trim();

  return withResourceLocks(
    [`webhook_event:${payload.eventId}`, `webhook_ref:${providerRef}`],
    async () => {
      // Check in-memory and AuditLog idempotency for exact eventId inside the lock
      if (processedWebhookEventIds.has(payload.eventId)) {
        return {
          ok: true,
          httpStatus: 200,
          code: 'IDEMPOTENT_DUPLICATE',
          eventId: payload.eventId,
          eventType,
          idempotentReplay: true,
          creditsGranted: 0,
          message: 'Webhook event already processed (idempotent duplicate).',
        };
      }

      const existingEventAudit = await prisma.auditLog.findFirst({
        where: {
          action: 'PAYMENT_WEBHOOK_PROCESSED',
          entityId: payload.eventId,
        },
      });

      if (existingEventAudit) {
        processedWebhookEventIds.add(payload.eventId);
        return {
          ok: true,
          httpStatus: 200,
          code: 'IDEMPOTENT_DUPLICATE',
          eventId: payload.eventId,
          eventType,
          idempotentReplay: true,
          creditsGranted: 0,
          message: 'Webhook event already recorded in AuditLog (idempotent duplicate).',
        };
      }

      if (eventType === 'payment.succeeded' || eventType === 'subscription.renewed') {
        if (!payload.userId) {
          return {
            ok: false,
            httpStatus: 400,
            code: 'MALFORMED_PAYLOAD',
            eventId: payload.eventId,
            eventType,
            message: 'userId is required for payment.succeeded / subscription.renewed.',
          };
        }

        const user = await prisma.user.findUnique({ where: { id: payload.userId } });
        const plan = payload.planId
          ? await prisma.plan.findUnique({ where: { id: payload.planId } })
          : payload.planSlug
          ? await prisma.plan.findUnique({ where: { slug: payload.planSlug } })
          : await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });

        if (!user || !plan) {
          return {
            ok: false,
            httpStatus: 404,
            code: 'ENTITY_NOT_FOUND',
            eventId: payload.eventId,
            eventType,
            message: 'Referenced user or subscription plan not found.',
          };
        }

        // Check existing payment by providerRef to guard against duplicate or out-of-order webhooks
        const existingPayment = await prisma.payment.findFirst({
          where: { providerRef },
          orderBy: { createdAt: 'desc' },
        });

        if (existingPayment) {
          if (existingPayment.status === 'COMPLETED' && eventType === 'payment.succeeded') {
            processedWebhookEventIds.add(payload.eventId);
            return {
              ok: true,
              httpStatus: 200,
              code: 'IDEMPOTENT_DUPLICATE',
              eventId: payload.eventId,
              eventType,
              idempotentReplay: true,
              creditsGranted: 0,
              paymentStatus: 'COMPLETED',
              message: `Payment ${providerRef} was already completed; credits not granted twice.`,
            };
          }

          if (existingPayment.status === 'REFUNDED' || existingPayment.status === 'CANCELLED') {
            processedWebhookEventIds.add(payload.eventId);
            return {
              ok: true,
              httpStatus: 200,
              code: 'OUT_OF_ORDER_IGNORED',
              eventId: payload.eventId,
              eventType,
              idempotentReplay: true,
              creditsGranted: 0,
              paymentStatus: existingPayment.status,
              message: `Ignored out-of-order ${eventType} because payment ${providerRef} is already in terminal state ${existingPayment.status}.`,
            };
          }
        }

        const creditsToGrant = Math.max(0, payload.credits ?? plan.monthlyCredits);
        const amountEgp = Math.max(0, payload.amountEgp ?? plan.priceEgp);
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const txIdempotencyKey = `webhook-grant-${providerRef}-${eventType === 'subscription.renewed' ? payload.eventId : 'initial'}`;

        let isIdempotentDuplicate = false;
        await prisma.$transaction(async (tx) => {
          let paymentId: string;
          if (existingPayment) {
            const updateResult = await tx.payment.updateMany({
              where: { id: existingPayment.id, status: 'PENDING' },
              data: { status: 'COMPLETED', creditsGranted: creditsToGrant },
            });
            if (updateResult.count === 0) {
              isIdempotentDuplicate = true;
              return;
            }
            paymentId = existingPayment.id;
          } else {
            const payment = await tx.payment.create({
              data: {
                userId: user.id,
                planId: plan.id,
                amountEgp,
                creditsGranted: creditsToGrant,
                provider: providerName,
                providerRef,
                status: 'COMPLETED',
                metadata: { eventId: payload.eventId, eventType },
              },
            });
            paymentId = payment.id;
          }

          const account = await ensureDeveloperCreditAccount(tx, user.id);

          const existingCreditTx = await tx.creditTransaction.findFirst({
            where: {
              developerId: user.id,
              idempotencyKey: txIdempotencyKey,
            },
          });

          if (existingCreditTx) {
            isIdempotentDuplicate = true;
            return;
          }

          if (creditsToGrant > 0) {
            const balanceBefore = account.balance;
            const balanceAfter = balanceBefore + creditsToGrant;

            await tx.developerCreditAccount.update({
              where: { id: account.id },
              data: {
                balance: balanceAfter,
                lifetimePurchased: { increment: creditsToGrant },
                totalGranted: { increment: creditsToGrant },
                version: { increment: 1 },
              },
            });

            await tx.creditTransaction.create({
              data: {
                accountId: account.id,
                developerId: user.id,
                type: 'PURCHASE',
                amount: creditsToGrant,
                balanceBefore,
                balanceAfter,
                referenceType: 'PAYMENT_WEBHOOK',
                referenceId: paymentId,
                idempotencyKey: txIdempotencyKey,
                reason: `Webhook ${eventType} (${providerRef})`,
              },
            });

            const existingSub = await tx.subscription.findUnique({ where: { userId: user.id } });
            if (existingSub) {
              await tx.subscription.update({
                where: { userId: user.id },
                data: {
                  planId: plan.id,
                  status: 'ACTIVE',
                  credits: balanceAfter,
                  totalCreditsGranted: { increment: creditsToGrant },
                  currentPeriodStart: now,
                  currentPeriodEnd: periodEnd,
                },
              });
            } else {
              await tx.subscription.create({
                data: {
                  userId: user.id,
                  planId: plan.id,
                  status: 'ACTIVE',
                  credits: balanceAfter,
                  totalCreditsGranted: creditsToGrant,
                  creditsUsed: 0,
                  currentPeriodStart: now,
                  currentPeriodEnd: periodEnd,
                },
              });
            }
          }

          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: 'PAYMENT_WEBHOOK_PROCESSED',
              entityType: 'Payment',
              entityId: payload.eventId,
              details: {
                eventType,
                providerRef,
                creditsGranted: creditsToGrant,
                amountEgp,
              },
            },
          });
        });

        processedWebhookEventIds.add(payload.eventId);
        if (isIdempotentDuplicate) {
          return {
            ok: true,
            httpStatus: 200,
            code: 'IDEMPOTENT_DUPLICATE',
            eventId: payload.eventId,
            eventType,
            idempotentReplay: true,
            creditsGranted: 0,
            paymentStatus: 'COMPLETED',
            message: `Payment ${providerRef} was already completed; credits not granted twice.`,
          };
        }

        incrementCounter('payment_webhook_success_total');
        return {
          ok: true,
          httpStatus: 200,
          code: 'PROCESSED',
          eventId: payload.eventId,
          eventType,
          idempotentReplay: false,
          creditsGranted: creditsToGrant,
          paymentStatus: 'COMPLETED',
          message: 'Payment webhook processed and credits granted idempotently.',
        };
      }

      if (eventType === 'payment.failed' || eventType === 'payment.cancelled') {
        const targetStatus = eventType === 'payment.failed' ? 'FAILED' : 'CANCELLED';
        const existingPayment = await prisma.payment.findFirst({
          where: { providerRef },
          orderBy: { createdAt: 'desc' },
        });

        if (existingPayment) {
          const terminalStates = ['COMPLETED', 'REFUNDED', 'FAILED', 'CANCELLED'];
          if (terminalStates.includes(existingPayment.status)) {
            processedWebhookEventIds.add(payload.eventId);
            return {
              ok: true,
              httpStatus: 200,
              code: 'OUT_OF_ORDER_IGNORED',
              eventId: payload.eventId,
              eventType,
              idempotentReplay: true,
              creditsGranted: 0,
              paymentStatus: existingPayment.status,
              message: `Ignored out-of-order ${eventType} because payment ${providerRef} is already in terminal state ${existingPayment.status}.`,
            };
          }
        }

        if (payload.userId) {
          const user = await prisma.user.findUnique({ where: { id: payload.userId } });
          const plan = payload.planId
            ? await prisma.plan.findUnique({ where: { id: payload.planId } })
            : await prisma.plan.findFirst({ orderBy: { sortOrder: 'asc' } });

          if (user && plan) {
            if (existingPayment) {
              const updateRes = await prisma.payment.updateMany({
                where: { id: existingPayment.id, status: 'PENDING' },
                data: { status: targetStatus, creditsGranted: 0 },
              });
              if (updateRes.count === 0) {
                processedWebhookEventIds.add(payload.eventId);
                return {
                  ok: true,
                  httpStatus: 200,
                  code: 'OUT_OF_ORDER_IGNORED',
                  eventId: payload.eventId,
                  eventType,
                  idempotentReplay: true,
                  creditsGranted: 0,
                  paymentStatus: existingPayment.status,
                  message: `Ignored out-of-order ${eventType} because payment ${providerRef} is no longer PENDING.`,
                };
              }
            } else {
              await prisma.payment.create({
                data: {
                  userId: user.id,
                  planId: plan.id,
                  amountEgp: payload.amountEgp ?? plan.priceEgp,
                  creditsGranted: 0,
                  provider: providerName,
                  providerRef,
                  status: targetStatus,
                  metadata: { eventId: payload.eventId, eventType, reason: payload.reason },
                },
              });
            }
          }
        }

        await prisma.auditLog.create({
          data: {
            userId: payload.userId ?? null,
            action: 'PAYMENT_WEBHOOK_PROCESSED',
            entityType: 'Payment',
            entityId: payload.eventId,
            details: { eventType, providerRef, status: targetStatus },
          },
        });

        processedWebhookEventIds.add(payload.eventId);
        return {
          ok: true,
          httpStatus: 200,
          code: 'PROCESSED',
          eventId: payload.eventId,
          eventType,
          idempotentReplay: false,
          creditsGranted: 0,
          paymentStatus: targetStatus,
          message: `Recorded ${targetStatus} payment state without granting credits.`,
        };
      }

      if (eventType === 'payment.refunded') {
        const existingPayment = await prisma.payment.findFirst({
          where: { providerRef },
          orderBy: { createdAt: 'desc' },
        });

        if (existingPayment && existingPayment.status === 'REFUNDED') {
          processedWebhookEventIds.add(payload.eventId);
          return {
            ok: true,
            httpStatus: 200,
            code: 'IDEMPOTENT_DUPLICATE',
            eventId: payload.eventId,
            eventType,
            idempotentReplay: true,
            creditsGranted: 0,
            creditsReversed: 0,
            paymentStatus: 'REFUNDED',
            message: `Payment ${providerRef} was already refunded; duplicate refund ignored.`,
          };
        }

        let creditsReversed = 0;

        await prisma.$transaction(async (tx) => {
          if (existingPayment && existingPayment.status !== 'REFUNDED') {
            await tx.payment.update({
              where: { id: existingPayment.id },
              data: { status: 'REFUNDED' },
            });

            const account = await ensureDeveloperCreditAccount(tx, existingPayment.userId);
            // Never allow negative balance when reversing credits on a refund
            creditsReversed = Math.min(account.balance, Math.max(0, existingPayment.creditsGranted));

            if (creditsReversed > 0) {
              const balanceBefore = account.balance;
              const balanceAfter = balanceBefore - creditsReversed;

              await tx.developerCreditAccount.update({
                where: { id: account.id },
                data: {
                  balance: balanceAfter,
                  lifetimeSpent: { increment: creditsReversed },
                  totalSpent: { increment: creditsReversed },
                  version: { increment: 1 },
                },
              });

              await tx.creditTransaction.create({
                data: {
                  accountId: account.id,
                  developerId: existingPayment.userId,
                  type: 'ADMIN_ADJUSTMENT',
                  amount: -creditsReversed,
                  balanceBefore,
                  balanceAfter,
                  referenceType: 'PAYMENT_REFUND',
                  referenceId: existingPayment.id,
                  idempotencyKey: `webhook-refund-${providerRef}`,
                  reason: `Payment refunded via webhook (${providerRef})`,
                },
              });

              await tx.subscription.updateMany({
                where: { userId: existingPayment.userId },
                data: { status: 'CANCELLED', credits: balanceAfter },
              });
            }
          } else if (!existingPayment && payload.userId) {
            const plan = await tx.plan.findFirst({ orderBy: { sortOrder: 'asc' } });
            if (plan) {
              await tx.payment.create({
                data: {
                  userId: payload.userId,
                  planId: plan.id,
                  amountEgp: payload.amountEgp ?? 0,
                  creditsGranted: 0,
                  provider: providerName,
                  providerRef,
                  status: 'REFUNDED',
                  metadata: { eventId: payload.eventId, outOfOrderPreRecorded: true },
                },
              });
            }
          }

          await tx.auditLog.create({
            data: {
              userId: existingPayment?.userId ?? payload.userId ?? null,
              action: 'PAYMENT_WEBHOOK_PROCESSED',
              entityType: 'Payment',
              entityId: payload.eventId,
              details: { eventType, providerRef, creditsReversed },
            },
          });
        });

        processedWebhookEventIds.add(payload.eventId);
        return {
          ok: true,
          httpStatus: 200,
          code: 'PROCESSED',
          eventId: payload.eventId,
          eventType,
          idempotentReplay: false,
          creditsGranted: 0,
          creditsReversed,
          paymentStatus: 'REFUNDED',
          message: 'Payment refund processed safely without violating non-negative credit invariant.',
        };
      }

      // subscription.expired
      if (payload.userId) {
        await prisma.subscription.updateMany({
          where: { userId: payload.userId },
          data: { status: 'EXPIRED' },
        });
      }
      await prisma.auditLog.create({
        data: {
          userId: payload.userId ?? null,
          action: 'PAYMENT_WEBHOOK_PROCESSED',
          entityType: 'Subscription',
          entityId: payload.eventId,
          details: { eventType, providerRef },
        },
      });
      processedWebhookEventIds.add(payload.eventId);

      return {
        ok: true,
        httpStatus: 200,
        code: 'PROCESSED',
        eventId: payload.eventId,
        eventType,
        idempotentReplay: false,
        paymentStatus: 'EXPIRED',
        message: 'Subscription expiration processed.',
      };
    }
  );
}

/**
 * Reconciles Payment records with the CreditTransaction ledger (Section 21).
 */
export async function reconcilePaymentsWithLedger(prisma: PrismaClient) {
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: 'asc' },
  });

  const failedPaymentsWithCredits = payments.filter(
    (p) => (p.status === 'FAILED' || p.status === 'CANCELLED') && p.creditsGranted > 0
  );

  const completedPayments = payments.filter((p) => p.status === 'COMPLETED' && p.creditsGranted > 0);
  const unlinkedCompletedPaymentIds: string[] = [];

  for (const payment of completedPayments) {
    const isSandboxSimulation = payment.provider === 'SANDBOX_LOCAL_PROVIDER';
    const txCount = await prisma.creditTransaction.count({
      where: isSandboxSimulation
        ? {
            developerId: payment.userId,
            OR: [{ referenceId: payment.id }, { type: 'PURCHASE' }],
          }
        : {
            developerId: payment.userId,
            referenceId: payment.id,
          },
    });
    if (txCount === 0) {
      unlinkedCompletedPaymentIds.push(payment.id);
    }
  }

  return {
    reconciled: failedPaymentsWithCredits.length === 0 && unlinkedCompletedPaymentIds.length === 0,
    checkedAt: new Date().toISOString(),
    totalPayments: payments.length,
    completedPaymentsCount: completedPayments.length,
    failedPaymentsWithCreditsCount: failedPaymentsWithCredits.length,
    unlinkedCompletedPaymentIds,
  };
}

