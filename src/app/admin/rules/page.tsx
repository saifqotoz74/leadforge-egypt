'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react';

interface RuleItem {
  id: string;
  code: string;
  key?: string;
  name: string;
  nameEn: string;
  category?: string;
  ruleGroup?: string | null;
  points?: number;
  weight: number;
  priority?: number;
  version?: string;
  enabled: boolean;
  field: string;
  operator: string;
  targetValue: string;
  sortOrder: number;
}

interface FreshnessThresholds {
  freshMaxDays: number;
  recentMaxDays: number;
  needsVerifyMaxDays: number;
}

export default function AdminRulesPage() {
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [scoringVersion, setScoringVersion] = useState<string>('v1');
  const [freshness, setFreshness] = useState<FreshnessThresholds>({
    freshMaxDays: 7,
    recentMaxDays: 30,
    needsVerifyMaxDays: 90,
  });
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Rule Form
  const [showNewModal, setShowNewModal] = useState(false);
  const [newRule, setNewRule] = useState({
    code: 'STRONG_RATING_BONUS',
    name: 'تقييم جوجل ممتاز (4.5+)',
    nameEn: 'Strong rating 4.5+',
    category: 'REPUTATION',
    ruleGroup: '',
    weight: 10,
    priority: 95,
    version: 'v1',
    field: 'rating',
    operator: 'GREATER_THAN_OR_EQUAL',
    targetValue: '4.5',
  });

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/rules');
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
        const resolvedVer = data.scoringVersion || data.scoringConfig?.scoringVersion;
        if (resolvedVer) {
          setScoringVersion(resolvedVer);
        }
        if (data.freshnessConfig) setFreshness(data.freshnessConfig);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  async function handleUpdateRule(rule: RuleItem, changes: Partial<RuleItem>) {
    setMsg(null);
    setErrorMsg(null);
    const res = await fetch(`/api/admin/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rule, ...changes }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg('تم تحديث القاعدة وإعادة حساب درجات جميع العملاء تلقائيًا.');
      await loadRules();
    } else {
      setErrorMsg(data.error || 'تعذر تحديث القاعدة.');
    }
  }

  async function handleDeleteRule(ruleId: string) {
    setMsg(null);
    setErrorMsg(null);
    const res = await fetch(`/api/admin/rules/${ruleId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg('تم حذف القاعدة وإعادة حساب درجات العملاء.');
      await loadRules();
    } else {
      setErrorMsg(data.error || 'تعذر حذف القاعدة.');
    }
  }

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErrorMsg(null);
    const res = await fetch('/api/admin/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newRule,
        ruleGroup: newRule.ruleGroup.trim() || null,
        weight: Number(newRule.weight),
        points: Number(newRule.weight),
        priority: Number(newRule.priority),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setShowNewModal(false);
      setMsg('تمت إضافة القاعدة الجديدة وإعادة تقييم جميع العملاء.');
      await loadRules();
    } else {
      setErrorMsg(data.error || 'تعذر إضافة القاعدة الجديدة.');
    }
  }

  async function handleRecalculateAll() {
    setRecalculating(true);
    setMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/scoring/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const processed =
          data.report?.totalProcessed ?? data.evaluatedCount ?? data.updatedCount ?? 0;
        const changed = data.report?.changedCount ?? data.updatedCount ?? 0;
        const ver = data.report?.scoringVersion || data.scoringVersion || scoringVersion;
        setScoringVersion(ver);
        setMsg(
          `تمت إعادة تقييم ${processed} نشاط تجاري بنجاح (تغيرت درجات ${changed} نشاط — الإصدار ${ver}).`
        );
      } else {
        setErrorMsg(data.error || 'تعذر إعادة حساب درجات التقييم.');
      }
    } finally {
      setRecalculating(false);
    }
  }

  async function handleBumpVersion() {
    setRecalculating(true);
    setMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'BUMP_VERSION' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const ver = data.scoringVersion || data.report?.scoringVersion || scoringVersion;
        setScoringVersion(ver);
        setMsg(`تمت ترقية إصدار محرك التقييم إلى ${ver} وإعادة حساب الدرجات بنجاح.`);
        await loadRules();
      } else {
        setErrorMsg(data.error || 'تعذر ترقية إصدار التقييم.');
      }
    } finally {
      setRecalculating(false);
    }
  }

  async function handleSaveFreshness(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErrorMsg(null);
    const res = await fetch('/api/admin/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPDATE_FRESHNESS',
        ...freshness,
      }),
    });
    if (res.ok) {
      setMsg('تم تحديث حدود حداثة البيانات (Lead Freshness Thresholds) بنجاح.');
    } else {
      setErrorMsg('تعذر تحديث حدود حداثة البيانات.');
    }
  }

  return (
    <AppShell isAdminView>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900">
                محرك قواعد التقييم وحداثة البيانات (Rule-Based Scoring Engine)
              </h1>
              <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-mono text-xs font-extrabold text-emerald-800">
                Engine {scoringVersion}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              تحكم كامل في اسم القاعدة، الوزن (Weight/Points)، المجموعات الحصرية (Rule Groups)،
              الأولوية، والشروط المنطقية، مع إعادة حساب فورية لجميع الـ Leads.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={handleBumpVersion}
              disabled={recalculating}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <span>ترقية إصدار التقييم ({scoringVersion}+)</span>
            </button>

            <button
              onClick={handleRecalculateAll}
              disabled={recalculating}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${recalculating ? 'animate-spin' : ''}`} />
              <span>إعادة تقييم جميع الـ Leads</span>
            </button>

            <button
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              <span>إضافة قاعدة تقييم جديدة</span>
            </button>
          </div>
        </div>

        {msg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800">
            {msg}
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">
            {errorMsg}
          </div>
        )}

        {/* Scoring Bands Reference */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-bold">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-900">
            0 – 49 نقطة = COLD (بارد)
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
            50 – 69 نقطة = WARM (دافئ)
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900">
            70 – 84 نقطة = HOT (ساخن)
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-purple-900">
            85 – 100 نقطة = PREMIUM (ممتاز)
          </div>
        </div>

        {/* Scoring Rules Table */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto">
          {loading ? (
            <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-3 px-2">اسم القاعدة (عربي / إنجليزي)</th>
                  <th className="py-3 px-2">المجموعة / الأولوية</th>
                  <th className="py-3 px-2">الشرط المنطقي (Condition)</th>
                  <th className="py-3 px-2">النقاط (Weight)</th>
                  <th className="py-3 px-2">الحالة</th>
                  <th className="py-3 px-2">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold">
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="py-3.5 px-2">
                      <input
                        type="text"
                        defaultValue={rule.name}
                        onBlur={(e) => {
                          if (e.target.value !== rule.name) {
                            handleUpdateRule(rule, { name: e.target.value });
                          }
                        }}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1 font-bold text-slate-900"
                      />
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {rule.nameEn} ({rule.code}) • {rule.version || 'v1'}
                      </span>
                    </td>
                    <td className="py-3.5 px-2 text-[11px] font-mono text-slate-600" dir="ltr">
                      <div className="flex flex-col gap-1">
                        <input
                          type="text"
                          aria-label={`مجموعة القاعدة ${rule.code}`}
                          placeholder="independent"
                          defaultValue={rule.ruleGroup || ''}
                          onBlur={(e) => {
                            const nextGroup = e.target.value.trim() || null;
                            if (nextGroup !== (rule.ruleGroup || null)) {
                              handleUpdateRule(rule, { ruleGroup: nextGroup });
                            }
                          }}
                          className="w-32 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-700"
                        />
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">priority:</span>
                          <input
                            type="number"
                            aria-label={`أولوية القاعدة ${rule.code}`}
                            defaultValue={rule.priority ?? rule.sortOrder ?? 100}
                            onBlur={(e) => {
                              const nextPrio = Number(e.target.value);
                              if (nextPrio !== (rule.priority ?? rule.sortOrder ?? 100)) {
                                handleUpdateRule(rule, {
                                  priority: nextPrio,
                                  sortOrder: nextPrio,
                                });
                              }
                            }}
                            className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-700"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-2 font-mono text-[11px] text-slate-700" dir="ltr">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          aria-label={`حقل القاعدة ${rule.code}`}
                          defaultValue={rule.field}
                          onChange={(e) => {
                            if (e.target.value !== rule.field) {
                              handleUpdateRule(rule, { field: e.target.value });
                            }
                          }}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-800"
                        >
                          <option value="isVerified">isVerified</option>
                          <option value="websiteStatus">websiteStatus</option>
                          <option value="hasFacebook">hasFacebook</option>
                          <option value="hasInstagram">hasInstagram</option>
                          <option value="hasPhone">hasPhone</option>
                          <option value="hasEmail">hasEmail</option>
                          <option value="branchCount">branchCount</option>
                          <option value="reviewCount">reviewCount</option>
                          <option value="rating">rating</option>
                          <option value="isRecentlyActive">isRecentlyActive</option>
                          <option value="category">category</option>
                          <option value="city">city</option>
                          <option value="governorate">governorate</option>
                        </select>
                        <select
                          aria-label={`معامل القاعدة ${rule.code}`}
                          defaultValue={rule.operator}
                          onChange={(e) => {
                            if (e.target.value !== rule.operator) {
                              handleUpdateRule(rule, { operator: e.target.value });
                            }
                          }}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-800"
                        >
                          <option value="IS_TRUE">IS_TRUE</option>
                          <option value="IS_FALSE">IS_FALSE</option>
                          <option value="EQUALS">EQUALS</option>
                          <option value="NOT_EQUALS">NOT_EQUALS</option>
                          <option value="GREATER_THAN">GREATER_THAN</option>
                          <option value="GREATER_THAN_OR_EQUAL">GREATER_THAN_OR_EQUAL</option>
                          <option value="LESS_THAN">LESS_THAN</option>
                          <option value="LESS_THAN_OR_EQUAL">LESS_THAN_OR_EQUAL</option>
                          <option value="CONTAINS">CONTAINS</option>
                          <option value="NOT_CONTAINS">NOT_CONTAINS</option>
                          <option value="EXISTS">EXISTS</option>
                          <option value="NOT_EXISTS">NOT_EXISTS</option>
                          <option value="IN">IN</option>
                          <option value="NOT_IN">NOT_IN</option>
                        </select>
                        <input
                          type="text"
                          aria-label={`قيمة الشرط ${rule.code}`}
                          defaultValue={rule.targetValue}
                          onBlur={(e) => {
                            if (e.target.value !== rule.targetValue) {
                              handleUpdateRule(rule, { targetValue: e.target.value });
                            }
                          }}
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-800"
                        />
                      </div>
                    </td>
                    <td className="py-3.5 px-2">
                      <input
                        type="number"
                        defaultValue={rule.weight}
                        onBlur={(e) => {
                          const w = Number(e.target.value);
                          if (w !== rule.weight) {
                            handleUpdateRule(rule, { weight: w, points: w });
                          }
                        }}
                        className="w-20 rounded-lg border border-slate-300 px-2.5 py-1 text-center font-extrabold text-emerald-700"
                      />
                    </td>
                    <td className="py-3.5 px-2">
                      <button
                        onClick={() => handleUpdateRule(rule, { enabled: !rule.enabled })}
                        className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                          rule.enabled
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {rule.enabled ? 'مفعلة (Enabled)' : 'معطلة (Disabled)'}
                      </button>
                    </td>
                    <td className="py-3.5 px-2">
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100"
                        title="حذف القاعدة"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Lead Freshness Configuration (Section 10) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-extrabold text-slate-900">
            إعدادات حداثة البيانات (Lead Freshness Thresholds)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            تحديد عدد الأيام لتصنيف حداثة التحقق من النشاط التجاري (Fresh / Recently Verified /
            Needs Verification / Stale).
          </p>

          <form onSubmit={handleSaveFreshness} className="mt-4 grid gap-4 sm:grid-cols-4 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-700">
                Fresh (حديث) حتى (أيام):
              </label>
              <input
                type="number"
                min={1}
                value={freshness.freshMaxDays}
                onChange={(e) =>
                  setFreshness({ ...freshness, freshMaxDays: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                Recently Verified حتى (أيام):
              </label>
              <input
                type="number"
                min={2}
                value={freshness.recentMaxDays}
                onChange={(e) =>
                  setFreshness({ ...freshness, recentMaxDays: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                Needs Verification حتى (أيام):
              </label>
              <input
                type="number"
                min={3}
                value={freshness.needsVerifyMaxDays}
                onChange={(e) =>
                  setFreshness({ ...freshness, needsVerifyMaxDays: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 px-4 text-xs font-extrabold text-white hover:bg-slate-800"
            >
              <Save className="h-4 w-4" />
              <span>حفظ حدود الحداثة</span>
            </button>
          </form>
        </div>

        {/* Add New Rule Modal */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-base font-extrabold text-slate-900">
                إضافة قاعدة تقييم جديدة (New Scoring Rule)
              </h3>
              <form onSubmit={handleCreateRule} className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700">كود القاعدة (Code)</label>
                  <input
                    type="text"
                    required
                    value={newRule.code}
                    onChange={(e) => setNewRule({ ...newRule, code: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">الاسم بالعربية</label>
                  <input
                    type="text"
                    required
                    value={newRule.name}
                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">الاسم بالإنجليزية</label>
                  <input
                    type="text"
                    required
                    value={newRule.nameEn}
                    onChange={(e) => setNewRule({ ...newRule, nameEn: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="font-bold text-slate-700">الحقل (Field)</label>
                    <select
                      value={newRule.field}
                      onChange={(e) => setNewRule({ ...newRule, field: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2 py-2"
                    >
                      <option value="rating">rating</option>
                      <option value="reviewCount">reviewCount</option>
                      <option value="branchCount">branchCount</option>
                      <option value="hasPhone">hasPhone</option>
                      <option value="hasEmail">hasEmail</option>
                      <option value="hasFacebook">hasFacebook</option>
                      <option value="hasInstagram">hasInstagram</option>
                      <option value="websiteStatus">websiteStatus</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700">المعامل</label>
                    <select
                      value={newRule.operator}
                      onChange={(e) => setNewRule({ ...newRule, operator: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2 py-2"
                    >
                      <option value="GREATER_THAN_OR_EQUAL">&gt;=</option>
                      <option value="GREATER_THAN">&gt;</option>
                      <option value="EQUALS">==</option>
                      <option value="IS_TRUE">IS_TRUE</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700">القيمة</label>
                    <input
                      type="text"
                      value={newRule.targetValue}
                      onChange={(e) => setNewRule({ ...newRule, targetValue: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-2 py-2"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-slate-700">النقاط (Weight)</label>
                  <input
                    type="number"
                    required
                    value={newRule.weight}
                    onChange={(e) => setNewRule({ ...newRule, weight: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-5 py-2 font-bold text-white"
                  >
                    إضافة وتطبيق
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
