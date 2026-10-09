'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  ALL_CITIES,
  BUSINESS_CATEGORIES,
  DEVELOPER_SERVICES,
} from '@/lib/constants';
import { fmtNumber } from '@/lib/format';
import { Save, Compass, Check } from 'lucide-react';

export default function SettingsPage() {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [, setBio] = useState('');
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
        setMessage({ type: 'error', text: data.error || 'تعذّر حفظ الإعدادات.' });
      } else {
        setMessage({
          type: 'success',
          text: 'تم حفظ تفضيلات الملف الشخصي وإعادة حساب المطابقات بنجاح.',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell density="comfortable" pageTitle="تفضيلات المطابقة">
      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
          <PageHeader
            title="تفضيلات المطابقة والملف الشخصي"
            description="حدد معايير الأهلية وتفضيلاتك لاحتساب درجات مطابقة الفرص تلقائياً"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePreviewMatches}
                isLoading={previewing}
                className="gap-2"
              >
                <Compass className="h-4 w-4" />
                <span>
                  {previewCount !== null
                    ? `المطابقة: ${fmtNumber(previewCount)} عميل مؤهل`
                    : 'معاينة عدد الفرص المتطابقة'}
                </span>
              </Button>
            }
          />

          {message && (
            <Banner variant={message.type === 'success' ? 'info' : 'danger'}>
              {message.text}
            </Banner>
          )}

          <form onSubmit={handleSave} className="flex flex-col gap-6">
            {/* Basic Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>بيانات المطور الأساسية</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <Input
                  label="الاسم الكامل"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  label="اسم الشركة / الاستوديو"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="استوديو البرمجة"
                />
                <Input
                  label="رقم الهاتف"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  className="text-start"
                />
              </CardContent>
            </Card>

            {/* Services Card */}
            <Card>
              <CardHeader>
                <CardTitle>1. الخدمات المقدمة (Services)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {DEVELOPER_SERVICES.map((srv) => {
                    const active = services.includes(srv.value);
                    return (
                      <button
                        type="button"
                        key={srv.value}
                        onClick={() => toggleItem(services, srv.value, setServices)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption border transition-colors ${
                          active
                            ? 'border-brand bg-brand-soft text-brand font-semibold shadow-xs'
                            : 'border-line bg-surface text-fg-secondary hover:bg-subtle'
                        }`}
                      >
                        {active && <Check className="h-3 w-3" />}
                        <span>{srv.labelAr}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Locations Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>2. المدن والمحافظات المستهدفة</CardTitle>
                <Checkbox
                  label="قبول جميع محافظات مصر"
                  checked={allLocationsMode}
                  onChange={(e) => setAllLocationsMode(e.target.checked)}
                />
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {ALL_CITIES.map((c) => {
                    const active = locations.includes(c);
                    return (
                      <button
                        type="button"
                        key={c}
                        onClick={() => toggleItem(locations, c, setLocations)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption border transition-colors ${
                          active
                            ? 'border-brand bg-brand-soft text-brand font-semibold shadow-xs'
                            : 'border-line bg-surface text-fg-secondary hover:bg-subtle'
                        }`}
                      >
                        {active && <Check className="h-3 w-3" />}
                        <span>{c}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Niches Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>3. الأنشطة التجارية والقطاعات</CardTitle>
                <Checkbox
                  label="قبول جميع الأنشطة"
                  checked={allNichesMode}
                  onChange={(e) => setAllNichesMode(e.target.checked)}
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {BUSINESS_CATEGORIES.map((cat) => {
                    const active = niches.includes(cat.value);
                    return (
                      <button
                        type="button"
                        key={cat.value}
                        onClick={() => toggleItem(niches, cat.value, setNiches)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption border transition-colors ${
                          active
                            ? 'border-brand bg-brand-soft text-brand font-semibold shadow-xs'
                            : 'border-line bg-surface text-fg-secondary hover:bg-subtle'
                        }`}
                      >
                        {active && <Check className="h-3 w-3" />}
                        <span>{cat.labelAr}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-line">
                  <label className="block text-caption font-semibold text-warning-text mb-2">
                    استبعاد أنشطة محددة:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {BUSINESS_CATEGORIES.map((cat) => {
                      const excluded = excludedNiches.includes(cat.value);
                      return (
                        <button
                          type="button"
                          key={cat.value}
                          onClick={() => toggleItem(excludedNiches, cat.value, setExcludedNiches, true)}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-caption border transition-colors ${
                            excluded
                              ? 'border-warning-border bg-warning-bg text-warning-text font-semibold'
                              : 'border-line bg-surface text-fg-muted hover:bg-subtle'
                          }`}
                        >
                          {excluded && <span>✕ مستبعد:</span>}
                          <span>{cat.labelAr}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Budget & Preference Criteria */}
            <Card>
              <CardHeader>
                <CardTitle>4. الميزانية ونوع الملكية</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-4">
                <Input
                  label="الحد الأدنى للميزانية (ج.م)"
                  type="number"
                  min={0}
                  step={1000}
                  value={minBudget}
                  onChange={(e) => setMinBudget(Number(e.target.value))}
                />

                <Input
                  label="الحد الأقصى للميزانية (ج.م)"
                  type="number"
                  min={1000}
                  step={5000}
                  value={maxBudget}
                  onChange={(e) => setMaxBudget(Number(e.target.value))}
                />

                <Select
                  label="حالة الموقع المستهدفة"
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
                  options={[
                    { value: 'BOTH', label: 'بدون موقع أو موقع قديم' },
                    { value: 'NO_WEBSITE', label: 'بدون موقع إلكتروني فقط' },
                    { value: 'POOR_WEBSITE', label: 'موقع قديم / ضعيف فقط' },
                  ]}
                />

                <Select
                  label="نوع الملكية المفضلة"
                  value={leadType}
                  onChange={(e) =>
                    setLeadType(e.target.value as 'BOTH' | 'EXCLUSIVE' | 'SHARED')
                  }
                  options={[
                    { value: 'BOTH', label: 'الحصرية والمشتركة معاً' },
                    { value: 'EXCLUSIVE', label: 'فرص حصرية فقط' },
                    { value: 'SHARED', label: 'فرص مشتركة فقط' },
                  ]}
                />
              </CardContent>
            </Card>

            {/* Account Status Switch & Save Button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-line bg-surface">
              <Checkbox
                label="الحساب مفعل وجاهز لاستقبال ترشيحات الفرص الجديدة"
                checked={isAcceptingLeads}
                onChange={(e) => setIsAcceptingLeads(e.target.checked)}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={saving}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                <span>حفظ إعدادات المطابقة</span>
              </Button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
