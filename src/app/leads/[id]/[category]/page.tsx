import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PublicNavbar, PublicFooter } from '@/components/domain/PublicNavbar';
import { prisma } from '@/lib/db';
import { resolveProgrammaticParams } from '@/lib/programmatic';
import {
  MapPin,
  Building2,
  CheckCircle2,
  Star,
  ExternalLink,
  ShieldCheck,
  Flame,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface ProgrammaticPageProps {
  params: {
    id?: string;
    city?: string;
    category: string;
  };
}

function maskBusinessName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) {
    return name.slice(0, 3) + '••••';
  }
  return parts[0] + ' ' + '••••••••';
}

export async function generateMetadata({ params }: ProgrammaticPageProps): Promise<Metadata> {
  const cityParam = params.city || params.id || '';
  const { city, category } = resolveProgrammaticParams(cityParam, params.category);
  if (!city || !category) {
    return { robots: { index: false, follow: false } };
  }

  const locale = await getLocale();
  const isAr = locale !== 'en';
  const baseUrl = 'https://leads4dev.com';

  const leadCount = await prisma.lead.count({
    where: {
      isCanonical: true,
      status: 'AVAILABLE',
      city: { in: city.dbValues },
      category: { in: category.dbValues },
    },
  });

  // Threshold >= 5 to prevent thin content indexing
  if (leadCount < 5) {
    return {
      title: `${category.nameAr} - ${city.nameAr} | Leads4dev`,
      robots: { index: false, follow: false },
    };
  }

  const cityName = isAr ? city.nameAr : city.nameEn;
  const catName = isAr ? category.nameAr : category.nameEn;

  const title = isAr
    ? `فرص عملاء ${catName} في ${cityName} | Leads4dev`
    : `${catName} Leads in ${cityName} | Leads4dev`;

  const description = isAr
    ? `استكشف ${leadCount} فرصة نشاط تجاري مؤهل في قطاع ${catName} بمدينة ${cityName} مع تقييم هندسي للاحتياج لموقع إلكتروني وحلول رقمية.`
    : `Discover ${leadCount} qualified business leads in ${catName} across ${cityName} with deterministic scoring for web development opportunities.`;

  const canonicalUrl = `${baseUrl}/leads/${city.slug}/${category.slug}${locale === 'en' ? '?locale=en' : ''}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ar-EG': `${baseUrl}/leads/${city.slug}/${category.slug}`,
        'en': `${baseUrl}/leads/${city.slug}/${category.slug}?locale=en`,
        'x-default': `${baseUrl}/leads/${city.slug}/${category.slug}`,
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Leads4dev',
      locale: locale === 'en' ? 'en_US' : 'ar_EG',
      alternateLocale: [locale === 'en' ? 'ar_EG' : 'en_US'],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function ProgrammaticLeadsPage({ params }: ProgrammaticPageProps) {
  const cityParam = params.city || params.id || '';
  const { city, category } = resolveProgrammaticParams(cityParam, params.category);
  if (!city || !category) {
    notFound();
  }

  const locale = await getLocale();
  const isAr = locale !== 'en';

  const leads = await prisma.lead.findMany({
    where: {
      isCanonical: true,
      status: 'AVAILABLE',
      city: { in: city.dbValues },
      category: { in: category.dbValues },
    },
    orderBy: { score: 'desc' },
    take: 20,
  });

  // Enforce threshold: 404 if fewer than 5 leads to prevent thin SEO content
  if (leads.length < 5) {
    notFound();
  }

  const cityName = isAr ? city.nameAr : city.nameEn;
  const catName = isAr ? category.nameAr : category.nameEn;
  const baseUrl = 'https://leads4dev.com';
  const canonicalUrl = `${baseUrl}/leads/${city.slug}/${category.slug}${locale === 'en' ? '?locale=en' : ''}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: isAr ? `فرص ${catName} في ${cityName}` : `${catName} Leads in ${cityName}`,
    description: isAr
      ? `قائمة بالفرص والأنشطة التجارية في قطاع ${catName} بمدينة ${cityName}`
      : `Directory of qualified web development leads in ${catName}, ${cityName}`,
    url: canonicalUrl,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: leads.length,
      itemListElement: leads.map((l, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: maskBusinessName(l.businessName),
      })),
    },
  };

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicNavbar />

      <main className="flex-1 py-12">
        <div className="mx-auto max-w-public px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <nav className="mb-6 flex items-center gap-2 text-caption text-fg-muted">
            <Link href="/" className="hover:text-fg-primary">
              {isAr ? 'الرئيسية' : 'Home'}
            </Link>
            <span>/</span>
            <Link href="/leads" className="hover:text-fg-primary">
              {isAr ? 'الفرص' : 'Leads'}
            </Link>
            <span>/</span>
            <span className="text-fg-secondary font-medium">{cityName}</span>
            <span>/</span>
            <span className="text-fg-brand font-semibold">{catName}</span>
          </nav>

          {/* Header */}
          <header className="pb-8 border-b border-line flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-caption font-semibold bg-brand-soft text-fg-brand">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{cityName}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-caption font-semibold bg-subtle text-fg-secondary">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{catName}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-caption font-semibold bg-surface border border-line text-fg-primary">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-accent" />
                  <span>{isAr ? 'بيانات مفحوصة قطعية' : 'Deterministically Verified'}</span>
                </span>
              </div>

              <h1 className="text-display font-bold text-fg-primary">
                {isAr ? `فرص ${catName} في ${cityName}` : `${catName} Leads in ${cityName}`}
              </h1>

              <p className="text-body-lg text-fg-secondary max-w-2xl">
                {isAr
                  ? `استكشف الأنشطة التجارية المسجلة في ${cityName} والمؤهلة هندسياً لتطوير مواقع وتطبيقات ويب.`
                  : `Browse qualified businesses in ${cityName} vetted for website development and digital solutions.`}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-line bg-surface shadow-xs flex flex-col items-center justify-center shrink-0 min-w-40">
              <span className="text-caption text-fg-muted">
                {isAr ? 'إجمالي الفرص المؤهلة' : 'Verified Leads'}
              </span>
              <span className="ltr-iso text-display font-bold text-fg-brand tabular-nums">
                {leads.length}
              </span>
              <span className="text-caption text-fg-secondary">
                {isAr ? 'فرصة نشطة' : 'Active opportunities'}
              </span>
            </div>
          </header>

          {/* Masked Leads Grid */}
          <section className="py-10">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-h3 font-semibold text-fg-primary">
                {isAr ? 'الفرص المتاحة للمطورين' : 'Available Leads for Developers'}
              </h2>
              <span className="text-caption text-fg-muted">
                {isAr
                  ? 'يتم إخفاء بيانات التواصل والاسم الكامل لحماية خصوصية الأنشطة'
                  : 'Contact details and full names are masked for privacy'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {leads.map((lead) => {
                const maskedName = maskBusinessName(lead.businessName);
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
                    className="rounded-xl border border-line bg-surface p-6 shadow-xs flex flex-col justify-between hover:border-line-strong transition-all"
                  >
                    <div className="flex flex-col gap-4">
                      {/* Top Row: Score & Temperature */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-caption font-semibold ${tempClass}`}>
                            <Flame className="w-3.5 h-3.5" />
                            <span>{tempTier}</span>
                          </span>
                          <span className="text-caption text-fg-muted">
                            {lead.qualityScore || 85}% {isAr ? 'جودة' : 'Quality'}
                          </span>
                        </div>

                        <div className="flex items-baseline gap-1">
                          <span className="text-caption text-fg-muted">{isAr ? 'الفرصة' : 'Score'}</span>
                          <span className="ltr-iso text-h4 font-bold text-fg-brand tabular-nums">
                            {lead.score}
                          </span>
                        </div>
                      </div>

                      {/* Business Masked Name & Location */}
                      <div>
                        <h3 className="text-h4 font-bold text-fg-primary">
                          {maskedName}
                        </h3>
                        <div className="flex items-center gap-1.5 text-caption text-fg-secondary mt-1">
                          <MapPin className="w-3.5 h-3.5 text-fg-muted" />
                          <span>{lead.city}</span>
                          {lead.area && <span>• {lead.area}</span>}
                        </div>
                      </div>

                      {/* Website Status & Reviews */}
                      <div className="flex flex-col gap-2 pt-3 border-t border-line text-caption">
                        <div className="flex items-center justify-between">
                          <span className="text-fg-muted">{isAr ? 'حالة الموقع:' : 'Website:'}</span>
                          <span className="font-medium text-fg-primary">
                            {lead.websiteStatus === 'NO_WEBSITE'
                              ? isAr ? 'لا يوجد موقع (أولوية قصوى)' : 'No Website (Top Need)'
                              : lead.websiteStatus === 'POOR_WEBSITE'
                              ? isAr ? 'موقع ضعيف بحاجة لتطوير' : 'Needs Redesign'
                              : isAr ? 'موقع نشط' : 'Has Website'}
                          </span>
                        </div>

                        {lead.rating && lead.rating > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-fg-muted">{isAr ? 'تقييم جوجل:' : 'Google Rating:'}</span>
                            <div className="flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 text-warning-icon fill-current" />
                              <span className="ltr-iso font-semibold text-fg-primary tabular-nums">
                                {lead.rating.toFixed(1)}
                              </span>
                              <span className="text-fg-muted tabular-nums">
                                ({lead.reviewCount})
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-fg-muted">{isAr ? 'الميزانية المتوقعة:' : 'Est. Budget:'}</span>
                          <span className="ltr-iso font-semibold text-fg-primary tabular-nums">
                            {lead.estimatedBudget.toLocaleString('en-US')} EGP
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-6 mt-6 border-t border-line flex items-center justify-between">
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
          </section>

          {/* Registration CTA */}
          <div className="mt-12 p-8 rounded-xl border border-line bg-surface shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col gap-2 text-center md:text-start">
              <div className="flex items-center justify-center md:justify-start gap-2 text-fg-brand font-semibold text-caption">
                <TrendingUp className="w-4 h-4" />
                <span>{isAr ? 'فرص تطوير أعمال مؤكدة لمطوري مصر' : 'High-Intent Developer Pipeline'}</span>
              </div>
              <h2 className="text-h2 font-bold text-fg-primary">
                {isAr
                  ? 'سجل مجاناً وتواصل مباشرة مع أصحاب القرار'
                  : 'Register Free to Unlock Verified Decision-Maker Contacts'}
              </h2>
              <p className="text-body text-fg-secondary max-w-xl">
                {isAr
                  ? 'احصل على نقاط ترحيبية مجانية فور التسجيل للوصول لأرقام الهواتف، تقارير الفحص الفني، ونقاط الحديث المقترحة.'
                  : 'Get free starter credits upon registration to access direct phone numbers, full audits, and outreach talk tracks.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
              <Link
                href="/register"
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-body-sm font-semibold bg-brand text-fg-on-brand hover:bg-brand-hover transition-colors shadow-xs"
              >
                {isAr ? 'إنشاء حساب مجاني' : 'Create Free Account'}
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center px-5 py-3 rounded-lg text-body-sm font-semibold border border-line bg-surface text-fg-primary hover:bg-subtle transition-colors"
              >
                {isAr ? 'الأسعار والباقات' : 'View Pricing'}
              </Link>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
