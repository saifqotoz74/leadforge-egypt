'use client';

import React from 'react';
import Link from 'next/link';
import { PublicNavbar, PublicFooter } from '@/components/domain';
import { BrandWordmark } from '@/components/ui/BrandWordmark';
import { Mail, ArrowLeft, ShieldCheck, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ForgotPasswordPage() {
  const tAuth = useTranslations('auth');

  return (
    <div data-density="comfortable" className="min-h-screen flex flex-col bg-page">
      <PublicNavbar />

      <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-auth rounded-xl border border-line bg-surface p-8 shadow-xs text-start">
          {/* Wordmark Block */}
          <div className="flex flex-col items-center text-center gap-3 mb-6">
            <BrandWordmark size="xl" href="/" />
            <h1 className="text-h2 font-bold text-fg-primary">
              {tAuth('forgotPasswordTitle')}
            </h1>
            <p className="text-body-sm text-fg-secondary">
              {tAuth('forgotPasswordSubtitle')}
            </p>
          </div>

          {/* Security & Verification Explanation */}
          <div className="mb-6 rounded-xl border border-line bg-subtle p-4 space-y-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-brand shrink-0 mt-0.5" />
              <p className="text-body-sm text-fg-secondary leading-relaxed">
                {tAuth('forgotPasswordNotice')}
              </p>
            </div>
          </div>

          {/* Contact Support Direct Action */}
          <div className="mb-6 rounded-xl border border-line-strong bg-surface p-4 space-y-3">
            <p className="text-body-sm font-medium text-fg-primary">
              {tAuth('forgotPasswordInstructions')}
            </p>
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-subtle border border-line">
              <div className="flex items-center gap-2.5 min-w-0">
                <Mail className="h-4 w-4 text-brand shrink-0" />
                <span className="text-body-sm font-semibold text-fg-primary ltr-iso select-all" dir="ltr">
                  support@leadforge.eg
                </span>
              </div>
              <a
                href="mailto:support@leadforge.eg?subject=Leads4dev%20Password%20Reset%20Request"
                className="text-caption font-semibold text-brand hover:underline shrink-0"
              >
                <span className="sr-only">{tAuth('forgotPasswordEmailLabel')}</span>
                mailto
              </a>
            </div>
            <div className="flex items-center gap-2 text-caption text-fg-muted">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{tAuth('forgotPasswordEta')}</span>
            </div>
          </div>

          {/* Navigation Action */}
          <div className="pt-2">
            <Link
              href="/login"
              className="w-full h-12 px-6 rounded-md bg-brand text-fg-on-brand hover:bg-brand-hover active:bg-brand-pressed shadow-xs inline-flex items-center justify-center font-medium gap-2 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
              <span>{tAuth('backToLogin')}</span>
            </Link>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
