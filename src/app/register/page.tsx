'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PublicNavbar } from '@/components/PublicNavbar';
import {
  ALL_CITIES,
  BUSINESS_CATEGORIES,
  DEVELOPER_SERVICES,
} from '@/lib/constants';
import { UserPlus } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [services, setServices] = useState<string[]>(['Website Development']);
  const [locations, setLocations] = useState<string[]>(['القاهرة', 'الجيزة']);
  const [niches, setNiches] = useState<string[]>(['Dental', 'Medical', 'Restaurant']);
  const [leadPreferences, setLeadPreferences] = useState<string[]>([
    'NO_WEBSITE',
    'POOR_WEBSITE',
  ]);
  const [minBudget, setMinBudget] = useState<number>(6000);
  const [leadType, setLeadType] = useState<'BOTH' | 'EXCLUSIVE' | 'SHARED'>('BOTH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleArrayItem(arr: string[], item: string, setter: (v: string[]) => void) {
    if (arr.includes(item)) {
      if (arr.length > 1) setter(arr.filter((x) => x !== item));
    } else {
      setter([...arr, item]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          companyName,
          phone,
          services,
          locations,
          niches,
          leadPreferences,
          minBudget: Number(minBudget) || 5000,
          leadType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر إنشاء الحساب.');
      } else {
        router.push('/dashboard');
      }
    } catch {
      setError('حدث خطأ في الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PublicNavbar />

      <main className="mx-auto max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="border-b border-slate-100 pb-4">
            <h1 className="text-2xl font-extrabold text-slate-900">
              تسجيل حساب مطور / شركة برمجة جديدة
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              حدد تخصصك والمدن والأنشطة المستهدفة ليقوم محرك المطابقة (Matching Engine) بترشيح
              أفضل الفرص البيعية لك.
            </p>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            {/* Basic Account Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700">الاسم الكامل *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: م. محمد طارق"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  اسم الشركة أو الاستوديو (اختياري)
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="مثال: كود تيك لتطوير المواقع"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  البريد الإلكتروني *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="developer@example.com"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  كلمة المرور (6 أحرف على الأقل) *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                />
              </div>
            </div>

            {/* Services */}
            <div>
              <label className="block text-xs font-bold text-slate-800">
                1. الخدمات التي تقدمها (Services):
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {DEVELOPER_SERVICES.map((srv) => {
                  const selected = services.includes(srv.value);
                  return (
                    <button
                      type="button"
                      key={srv.value}
                      onClick={() => toggleArrayItem(services, srv.value, setServices)}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                        selected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {srv.labelAr}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Cities */}
            <div>
              <label className="block text-xs font-bold text-slate-800">
                2. المدن المستهدفة في مصر (Target Cities):
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALL_CITIES.map((city) => {
                  const selected = locations.includes(city);
                  return (
                    <button
                      type="button"
                      key={city}
                      onClick={() => toggleArrayItem(locations, city, setLocations)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                        selected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {city}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Niches */}
            <div>
              <label className="block text-xs font-bold text-slate-800">
                3. الأنشطة التجارية المستهدفة (Niches):
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {BUSINESS_CATEGORIES.map((cat) => {
                  const selected = niches.includes(cat.value);
                  return (
                    <button
                      type="button"
                      key={cat.value}
                      onClick={() => toggleArrayItem(niches, cat.value, setNiches)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                        selected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {cat.labelAr}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lead Type & Budget & Exclusivity */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  نوع العميل المفضل (Lead Need)
                </label>
                <select
                  value={
                    leadPreferences.length === 2
                      ? 'BOTH'
                      : leadPreferences[0] || 'NO_WEBSITE'
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'BOTH') setLeadPreferences(['NO_WEBSITE', 'POOR_WEBSITE']);
                    else setLeadPreferences([v]);
                  }}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold"
                >
                  <option value="BOTH">شركات بدون موقع أو بموقع قديم</option>
                  <option value="NO_WEBSITE">شركات بدون موقع إلكتروني فقط</option>
                  <option value="POOR_WEBSITE">شركات بموقع قديم/ضعيف فقط</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  الحد الأدنى للميزانية (ج.م)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={minBudget}
                  onChange={(e) => setMinBudget(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  ملكية الـ Lead المفضلة
                </label>
                <select
                  value={leadType}
                  onChange={(e) =>
                    setLeadType(e.target.value as 'BOTH' | 'EXCLUSIVE' | 'SHARED')
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold"
                >
                  <option value="BOTH">الفرص الحصرية والمشتركة معًا</option>
                  <option value="EXCLUSIVE">فرص حصرية فقط (Exclusive)</option>
                  <option value="SHARED">فرص مشتركة فقط (Shared)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              <span>{loading ? 'جاري إعداد حسابك...' : 'إنشاء الحساب والبدء بـ 3 فرص مجانية'}</span>
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-600">
            لديك حساب بالفعل؟{' '}
            <Link href="/login" className="font-bold text-emerald-600 hover:underline">
              تسجيل الدخول
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
