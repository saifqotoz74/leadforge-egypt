import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { PublicNavbar, PublicFooter } from '@/components/domain/PublicNavbar';
import { BLOG_POSTS } from '@/data/blog-posts';
import { Clock, Calendar, ArrowRight, BookOpen } from 'lucide-react';

import { SITE_URL } from '@/lib/site-config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('blog');
  const locale = await getLocale();

  const title = t('metaTitle');
  const description = t('metaDescription');
  const canonicalUrl = `${SITE_URL}/blog${locale === 'en' ? '?locale=en' : ''}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ar-EG': `${SITE_URL}/blog`,
        'en': `${SITE_URL}/blog?locale=en`,
        'x-default': `${SITE_URL}/blog`,
      },
    },
    openGraph: {
      title: `${title} | Leads4dev`,
      description,
      url: canonicalUrl,
      siteName: 'Leads4dev',
      locale: locale === 'en' ? 'en_US' : 'ar_EG',
      alternateLocale: [locale === 'en' ? 'ar_EG' : 'en_US'],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Leads4dev`,
      description,
    },
  };
}

export default async function BlogIndexPage() {
  const t = await getTranslations('blog');
  const locale = await getLocale();
  const isAr = locale !== 'en';

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <PublicNavbar />

      <main className="flex-1 py-12">
        <div className="mx-auto max-w-public px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex flex-col gap-3 pb-8 border-b border-line">
            <div className="inline-flex items-center gap-2 text-caption font-semibold text-fg-brand">
              <BookOpen className="w-4 h-4 text-brand-accent" />
              <span>{t('eyebrow')}</span>
            </div>
            <h1 className="text-display font-bold text-fg-primary">
              {t('title')}
            </h1>
            <p className="text-body-lg text-fg-secondary max-w-2xl">
              {t('subtitle')}
            </p>
          </div>

          {/* Posts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
            {BLOG_POSTS.map((post) => {
              const title = isAr ? post.titleAr : post.titleEn;
              const excerpt = isAr ? post.excerptAr : post.excerptEn;
              const category = isAr ? post.categoryAr : post.categoryEn;
              const postUrl = isAr ? `/blog/${post.slug}` : `/blog/${post.slug}?locale=en`;
              const formattedDate = new Date(post.publishedAt).toLocaleDateString(
                isAr ? 'ar-EG-u-nu-latn' : 'en-US',
                { year: 'numeric', month: 'short', day: 'numeric' }
              );

              return (
                <article
                  key={post.slug}
                  className="rounded-xl border border-line bg-surface p-6 shadow-xs flex flex-col justify-between hover:border-line-strong transition-all"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-caption font-medium bg-brand-soft text-fg-brand">
                        {category}
                      </span>
                      <div className="flex items-center gap-1.5 text-caption text-fg-muted">
                        <Clock className="w-3.5 h-3.5 text-fg-muted" />
                        <span className="tabular-nums">
                          {t('readingTime', { min: post.readingTimeMin })}
                        </span>
                      </div>
                    </div>

                    <Link href={postUrl} className="group">
                      <h2 className="text-h4 font-bold text-fg-primary group-hover:text-fg-brand transition-colors">
                        {title}
                      </h2>
                    </Link>

                    <p className="text-body-sm text-fg-secondary leading-relaxed">
                      {excerpt}
                    </p>
                  </div>

                  <div className="pt-6 mt-6 border-t border-line flex items-center justify-between text-caption text-fg-muted">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-fg-muted" />
                      <span className="tabular-nums">{formattedDate}</span>
                    </div>

                    <Link
                      href={postUrl}
                      className="inline-flex items-center gap-1 font-semibold text-fg-brand hover:underline"
                    >
                      <span>{t('readMore')}</span>
                      <ArrowRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
