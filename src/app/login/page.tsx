'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PublicNavbar } from '@/components/PublicNavbar';
import { ShieldCheck, LogIn, KeyRound, UserCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'فشل تسجيل الدخول.');
      } else {
        if (data.user?.role === 'ADMIN') {
          router.push('/admin');
        } else {
          router.push('/dashboard');
        }
      }
    } catch {
      setError('تعذر الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  }

  function fillDemoDeveloper() {
    setEmail('dev@leadforge.eg');
    setPassword('Dev@12345');
    setError(null);
  }

  function fillDemoAdmin() {
    setEmail('admin@leadforge.eg');
    setPassword('Admin@12345');
    setError(null);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PublicNavbar />

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">تسجيل الدخول</h1>
              <p className="text-xs text-slate-500">مرحباً بعودتك إلى منصة LeadForge Egypt</p>
            </div>
          </div>

          {/* Quick Demo Credentials Box */}
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
            <p className="text-xs font-extrabold text-emerald-900">
              حسابات التجربة المحلية السريعة (Demo Accounts):
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={fillDemoDeveloper}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
              >
                <UserCheck className="h-3.5 w-3.5" />
                حساب مطور (Developer)
              </button>
              <button
                type="button"
                onClick={fillDemoAdmin}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100"
              >
                <KeyRound className="h-3.5 w-3.5" />
                حساب مدير (Admin)
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dev@leadforge.eg"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">كلمة المرور</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              <span>{loading ? 'جاري تسجيل الدخول...' : 'دخول إلى المنصة'}</span>
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-600">
            ليس لديك حساب بعد؟{' '}
            <Link href="/register" className="font-bold text-emerald-600 hover:underline">
              سجل كمطور ويب واحصل على 3 فرص مجانًا
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
