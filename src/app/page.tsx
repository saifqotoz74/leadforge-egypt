import React from 'react';
import Link from 'next/link';
import { PublicNavbar, PublicFooter } from '@/components/PublicNavbar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OpportunityBadge } from '@/components/domain/OpportunityBadge';
import { QualityIndicator } from '@/components/domain/QualityIndicator';
import { OwnershipTag } from '@/components/domain/OwnershipTag';
import { fmtNumber } from '@/lib/format';
import {
  ShieldCheck,
  Check,
  Compass,
  Sliders,
  Globe,
  Lock,
  ArrowLeft,
  X,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div data-density="comfortable" className="min-h-screen flex flex-col bg-page">
      <PublicNavbar />

      {/* Hero Section per Spec Section 8 (Public pages) */}
      <section className="bg-surface border-b border-line py-12 sm:py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7 flex flex-col gap-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-subtle px-3.5 py-1.5 text-caption font-semibold text-fg-secondary w-fit">
                <ShieldCheck className="h-4 w-4 text-brand" />
                <span>منظومة تقييم قياسية شفافة 100% بدون ذكاء اصطناعي أو تخمين</span>
              </div>

              {/* Display headline max 20ch per Spec 4 & 5.2 */}
              <h1 className="text-display font-bold text-fg-primary max-w-[20ch]">
                فرص مبيعات مؤهلة بقواعد قياسية لتطوير المواقع في مصر
              </h1>

              {/* Subtitle body-lg max 60ch per Spec 4 & 5.2 */}
              <p className="text-body-lg text-fg-secondary max-w-[60ch]">
                تساعد LeadForge Egypt مطوري الويب المستقلين وشركات البرمجة في مصر على الوصول المباشر لأنشطة تجارية حقيقية تفتقر لموقع إلكتروني أو تمتلك مواقع بحاجة للتطوير، مع تقييمات موثقة وتواجد اجتماعي نشط.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link href="/register">
                  <Button variant="primary" size="lg" className="gap-2">
                    <span>ابدأ الآن مع 3 نقاط مجانية</span>
                    <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
                  </Button>
                </Link>
                <Link href="/leads">
                  <Button variant="secondary" size="lg" className="gap-2">
                    <Compass className="h-4 w-4" />
                    <span>استعراض الفرص المتاحة</span>
                  </Button>
                </Link>
              </div>

              {/* Verified Metrics Row with Western digits & tabular-nums */}
              <div className="grid grid-cols-3 gap-6 border-t border-line pt-6 text-start">
                <div>
                  <span className="block text-h2 font-bold text-fg-primary font-mono tabular-nums">
                    +{fmtNumber(50)}
                  </span>
                  <span className="text-caption text-fg-secondary">
                    نشاط تجاري مؤهل بقاعدة البيانات
                  </span>
                </div>
                <div>
                  <span className="block text-h2 font-bold text-brand font-mono tabular-nums">
                    {fmtNumber(10)}
                  </span>
                  <span className="text-caption text-fg-secondary">
                    قواعد فحص وتقييم فني شفاف
                  </span>
                </div>
                <div>
                  <span className="block text-h2 font-bold text-fg-primary font-mono tabular-nums">
                    {fmtNumber(10)}
                  </span>
                  <span className="text-caption text-fg-secondary">
                    محافظات تشمل القاهرة والإسكندرية
                  </span>
                </div>
              </div>
            </div>

            {/* Real Product Preview Frame per Spec Section 4 & 8 */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-line bg-surface p-6 shadow-lg">
                <div className="flex items-start justify-between border-b border-line pb-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <OpportunityBadge temperature="HOT" score={91} />
                      <OwnershipTag type="SHARED" seatsRemaining={2} maxSeats={3} />
                    </div>
                    <h3 className="text-h3 font-bold text-fg-primary mt-1">
                      عيادة النيل لطب وجراحة الأسنان
                    </h3>
                    <p className="text-caption text-fg-secondary">
                      القاهرة الجديدة • عيادات ومراكز طبية
                    </p>
                  </div>
                  <QualityIndicator status="FRESH" />
                </div>

                {/* Deterministic Evaluation Breakdown Preview */}
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-subtle p-3.5 text-body-sm">
                  <div>
                    <span className="text-caption text-fg-muted">الموقع الإلكتروني:</span>
                    <p className="mt-0.5 flex items-center gap-1 font-semibold text-fg-primary">
                      <X className="h-4 w-4 text-warning-text" />
                      <span>غير متوفر حالياً</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-caption text-fg-muted">رقم الهاتف:</span>
                    <p className="mt-0.5 flex items-center gap-1 font-semibold text-brand">
                      <Check className="h-4 w-4" />
                      <span>متاح وموثق</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-caption text-fg-muted">فيسبوك:</span>
                    <p className="mt-0.5 flex items-center gap-1 font-semibold text-fg-primary">
                      <Check className="h-4 w-4 text-brand" />
                      <span>نشط مع متابعين</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-caption text-fg-muted">إنستجرام:</span>
                    <p className="mt-0.5 flex items-center gap-1 font-semibold text-fg-primary">
                      <Check className="h-4 w-4 text-brand" />
                      <span>متواجد ومحدث</span>
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-caption font-bold text-fg-primary mb-2">
                    لماذا هذه الدرجة؟ (القواعد المحتسبة):
                  </p>
                  <ul className="flex flex-col gap-1.5 text-body-sm">
                    <li className="flex items-center justify-between rounded-lg bg-subtle px-3 py-1.5">
                      <span className="flex items-center gap-2 text-fg-secondary">
                        <Check className="h-3.5 w-3.5 text-brand" />
                        <span>غياب الموقع الإلكتروني مع حاجة ملحة للتعاقد</span>
                      </span>
                      <span className="font-mono font-semibold text-brand tabular-nums ltr-iso">
                        +30
                      </span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-subtle px-3 py-1.5">
                      <span className="flex items-center gap-2 text-fg-secondary">
                        <Check className="h-3.5 w-3.5 text-brand" />
                        <span>نشاط تجاري موثق ومسجل جغرافياً</span>
                      </span>
                      <span className="font-mono font-semibold text-brand tabular-nums ltr-iso">
                        +20
                      </span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-subtle px-3 py-1.5">
                      <span className="flex items-center gap-2 text-fg-secondary">
                        <Check className="h-3.5 w-3.5 text-brand" />
                        <span>تواجد اجتماعي نشط على شبكات التواصل</span>
                      </span>
                      <span className="font-mono font-semibold text-brand tabular-nums ltr-iso">
                        +20
                      </span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-subtle px-3 py-1.5">
                      <span className="flex items-center gap-2 text-fg-secondary">
                        <Check className="h-3.5 w-3.5 text-brand" />
                        <span>رقم هاتف مباشر وتقييم عملاء مرتفع</span>
                      </span>
                      <span className="font-mono font-semibold text-brand tabular-nums ltr-iso">
                        +21
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Pillars Section with alternating background (--bg-page) */}
      <section className="bg-page py-12 sm:py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-h1 font-bold text-fg-primary">
              كيف نحول البيانات إلى صفقات مؤهلة قابلة للتعاقد؟
            </h2>
            <p className="mt-3 text-body text-fg-secondary">
              جميع عمليات التحقق، فحص التكرار، واحتساب الدرجات تتم عبر محركات قواعد قياسية دقيقة ومحددة بدون أي اعتماد على نماذج ذكاء اصطناعي أو تخمين.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-6 flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Sliders className="h-5 w-5" />
              </div>
              <h3 className="text-h4 font-bold text-fg-primary">
                محرك التقييم القياسي
              </h3>
              <p className="text-body-sm text-fg-secondary">
                احتساب كل درجة من 100 نقطة وفق قواعد هندسية ثابتة، مع تقديم شرح تفصيلي فوري لسبب كل نقطة.
              </p>
            </Card>

            <Card className="p-6 flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Globe className="h-5 w-5" />
              </div>
              <h3 className="text-h4 font-bold text-fg-primary">
                فحص النطاقات والمواقع
              </h3>
              <p className="text-body-sm text-fg-secondary">
                فحص كفاءة النطاق، استجابة الخادم، شهادة SSL، وتوافق الهواتف لاكتشاف الاحتياج الفعلي لإعادة التطوير.
              </p>
            </Card>

            <Card className="p-6 flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="text-h4 font-bold text-fg-primary">
                محرك مطابقة المطورين
              </h3>
              <p className="text-body-sm text-fg-secondary">
                مطابقة دقيقة بحسب تخصصاتك والمدن والميزانيات المستهدفة لضمان وصول الفرص التي تناسب عملك فقط.
              </p>
            </Card>

            <Card className="p-6 flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="text-h4 font-bold text-fg-primary">
                نموذج تملك الفرص
              </h3>
              <p className="text-body-sm text-fg-secondary">
                خيار بين الفرص المشتركة بحد أقصى للمشترين أو الفرص الحصرية التي تُباع لجهة واحدة فقط وتُغلق نهائياً.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA Section with alternating background (--bg-brand-soft) */}
      <section className="bg-brand-soft border-t border-line py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center gap-6">
          <h2 className="text-h1 font-bold text-fg-primary">
            جاهز لبدء التواصل مع أنشطة تجارية تبحث عن مطور ويب؟
          </h2>
          <p className="text-body-lg text-fg-secondary max-w-[60ch]">
            سجل حسابك الآن واحصل على نقاط تجربة مجانية لاستكشاف الفرص والتواصل مع العملاء.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/register">
              <Button variant="primary" size="lg" className="gap-2">
                <span>إنشاء حساب مطور</span>
                <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="secondary" size="lg">
                <span>عرض خطط الأسعار</span>
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
