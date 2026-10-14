'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PublicNavbar, PublicFooter } from '@/components/domain';
import { BrandWordmark } from '@/components/ui/BrandWordmark';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ForgotPasswordPage() {
  const tAuth = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !email.includes('@')) {
      setError('يرجى إدخال بريد إلكتروني صالح.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'تعذر إرسال رابط الاستعادة حالياً.');
      }
    } catch {
      setError('حدث خطأ في الاتصال. يرجى المحاولة لاحقاً.');
    } finally {
      setLoading(false);
    }
  };

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

          {success ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-brand-soft/40 p-5 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-brand mx-auto mb-2" />
                <h2 className="text-body-md font-bold text-fg-primary">
                  تم إرسال رابط الاستعادة
                </h2>
                <p className="text-body-sm text-fg-secondary leading-relaxed">
                  إذا كان البريد <span className="font-semibold text-fg-primary ltr-iso" dir="ltr">{email}</span> مسجلاً لدينا، فستتلقى رابطاً لإعادة تعيين كلمة المرور خلال دقائق.
                </p>
                <p className="text-caption text-fg-muted mt-2">
                  الرابط صالح لمدة <strong>30 دقيقة</strong> فقط. يرجى التحقق من صندوق الوارد ومجلد الرسائل غير المرغوب فيها (Spam).
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/login"
                  className="w-full h-11 px-6 rounded-md bg-brand text-fg-on-brand hover:bg-brand-hover active:bg-brand-pressed shadow-xs inline-flex items-center justify-center font-medium gap-2 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
                  <span>{tAuth('backToLogin')}</span>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-danger-bg border border-danger-line text-danger-text text-body-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-body-sm font-medium text-fg-primary">
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    dir="ltr"
                    className="w-full h-11 ps-10 pe-3 rounded-md border border-line bg-surface text-fg-primary placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand font-mono text-body-sm"
                  />
                  <Mail className="absolute start-3 top-3 h-5 w-5 text-fg-muted pointer-events-none" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 px-6 rounded-md bg-brand text-fg-on-brand hover:bg-brand-hover active:bg-brand-pressed shadow-xs inline-flex items-center justify-center font-medium gap-2 transition-colors disabled:opacity-60"
              >
                {loading ? 'جاري الإرسال...' : 'إرسال رابط استعادة كلمة المرور'}
              </button>

              <div className="pt-2 text-center">
                <Link
                  href="/login"
                  className="text-body-sm text-brand hover:underline inline-flex items-center gap-1.5 font-medium"
                >
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0 rtl:-scale-x-100" />
                  <span>{tAuth('backToLogin')}</span>
                </Link>
              </div>
            </form>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
