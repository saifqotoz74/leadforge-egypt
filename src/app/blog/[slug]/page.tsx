import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PublicNavbar, PublicFooter } from '@/components/domain/PublicNavbar';
import { ArticleContent } from '@/components/domain/ArticleContent';
import { BLOG_POSTS } from '@/data/blog-posts';
import { ArrowLeft, Clock, Calendar, User, CheckCircle2 } from 'lucide-react';

import { SITE_URL } from '@/lib/site-config';

interface BlogPostPageProps {
  params: {
    slug: string;
  };
}

export async function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const post = BLOG_POSTS.find((p) => p.slug === params.slug);
  if (!post) return {};

  const locale = await getLocale();
  const isAr = locale !== 'en';

  const title = isAr ? post.titleAr : post.titleEn;
  const description = isAr ? post.excerptAr : post.excerptEn;
  const canonicalUrl = `${SITE_URL}/blog/${post.slug}${locale === 'en' ? '?locale=en' : ''}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ar-EG': `${SITE_URL}/blog/${post.slug}`,
        'en': `${SITE_URL}/blog/${post.slug}?locale=en`,
        'x-default': `${SITE_URL}/blog/${post.slug}`,
      },
    },
    openGraph: {
      title: `${title} | Leads4dev`,
      description,
      url: canonicalUrl,
      siteName: 'Leads4dev',
      locale: locale === 'en' ? 'en_US' : 'ar_EG',
      alternateLocale: [locale === 'en' ? 'ar_EG' : 'en_US'],
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.publishedAt,
      authors: [post.author.name],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Leads4dev`,
      description,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = BLOG_POSTS.find((p) => p.slug === params.slug);
  if (!post) {
    notFound();
  }

  const t = await getTranslations('blog');
  const locale = await getLocale();
  const isAr = locale !== 'en';

  const title = isAr ? post.titleAr : post.titleEn;
  const content = isAr ? post.contentAr : post.contentEn;
  const category = isAr ? post.categoryAr : post.categoryEn;
  const canonicalUrl = `${SITE_URL}/blog/${post.slug}${locale === 'en' ? '?locale=en' : ''}`;

  const formattedDate = new Date(post.publishedAt).toLocaleDateString(
    isAr ? 'ar-EG-u-nu-latn' : 'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: isAr ? post.excerptAr : post.excerptEn,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: {
      '@type': 'Person',
      name: post.author.name,
      jobTitle: post.author.role,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Leads4dev',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
    },
    image: `${SITE_URL}/logo.png`,
    inLanguage: isAr ? 'ar-EG' : 'en',
    mainEntityOfPage: canonicalUrl,
  };

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicNavbar />

      <main className="flex-1 py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {/* Back button */}
          <div className="mb-8">
            <Link
              href={isAr ? '/blog' : '/blog?locale=en'}
              className="inline-flex items-center gap-1.5 text-body-sm font-medium text-fg-secondary hover:text-fg-primary transition-colors"
            >
              <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" />
              <span>{t('backToBlog')}</span>
            </Link>
          </div>

          {/* Article Header */}
          <header className="pb-8 border-b border-line flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded text-caption font-semibold bg-brand-soft text-fg-brand">
                {category}
              </span>
            </div>

            <h1 className="text-display font-bold text-fg-primary leading-tight">
              {title}
            </h1>

            <div className="flex flex-wrap items-center gap-6 pt-2 text-caption text-fg-secondary">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-fg-muted" />
                <span className="font-medium text-fg-primary">{post.author.name}</span>
                <span className="text-fg-muted">({post.author.role})</span>
              </div>

              <div className="flex items-center gap-1.5 text-fg-muted">
                <Calendar className="w-4 h-4" />
                <span className="tabular-nums">{formattedDate}</span>
              </div>

              <div className="flex items-center gap-1.5 text-fg-muted">
                <Clock className="w-4 h-4" />
                <span className="tabular-nums">
                  {t('readingTime', { min: post.readingTimeMin })}
                </span>
              </div>
            </div>
          </header>

          {/* Article Content */}
          <article className="py-8">
            <ArticleContent content={content} />
          </article>

          {/* LeadForge CTA Banner */}
          <div className="mt-8 p-6 rounded-xl border border-line bg-surface shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-fg-primary font-semibold text-body">
                <CheckCircle2 className="w-5 h-5 text-fg-brand shrink-0" />
                <span>
                  {isAr
                    ? 'هل تبحث عن فرص مفحوصة ومؤهلة لتطوير المواقع في مصر؟'
                    : 'Looking for verified web development leads in Egypt?'}
                </span>
              </div>
              <p className="text-body-sm text-fg-secondary">
                {isAr
                  ? 'سجل مجاناً واستكشف أنشطة تجارية بميزانيات تقديرية واحتياج فعلي لمواقع إلكترونية.'
                  : 'Register free to discover high-intent businesses with estimated budgets ready for professional web solutions.'}
              </p>
            </div>

            <Link
              href="/register"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-body-sm font-semibold bg-brand text-fg-on-brand hover:bg-brand-hover transition-colors shrink-0"
            >
              {isAr ? 'ابدأ مجاناً الآن' : 'Get Started Free'}
            </Link>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
