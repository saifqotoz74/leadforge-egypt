'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { TESTIMONIALS_DATA, TestimonialItem } from '@/data/testimonials';

export interface TestimonialsProps {
  items?: TestimonialItem[];
  className?: string;
}

export function Testimonials({ items = TESTIMONIALS_DATA, className = '' }: TestimonialsProps) {
  const locale = useLocale();
  const tLanding = useTranslations('landing');

  // If empty (default state), do not fabricate any entries per Ground Rule 3
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section className={`border-b border-line bg-surface py-16 sm:py-20 ${className}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-h1 font-bold text-fg-primary">
            {tLanding('testimonialsTitle')}
          </h2>
          <p className="mt-3 text-body-lg text-fg-secondary">
            {tLanding('testimonialsSubtitle')}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-line bg-surface p-6 shadow-xs flex flex-col justify-between gap-4"
            >
              <p className="text-body text-fg-secondary leading-relaxed italic">
                &ldquo;{locale === 'en' ? item.quoteEn : item.quoteAr}&rdquo;
              </p>
              <div className="pt-4 border-t border-line flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-brand-soft text-brand flex items-center justify-center font-bold text-caption shrink-0">
                  {item.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-body-sm font-semibold text-fg-primary">{item.name}</h4>
                  <p className="text-caption text-fg-muted">
                    {item.role} {item.company ? `• ${item.company}` : ''}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
