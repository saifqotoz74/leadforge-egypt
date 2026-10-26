'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PublicNavbar, PublicFooter } from '@/components/domain';
import { BrandWordmark } from '@/components/ui/BrandWordmark';
import { Lock, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <div className="p-4 rounded-xl border border-danger-border bg-danger-bg text-danger-text text-body-sm space-y-2">
          <AlertCircle className="h-8 w-8 text-danger-text mx-auto" />
          <h2 className="font-bold text-body">رابط الاستعادة غير صالح</h2>
          <p>لم يتم توفير رمز الاستعادة أو الرابط غير مكتمل. يرجى طلب رابط جديد.</p>
        </div>
        <Link
          href="/forgot-password"
          className="w-full h-11 px-6 rounded-md bg-brand text-fg-on-brand hover:bg-brand-hover inline-flex items-center justify-center font-medium gap-2 transition-colors"
        >
          <span>طلب رابط استعادة جديد</span>
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('يجب ألا تقل كلمة المرور عن 8 أحرف.');
      return;
    }

    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } else {
        setError(data.error || 'تعذر تغيير كلمة المرور.');
      }
    } catch {
      setError('حدث خطأ في الاتصال أثناء تغيير كلمة المرور.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {success ? (
        <div className="space-y-4 text-center">
          <div className="rounded-xl border border-line bg-brand-soft p-5 space-y-2">
            <CheckCircle2 className="h-10 w-10 text-brand mx-auto mb-2" />
            <h2 className="text-body font-bold text-fg-primary">
              تم تغيير كلمة المرور بنجاح!
            </h2>
            <p className="text-body-sm text-fg-secondary">
              تم تعيين كلمة المرور الجديدة وتأمين حسابك. جاري تحويلك إلى صفحة تسجيل الدخول...
            </p>
          </div>
          <Link
            href="/login"
            className="w-full h-11 px-6 rounded-md bg-brand text-fg-on-brand hover:bg-brand-hover inline-flex items-center justify-center font-medium gap-2 transition-colors"
          >
            <span>الانتقال لتسجيل الدخول الآن</span>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-danger-bg border border-danger-border text-danger-text text-body-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="pass" className="block text-body-sm font-medium text-fg-primary">
              كلمة المرور الجديدة
            </label>
            <div className="relative">
              <input
                id="pass"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8 أحرف على الأقل تحتوي على أرقام وحروف"
                dir="ltr"
                className="w-full h-11 ps-10 pe-3 rounded-md border border-line bg-surface text-fg-primary placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand text-body-sm"
              />
              <Lock className="absolute start-3 top-3 h-5 w-5 text-fg-muted pointer-events-none" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm" className="block text-body-sm font-medium text-fg-primary">
              تأكيد كلمة المرور الجديدة
            </label>
            <div className="relative">
              <input
                id="confirm"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="أعد كتابة كلمة المرور"
                dir="ltr"
                className="w-full h-11 ps-10 pe-3 rounded-md border border-line bg-surface text-fg-primary placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand text-body-sm"
              />
              <Lock className="absolute start-3 top-3 h-5 w-5 text-fg-muted pointer-events-none" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 px-6 rounded-md bg-brand text-fg-on-brand hover:bg-brand-hover active:bg-brand-pressed shadow-xs inline-flex items-center justify-center font-medium gap-2 transition-colors disabled:opacity-60"
          >
            {loading ? 'جاري الحفظ...' : 'تعيين كلمة المرور الجديدة'}
          </button>

          <div className="pt-2 text-center">
            <Link
              href="/login"
              className="text-body-sm text-brand hover:underline inline-flex items-center gap-1.5 font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0 rtl:-scale-x-100" />
              <span>العودة لتسجيل الدخول</span>
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div data-density="comfortable" className="min-h-screen flex flex-col bg-page">
      <PublicNavbar />

      <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-auth rounded-xl border border-line bg-surface p-8 shadow-xs text-start">
          <div className="flex flex-col items-center text-center gap-3 mb-6">
            <BrandWordmark size="xl" href="/" />
            <h1 className="text-h2 font-bold text-fg-primary">تعيين كلمة المرور الجديدة</h1>
            <p className="text-body-sm text-fg-secondary">
              أدخل كلمة المرور الجديدة الخاصة بحسابك
            </p>
          </div>

          <Suspense fallback={<div className="text-center py-6 text-fg-muted">جاري التحميل...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
