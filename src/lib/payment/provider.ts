import { PrismaClient } from '@prisma/client';
import { createAuditLog } from '../audit';
import { createInAppNotification } from '../notifications';

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
    const payment = await tx.payment.create({
      data: {
        userId,
        planId: plan.id,
        amountEgp: plan.priceEgp,
        creditsGranted: plan.monthlyCredits,
        provider: chargeResult.provider,
        providerRef: chargeResult.providerRef,
        status: chargeResult.status,
        metadata: {
          planSlug: plan.slug,
          planName: plan.name,
          mode: 'SANDBOX_SIMULATION',
        },
      },
    });

    const existingSub = await tx.subscription.findUnique({
      where: { userId },
    });

    const subscription = existingSub
      ? await tx.subscription.update({
          where: { userId },
          data: {
            planId: plan.id,
            status: 'ACTIVE',
            credits: plan.monthlyCredits,
            totalCreditsGranted: plan.monthlyCredits,
            creditsUsed: 0,
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
            credits: plan.monthlyCredits,
            totalCreditsGranted: plan.monthlyCredits,
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
