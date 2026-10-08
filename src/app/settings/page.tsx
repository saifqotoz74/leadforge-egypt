'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import {
  ALL_CITIES,
  BUSINESS_CATEGORIES,
  DEVELOPER_SERVICES,
} from '@/lib/constants';
import { Save, Target, Compass } from 'lucide-react';

export default function SettingsPage() {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [services, setServices] = useState<string[]>(['Website Development']);
  const [locations, setLocations] = useState<string[]>(['القاهرة', 'الجيزة']);
  const [allLocationsMode, setAllLocationsMode] = useState(false);
  const [niches, setNiches] = useState<string[]>(['Dental', 'Medical', 'Restaurant']);
  const [excludedNiches, setExcludedNiches] = useState<string[]>([]);
  const [allNichesMode, setAllNichesMode] = useState(false);
  const [leadPreferences, setLeadPreferences] = useState<string[]>([
    'NO_WEBSITE',
    'POOR_WEBSITE',
  ]);
  const [minBudget, setMinBudget] = useState<number>(5000);
  const [maxBudget, setMaxBudget] = useState<number>(60000);
  const [leadType, setLeadType] = useState<'BOTH' | 'EXCLUSIVE' | 'SHARED'>('BOTH');
  const [isAcceptingLeads, setIsAcceptingLeads] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch('/api/developer/profile');
        if (res.ok) {
          const data = await res.json();
          setName(data.user?.name || '');
          const p = data.profile;
          if (p) {
            setCompanyName(p.companyName || '');
            setPhone(p.phone || '');
            setBio(p.bio || '');
            setServices(p.services || ['Website Development']);
            setLocations(p.locations || ['القاهرة']);
            setAllLocationsMode(Boolean(p.allLocationsMode));
            setNiches(p.niches || ['Dental']);
            setExcludedNiches(p.excludedNiches || []);
            setAllNichesMode(Boolean(p.allNichesMode));
            setLeadPreferences(p.leadPreferences || ['NO_WEBSITE', 'POOR_WEBSITE']);
            setMinBudget(p.minBudget ?? 5000);
            setMaxBudget(p.maxBudget ?? 60000);
            setLeadType((p.leadType as 'BOTH' | 'EXCLUSIVE' | 'SHARED') || 'BOTH');
            setIsAcceptingLeads(p.isAcceptingLeads !== false);
          }
        }
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  function toggleItem(arr: string[], item: string, setter: (v: string[]) => void, allowEmpty = false) {
    if (arr.includes(item)) {
      if (allowEmpty || arr.length > 1) setter(arr.filter((x) => x !== item));
    } else {
      setter([...arr, item]);
    }
  }

  async function handlePreviewMatches() {
    setPreviewing(true);
    try {
      const res = await fetch('/api/matching/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            services,
            locations,
            allLocationsMode,
            niches,
            excludedNiches,
            allNichesMode,
            leadPreferences,
            minBudget: Number(minBudget) || 0,
            maxBudget: Number(maxBudget) || 60000,
            leadType,
            isAcceptingLeads,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewCount(data.totalEligible ?? 0);
      }
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/developer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          companyName,
          phone,
          bio,
          services,
          locations,
          allLocationsMode,
          niches,
          excludedNiches,
          allNichesMode,
          leadPreferences,
          minBudget: Number(minBudget) || 0,
          maxBudget: Number(maxBudget) || 60000,
          leadType,
          isAcceptingLeads,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'تعذر حفظ الإعدادات.' });
      } else {
        setMessage({
          type: 'success',
          text: 'تم حفظ إعدادات ملفك وإعادة حساب المطابقات (Phase 4 Matching Engine) بنجاح!',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'حدث خطأ أثناء الاتصال بالخادم.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      {loading ? (
        <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white p-6" />
      ) : (
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    إعدادات الحساب ومحرك المطابقة (Developer Matching Profile)
                  </h1>
                  <p className="text-xs text-slate-500">
                    يتحكم هذا الملف في معايير الأهلية الإلزامية (Hard Eligibility) وترتيب الفرص في لوحة التحكم.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePreviewMatches}
                disabled={previewing}
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-extrabold text-indigo-800 hover:bg-indigo-100"
              >
                <Compass className="h-4 w-4" />
                {previewing
                  ? 'جاري المعاينة...'
                  : previewCount !== null
                    ? `معاينة المطابقة: ${previewCount} عميل مؤهل`
                    : 'معاينة عدد العملاء المتطابقين'}
              </button>
            </div>

            {message && (
              <div
                className={`mt-4 rounded-xl border p-3.5 text-xs font-bold ${
                  message.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-800'
                }`}
              >
                {message.text}
              </div>
            )}

            <form onSubmit={handleSave} className="mt-6 space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700">الاسم الكامل</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    اسم الشركة / الاستوديو
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700">رقم الهاتف</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800">
                  1. الخدمات المقدمة (Services):
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DEVELOPER_SERVICES.map((srv) => {
                    const active = services.includes(srv.value);
                    return (
                      <button
                        type="button"
                        key={srv.value}
                        onClick={() => toggleItem(services, srv.value, setServices)}
                        className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                          active
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {srv.labelAr}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">
                    2. المدن والمحافظات المستهدفة (Target Locations):
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                    <input
                      type="checkbox"
                      checked={allLocationsMode}
                      onChange={(e) => setAllLocationsMode(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    تغطية جميع محافظات مصر (All Egypt)
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ALL_CITIES.map((c) => {
                    const active = locations.includes(c);
                    return (
                      <button
                        type="button"
                        key={c}
                        onClick={() => toggleItem(locations, c, setLocations)}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${
                          active
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">
                    3. الأنشطة التجارية المستهدفة (Supported Niches):
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                    <input
                      type="checkbox"
                      checked={allNichesMode}
                      onChange={(e) => setAllNichesMode(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    قبول جميع الأنشطة العامة (All Niches Mode)
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BUSINESS_CATEGORIES.map((cat) => {
                    const active = niches.includes(cat.value);
                    return (
                      <button
                        type="button"
                        key={cat.value}
                        onClick={() => toggleItem(niches, cat.value, setNiches)}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${
                          active
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {cat.labelAr} ({cat.value})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-rose-700">
                  4. استبعاد أنشطة تجارية محددة (Excluded Niches — تستبعد حتى مع تفعيل القبول العام):
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BUSINESS_CATEGORIES.map((cat) => {
                    const excluded = excludedNiches.includes(cat.value);
                    return (
                      <button
                        type="button"
                        key={cat.value}
                        onClick={() => toggleItem(excludedNiches, cat.value, setExcludedNiches, true)}
                        className={`rounded-xl border px-3 py-1 text-xs font-bold ${
                          excluded
                            ? 'border-rose-600 bg-rose-50 text-rose-800'
                            : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        {excluded ? '✕ مستبعد: ' : ''}{cat.labelAr}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
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
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    الحد الأقصى للميزانية (ج.م)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    step={5000}
                    value={maxBudget}
                    onChange={(e) => setMaxBudget(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    حالة الموقع المستهدفة
                  </label>
                  <select
                    value={
                      leadPreferences.length >= 2
                        ? 'BOTH'
                        : leadPreferences[0] || 'NO_WEBSITE'
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'BOTH') setLeadPreferences(['NO_WEBSITE', 'POOR_WEBSITE']);
                      else setLeadPreferences([v]);
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                  >
                    <option value="BOTH">بدون موقع أو موقع قديم</option>
                    <option value="NO_WEBSITE">بدون موقع إلكتروني فقط</option>
                    <option value="POOR_WEBSITE">موقع قديم / ضعيف فقط</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    نوع الملكية المفضلة
                  </label>
                  <select
                    value={leadType}
                    onChange={(e) =>
                      setLeadType(e.target.value as 'BOTH' | 'EXCLUSIVE' | 'SHARED')
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                  >
                    <option value="BOTH">الحصرية والمشتركة معًا</option>
                    <option value="EXCLUSIVE">فرص حصرية فقط (Exclusive)</option>
                    <option value="SHARED">فرص مشتركة فقط (Shared)</option>
                  </select>
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={isAcceptingLeads}
                    onChange={(e) => setIsAcceptingLeads(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                  الحساب جاهز ومفعل لاستقبال ترشيحات عملاء جدد (Accepting Leads)
                </label>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'جاري الحفظ...' : 'حفظ إعدادات المطابقة والملف الشخصي'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
