'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { LeadCard, LeadCardItem } from '@/components/LeadCard';
import {
  ALL_CITIES,
  ALL_GOVERNORATES,
  BUSINESS_CATEGORIES,
  EGYPT_LOCATIONS,
  SCORE_RANGES,
} from '@/lib/constants';
import { Filter, RotateCcw, Search, Sparkles } from 'lucide-react';

export default function LeadDiscoveryPage() {
  const [leads, setLeads] = useState<LeadCardItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters required by Section 5 & Phase 4 Section 27
  const [search, setSearch] = useState('');
  const [governorate, setGovernorate] = useState('ALL');
  const [city, setCity] = useState('ALL');
  const [area, setArea] = useState('');
  const [category, setCategory] = useState('ALL');
  const [service, setService] = useState('ALL');
  const [websiteStatus, setWebsiteStatus] = useState('ALL');
  const [scoreRange, setScoreRange] = useState('');
  const [minMatchStrength, setMinMatchStrength] = useState('');
  const [minQualityScore, setMinQualityScore] = useState('');
  const [freshnessStatus, setFreshnessStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState('MATCH_STRENGTH');
  const [temperature, setTemperature] = useState('ALL');
  const [ownershipType, setOwnershipType] = useState('ALL');
  const [hasPhone, setHasPhone] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [hasSocial, setHasSocial] = useState(false);
  const [matchedOnly, setMatchedOnly] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (governorate !== 'ALL') params.set('governorate', governorate);
      if (city !== 'ALL') params.set('city', city);
      if (area.trim()) params.set('area', area.trim());
      if (category !== 'ALL') params.set('category', category);
      if (service !== 'ALL') params.set('service', service);
      if (websiteStatus !== 'ALL') params.set('websiteStatus', websiteStatus);
      if (scoreRange) params.set('scoreRange', scoreRange);
      if (minMatchStrength) params.set('minMatchStrength', minMatchStrength);
      if (minQualityScore) params.set('minQualityScore', minQualityScore);
      if (freshnessStatus !== 'ALL') params.set('freshnessStatus', freshnessStatus);
      if (sortBy) params.set('sortBy', sortBy);
      if (temperature !== 'ALL') params.set('temperature', temperature);
      if (ownershipType !== 'ALL') params.set('ownershipType', ownershipType);
      if (hasPhone) params.set('hasPhone', 'true');
      if (hasEmail) params.set('hasEmail', 'true');
      if (hasSocial) params.set('hasSocial', 'true');
      if (matchedOnly) params.set('matchedOnly', 'true');

      const res = await fetch(`/api/leads?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } finally {
      setLoading(false);
    }
  }, [
    search,
    governorate,
    city,
    area,
    category,
    service,
    websiteStatus,
    scoreRange,
    minMatchStrength,
    minQualityScore,
    freshnessStatus,
    sortBy,
    temperature,
    ownershipType,
    hasPhone,
    hasEmail,
    hasSocial,
    matchedOnly,
  ]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  function resetFilters() {
    setSearch('');
    setGovernorate('ALL');
    setCity('ALL');
    setArea('');
    setCategory('ALL');
    setService('ALL');
    setWebsiteStatus('ALL');
    setScoreRange('');
    setMinMatchStrength('');
    setMinQualityScore('');
    setFreshnessStatus('ALL');
    setSortBy('MATCH_STRENGTH');
    setTemperature('ALL');
    setOwnershipType('ALL');
    setHasPhone(false);
    setHasEmail(false);
    setHasSocial(false);
    setMatchedOnly(false);
  }

  const availableCities =
    governorate === 'ALL'
      ? ALL_CITIES
      : EGYPT_LOCATIONS.find((g) => g.governorate === governorate)?.cities.map(
          (c) => c.name
        ) || ALL_CITIES;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
              اكتشف العملاء المحتملين (Lead Discovery)
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              تصفح الأنشطة التجارية المؤهلة في مصر وافتح بيانات التواصل مع العملاء المناسبين لخدماتك.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setMatchedOnly(!matchedOnly)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-extrabold transition ${
                matchedOnly
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span>
                {matchedOnly ? 'عرض المتوافقة مع ملفي فقط ✓' : 'مطابقة تلقائية مع ملفي الشخصي'}
              </span>
            </button>
          </div>
        </div>

        {/* Comprehensive Filters Panel (Section 5) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
              <Filter className="h-4 w-4 text-emerald-600" />
              أدوات التصفية المتقدمة (Filters)
            </span>
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-rose-600"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              إعادة ضبط الفلاتر
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {/* Search */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600">
                بحث باسم النشاط أو المنطقة
              </label>
              <div className="relative mt-1">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث عن عيادة، مطعم، شركة..."
                  className="w-full rounded-xl border border-slate-300 py-2 pr-9 pl-3 text-xs font-semibold"
                />
              </div>
            </div>

            {/* Governorate */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600">
                المحافظة (Governorate)
              </label>
              <select
                value={governorate}
                onChange={(e) => {
                  setGovernorate(e.target.value);
                  setCity('ALL');
                }}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="ALL">جميع المحافظات</option>
                {ALL_GOVERNORATES.map((gov) => (
                  <option key={gov} value={gov}>
                    {gov}
                  </option>
                ))}
              </select>
            </div>

            {/* City */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600">المدينة (City)</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="ALL">جميع المدن</option>
                {availableCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Area */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600">المنطقة (Area)</label>
              <input
                type="text"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="مثال: مدينة نصر، الدقي، سموحة..."
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
              />
            </div>

            {/* Business Type */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600">
                نوع النشاط (Business Type)
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="ALL">جميع الأنشطة التجارية</option>
                {BUSINESS_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.labelAr} ({cat.value})
                  </option>
                ))}
              </select>
            </div>

            {/* Website Status */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600">
                حالة الموقع (Website)
              </label>
              <select
                value={websiteStatus}
                onChange={(e) => setWebsiteStatus(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="ALL">الكل</option>
                <option value="NO_WEBSITE">بدون موقع إلكتروني (No Website)</option>
                <option value="POOR_WEBSITE">موقع قديم / ضعيف (Poor Website)</option>
                <option value="HAS_WEBSITE">يمتلك موقعًا (Has Website)</option>
                <option value="UNKNOWN">غير معروف (Unknown)</option>
              </select>
            </div>

            {/* Lead Score Range */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600">
                درجة التقييم (Lead Score)
              </label>
              <select
                value={scoreRange}
                onChange={(e) => setScoreRange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="">جميع الدرجات (0 – 100)</option>
                {SCORE_RANGES.map((sr) => (
                  <option key={sr.value} value={sr.value}>
                    {sr.labelAr}
                  </option>
                ))}
              </select>
            </div>

            {/* Lead Temperature / Type */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600">
                تصنيف الفرصة (Lead Type)
              </label>
              <select
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="ALL">جميع التصنيفات (Hot / Warm / Cold)</option>
                <option value="PREMIUM">فرصة ممتازة (PREMIUM 85-100)</option>
                <option value="HOT">فرصة ساخنة (HOT 70+)</option>
                <option value="WARM">فرصة دافئة (WARM 50-69)</option>
                <option value="COLD">فرصة باردة (COLD 0-49)</option>
              </select>
            </div>

            {/* Required Service (Phase 4) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600">
                الخدمة المطلوبة (Required Service)
              </label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="ALL">جميع الخدمات</option>
                <option value="WEBSITE_DEVELOPMENT">تطوير موقع إلكتروني (Website Development)</option>
                <option value="WEBSITE_REDESIGN">إعادة تصميم وتطوير موقع (Redesign)</option>
                <option value="ECOMMERCE">متجر إلكتروني (E-Commerce)</option>
                <option value="LANDING_PAGE">صفحة هبوط (Landing Page)</option>
                <option value="BOOKING_SYSTEM">نظام حجز مواعيد (Booking System)</option>
                <option value="CUSTOM_SOFTWARE">أنظمة مخصصة وتطبيقات ويب (Web App)</option>
                <option value="SEO">تحسين محركات البحث (SEO)</option>
              </select>
            </div>

            {/* Min Match Strength (Phase 4) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600">
                الحد الأدنى لقوة التطابق (Match Strength)
              </label>
              <select
                value={minMatchStrength}
                onChange={(e) => setMinMatchStrength(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="">الكل (0% – 100%)</option>
                <option value="85">تطابق ممتاز (85%+)</option>
                <option value="70">تطابق قوي (70%+)</option>
                <option value="50">تطابق مقبول (50%+)</option>
              </select>
            </div>

            {/* Min Quality Score & Freshness (Phase 3 & 4) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600">
                جودة وحداثة البيانات (Quality & Freshness)
              </label>
              <div className="mt-1 flex gap-2">
                <select
                  value={minQualityScore}
                  onChange={(e) => setMinQualityScore(e.target.value)}
                  className="w-1/2 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold"
                >
                  <option value="">كل مستويات الجودة</option>
                  <option value="85">ممتازة (85+)</option>
                  <option value="70">عالية (70+)</option>
                  <option value="50">متوسطة (50+)</option>
                </select>
                <select
                  value={freshnessStatus}
                  onChange={(e) => setFreshnessStatus(e.target.value)}
                  className="w-1/2 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold"
                >
                  <option value="ALL">كل حالات الحداثة</option>
                  <option value="FRESH">حديثة جداً (FRESH)</option>
                  <option value="RECENT">محدثة قريباً (RECENT)</option>
                </select>
              </div>
            </div>

            {/* Deterministic Sort Order (Phase 4) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600">
                الترتيب حسب (Sort Order)
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="MATCH_STRENGTH">الأعلى تطابقاً ثم الجودة (Match Strength)</option>
                <option value="SCORE_DESC">الأعلى فرصة بيعية (Opportunity Score)</option>
                <option value="QUALITY_DESC">الأعلى جودة بيانات (Quality Score)</option>
                <option value="NEWEST">الأحدث إضافةً (Newest)</option>
              </select>
            </div>
          </div>

          {/* Contact & Ownership Checkboxes Row */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-700">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasPhone}
                  onChange={(e) => setHasPhone(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span>هاتف متاح (Phone available)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasEmail}
                  onChange={(e) => setHasEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span>بريد إلكتروني متاح (Email available)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasSocial}
                  onChange={(e) => setHasSocial(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span>تواجد اجتماعي متاح (Social available)</span>
              </label>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-600">الملكية:</span>
              <button
                onClick={() => setOwnershipType('ALL')}
                className={`rounded-lg px-2.5 py-1 font-bold ${
                  ownershipType === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setOwnershipType('EXCLUSIVE')}
                className={`rounded-lg px-2.5 py-1 font-bold ${
                  ownershipType === 'EXCLUSIVE'
                    ? 'bg-purple-700 text-white'
                    : 'bg-purple-50 text-purple-700'
                }`}
              >
                حصري (Exclusive)
              </button>
              <button
                onClick={() => setOwnershipType('SHARED')}
                className={`rounded-lg px-2.5 py-1 font-bold ${
                  ownershipType === 'SHARED'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                مشترك (Shared)
              </button>
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-extrabold text-slate-700">
            إجمالي الفرص المطابقة للبحث: <span className="text-emerald-600">{leads.length}</span>{' '}
            شركة / نشاط تجاري
          </p>
        </div>

        {/* Leads Grid */}
        {loading ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
              />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <p className="text-base font-extrabold text-slate-800">
              لا توجد فرص مطابقة لمعايير التصفية الحالية
            </p>
            <p className="mt-1 text-xs text-slate-500">
              جرب تخفيف بعض الفلاتر أو إلغاء تفعيل خيار &quot;المتوافقة مع ملفي فقط&quot; لعرض جميع
              الفرص.
            </p>
            <button
              onClick={resetFilters}
              className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              إعادة عرض جميع الفرص
            </button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onClaimSuccess={() => {
                  loadLeads();
                }}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
