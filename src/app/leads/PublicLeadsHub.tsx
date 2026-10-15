import React from 'react';
import Link from 'next/link';
import { PublicNavbar, PublicFooter } from '@/components/domain/PublicNavbar';
import { StatsStrip } from '@/components/domain/StatsStrip';
import { PlatformStats } from '@/lib/stats';
import { LeadItem } from './LeadDiscoveryClient';
import {
  Compass,
  MapPin,
  Building2,
  ShieldCheck,
  TrendingUp,
  ArrowRight,
  Flame,
  Star,
  CheckCircle2,
} from 'lucide-react';

export interface DirectoryCategoryItem {
  citySlug: string;
  cityNameAr: string;
  cityNameEn: string;
  categorySlug: string;
  categoryNameAr: string;
  categoryNameEn: string;
  leadCount: number;
}

export interface PublicLeadsHubProps {
  stats: PlatformStats;
  directoryItems: DirectoryCategoryItem[];
  sampleLeads: LeadItem[];
  locale: string;
}

export const PublicLeadsHub: React.FC<PublicLeadsHubProps> = ({
  stats,
  directoryItems,
  sampleLeads,
  locale,
}) => {
  const isAr = locale !== 'en';

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hub Hero Header */}
        <header className="border-b border-line bg-surface py-12 lg:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-soft text-fg-brand text-caption font-semibold mb-4">
                  <Compass className="w-4 h-4 shrink-0 text-brand-accent" />
                  <span>
                    {isAr
                      ? 'دليل الفرص المؤهلة لمطوري المواقع في مصر'
                      : 'Verified B2B Web Development Directory in Egypt'}
                  </span>
                </div>

                <h1 className="text-display font-bold text-fg-primary leading-tight">
                  {isAr
                    ? 'دليل فرص الأنشطة التجارية لمطوري ومصممي الويب'
                    : 'Directory of Qualified Business Leads for Web Developers'}
                </h1>

                <p className="mt-4 text-body-lg text-fg-secondary leading-relaxed">
                  {isAr
                    ? 'تصفح فرصاً بيعية حقيقية تم فحصها هندسياً واستبعاد التكرارات منها. اختر مدينتك أو قطاعك المستهدف للوصول إلى أنشطة تجارية تحتاج فعلياً إلى تطوير مواقع وحلول رقمية.'
                    : 'Browse real, deterministically verified business leads with duplicates purged. Select your target city and sector to discover businesses with verified website needs.'}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                <Link
                  href="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-lg text-body-sm font-semibold bg-brand text-fg-on-brand hover:bg-brand-hover transition-colors shadow-xs"
                >
                  {isAr ? 'إنشاء حساب مجاني' : 'Create Free Account'}
                </Link>
                <Link
                  href="/pricing"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-lg text-body-sm font-semibold border border-line bg-surface text-fg-primary hover:bg-subtle transition-colors"
                >
                  {isAr ? 'استعراض الباقات' : 'View Pricing Plans'}
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* Real Live Stats Strip */}
        <StatsStrip stats={stats} />

        {/* Indexable City & Sector Hub Grid */}
        <section className="py-12 border-b border-line bg-subtle">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-h2 font-bold text-fg-primary">
                  {isAr ? 'القطاعات والمدن الرئيسية الأكثر طلباً' : 'Top Verified Sectors & Cities'}
                </h2>
                <p className="mt-1 text-body-sm text-fg-secondary">
                  {isAr
                    ? 'صفحات متخصصة تستوفي شروط الجودة وكثافة الفرص المفحوصة'
                    : 'Specialized landing pages meeting strict quality and lead density criteria'}
                </p>
              </div>

              <span className="text-caption font-medium text-fg-muted">
                {isAr
                  ? `(${directoryItems.length} قطاعات مستوفية لشروط النشر)`
                  : `(${directoryItems.length} published directories)`}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {directoryItems.map((item) => {
                const cityName = isAr ? item.cityNameAr : item.cityNameEn;
                const catName = isAr ? item.categoryNameAr : item.categoryNameEn;
                const href = isAr
                  ? `/leads/${item.citySlug}/${item.categorySlug}`
                  : `/leads/${item.citySlug}/${item.categorySlug}?locale=en`;

                return (
                  <Link
                    key={`${item.citySlug}-${item.categorySlug}`}
                    href={href}
                    className="p-6 rounded-xl border border-line bg-surface shadow-xs hover:border-line-strong hover:shadow-sm transition-all flex flex-col justify-between group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex items-center gap-1 text-caption text-fg-muted">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{cityName}</span>
                          </span>
                          <span className="text-fg-muted">•</span>
                          <span className="inline-flex items-center gap-1 text-caption text-fg-muted">
                            <Building2 className="w-3.5 h-3.5" />
                            <span>{catName}</span>
                          </span>
                        </div>
                        <h3 className="text-h3 font-bold text-fg-primary group-hover:text-fg-brand transition-colors">
                          {isAr ? `فرص ${catName} في ${cityName}` : `${catName} in ${cityName}`}
                        </h3>
                      </div>

                      <div className="shrink-0 p-2.5 rounded-lg bg-brand-soft text-fg-brand">
                        <ArrowRight className="w-4 h-4 rtl:-scale-x-100" />
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-line flex items-center justify-between text-caption">
                      <span className="text-fg-secondary">
                        {isAr ? 'إجمالي الفرص المفحوصة:' : 'Verified Leads:'}
                      </span>
                      <span className="ltr-iso font-bold text-fg-brand tabular-nums text-body-sm">
                        {item.leadCount} {isAr ? 'فرصة' : 'leads'}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Sample Leads Preview Section */}
        <section className="py-12 bg-surface">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-h2 font-bold text-fg-primary">
                  {isAr ? 'معاينة أحدث الفرص المطروحة' : 'Latest Verified Lead Previews'}
                </h2>
                <p className="mt-1 text-body-sm text-fg-secondary">
                  {isAr
                    ? 'بيانات تواصل وأسماء منشآت مشفرة لحماية خصوصية الأنشطة حتى الشراء'
                    : 'Masked contact and business names to preserve privacy until unlocked'}
                </p>
              </div>

              <Link
                href="/register"
                className="inline-flex items-center gap-1 text-body-sm font-semibold text-fg-brand hover:underline"
              >
                <span>{isAr ? 'سجل لفتح كل التفاصيل' : 'Register to unlock all'}</span>
                <ArrowRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sampleLeads.map((lead) => {
                const tempTier = lead.temperature || 'HOT';
                const tempClass =
                  tempTier === 'HOT'
                    ? 'bg-tier-hot-bg text-tier-hot-fg border border-line'
                    : tempTier === 'WARM'
                    ? 'bg-tier-warm-bg text-tier-warm-fg border border-line'
                    : 'bg-tier-cold-bg text-tier-cold-fg border border-line';

                return (
                  <div
                    key={lead.id}
                    className="p-6 rounded-xl border border-line bg-surface shadow-xs flex flex-col justify-between hover:border-line-strong transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-caption font-semibold ${tempClass}`}>
                          <Flame className="w-3.5 h-3.5" />
                          <span>{tempTier}</span>
                        </span>

                        <span className="text-caption font-semibold text-fg-brand">
                          {isAr ? `فرصة: ${lead.score}` : `Score: ${lead.score}`}
                        </span>
                      </div>

                      <h3 className="text-h4 font-bold text-fg-primary mb-1">
                        {lead.businessName}
                      </h3>

                      <div className="flex items-center gap-2 text-caption text-fg-muted mb-4">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{lead.city}</span>
                        {lead.area && <span>• {lead.area}</span>}
                      </div>

                      <div className="flex flex-col gap-2 pt-3 border-t border-line text-caption text-fg-secondary">
                        <div className="flex items-center justify-between">
                          <span className="text-fg-muted">
                            {isAr ? 'الموقع الإلكتروني:' : 'Website:'}
                          </span>
                          <span className="font-medium text-fg-primary">
                            {lead.websiteStatus === 'NO_WEBSITE'
                              ? isAr ? 'لا يوجد موقع' : 'No Website'
                              : isAr ? 'موقع قديم / ضعيف' : 'Needs Redesign'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-fg-muted">
                            {isAr ? 'الميزانية التقديرية:' : 'Est. Budget:'}
                          </span>
                          <span className="ltr-iso font-semibold text-fg-primary tabular-nums">
                            {lead.estimatedBudget.toLocaleString('en-US')} EGP
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 mt-6 border-t border-line flex items-center justify-between">
                      <span className="text-caption text-fg-muted">
                        {lead.phone ? (isAr ? 'هاتف مباشر موثق' : 'Direct Phone') : (isAr ? 'فرصة زيارة ميدانية' : 'Field Visit')}
                      </span>

                      <Link
                        href={`/leads/${lead.id}`}
                        className="inline-flex items-center gap-1 text-body-sm font-semibold text-fg-brand hover:underline"
                      >
                        <span>{isAr ? 'عرض التفاصيل' : 'View Details'}</span>
                        <ArrowRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Final Registration & Value Prop CTA */}
        <section className="py-16 bg-subtle border-t border-line">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center justify-center p-3 rounded-full bg-brand-soft text-fg-brand mb-4">
              <TrendingUp className="w-6 h-6 text-brand-accent" />
            </div>

            <h2 className="text-display font-bold text-fg-primary">
              {isAr
                ? 'جاهز للبدء في اقتناص الفرص البيعية الحقيقية؟'
                : 'Ready to Access Deterministically Qualified Web Leads?'}
            </h2>

            <p className="mt-4 text-body-lg text-fg-secondary max-w-2xl mx-auto leading-relaxed">
              {isAr
                ? 'سجل مجاناً بدون بطاقة ائتمان، واحصل على رصيد ترحيبي لتجربة المنصة وفحص أرقام الهواتف والتواصل مع أصحاب الأعمال مباشرة.'
                : 'Sign up free with no credit card required. Receive starter credits to test data quality, verify direct phone lines, and close web development deals.'}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 rounded-lg text-body font-semibold bg-brand text-fg-on-brand hover:bg-brand-hover transition-colors shadow-xs"
              >
                {isAr ? 'إنشاء حساب وتفعيل الرصيد' : 'Create Free Account'}
              </Link>
              <Link
                href="/pricing"
                className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 rounded-lg text-body font-semibold border border-line bg-surface text-fg-primary hover:bg-subtle transition-colors"
              >
                {isAr ? 'استعراض أسعار الباقات' : 'Explore Pricing'}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};
