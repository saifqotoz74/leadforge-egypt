'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/domain/AppShell';
import {
  Compass,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Plus,
  Trash2,
  Bug,
  Users,
  ShieldCheck,
  Activity,
} from 'lucide-react';

interface MatchingRuleItem {
  id: string;
  key: string;
  name: string;
  nameEn: string;
  description?: string | null;
  category: string;
  ruleGroup?: string | null;
  points: number;
  priority: number;
  enabled: boolean;
  version: string;
  condition: Record<string, unknown>;
}

interface MatchingConfigState {
  currentVersion: string;
  versionNumber: number;
  serviceMatchMode: 'ALL_REQUIRED' | 'ANY_REQUIRED';
  unknownLocationPolicy: 'ALLOW_WITH_PENALTY' | 'REQUIRE_VERIFICATION' | 'FAIL';
  unknownBudgetPolicy: 'ALLOW_WITH_PENALTY' | 'REQUIRE_VERIFICATION' | 'FAIL';
  requiresVerificationPolicy:
    | 'EXCLUDE'
    | 'VERIFIED_DEVELOPERS_ONLY'
    | 'INCLUDE_WITH_WARNING';
  budgetHardRequirement: boolean;
  requireActiveSubscription: boolean;
  requireDeveloperVerified: boolean;
}

interface SimpleLeadItem {
  id: string;
  businessName: string;
  category: string;
  city: string;
  governorate: string;
  score: number;
  qualityScore: number;
  saleabilityStatus: string;
}

interface SimpleDeveloperItem {
  id: string;
  name: string;
  email: string;
  status: string;
}

interface DebugCheckRecord {
  dimension: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  code: string;
  leadValue: string;
  developerPreference: string;
  reason: string;
  reasonAr: string;
}

interface DebugReportData {
  leadId: string;
  developerId: string;
  eligible: boolean;
  resultLabel: 'ELIGIBLE' | 'REJECTED';
  matchPoints: number;
  finalMatchStrength: number;
  matchVersion: string;
  calculatedAt: string;
  leadData: {
    id: string;
    businessName: string;
    category: string;
    normalizedNiche: string;
    requiredServices: string[];
    projectLeadType: string;
    ownershipType: string;
    city: string;
    governorate: string;
    budgetInterval: { min: number | null; max: number | null; currency: string; type: string };
    opportunityScore: number;
    qualityScore: number;
    freshness: string;
    verificationStatus: string;
    saleabilityStatus: string;
  };
  developerPreferences: {
    developerId: string;
    name: string;
    accountStatus: string;
    profileActive: boolean;
    acceptingLeads: boolean;
    services: string[];
    niches: string[];
    excludedNiches: string[];
    locations: string[];
    budgetRange: { min: number; max: number | null; currency: string };
    leadTypePreference: string;
    planName: string;
    allowsExclusive: boolean;
  };
  hardEligibilityChecks: DebugCheckRecord[];
  appliedRules: Array<{
    key: string;
    category: string;
    reason: string;
    reasonAr: string;
    points: number;
  }>;
  unappliedRules: Array<{
    key: string;
    category: string;
    reason: string;
    reasonAr: string;
    points: number;
    outcome?: string;
  }>;
}

interface LeadDevelopersRankingData {
  lead: SimpleLeadItem;
  matchVersion: string;
  eligibleDevelopers: Array<{
    developerId: string;
    rank: number | null;
    matchStrength: number;
    rawMatchPoints: number;
    matchedCriteria: Array<{ key: string; points: number; reasonAr: string }>;
  }>;
  rejectedDevelopers?: Array<{
    developerId: string;
    hardFailures: Array<{ key: string; reasonAr: string; reason: string }>;
  }>;
  diagnostics: {
    totalEvaluated: number;
    eligibleCount: number;
    rejectedCount: number;
    failureBreakdown: Record<string, number>;
    summary: string;
    summaryAr: string;
  };
}

export default function AdminMatchingPage() {
  const [activeTab, setActiveTab] = useState<'debugger' | 'rules' | 'config'>('debugger');
  const [rules, setRules] = useState<MatchingRuleItem[]>([]);
  const [config, setConfig] = useState<MatchingConfigState | null>(null);
  const [matchVersion, setMatchVersion] = useState('v1');
  const [leads, setLeads] = useState<SimpleLeadItem[]>([]);
  const [developers, setDevelopers] = useState<SimpleDeveloperItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedDeveloperId, setSelectedDeveloperId] = useState('');
  const [debugReport, setDebugReport] = useState<DebugReportData | null>(null);
  const [leadRanking, setLeadRanking] = useState<LeadDevelopersRankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningDebugger, setRunningDebugger] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // New Rule Form State
  const [newRuleKey, setNewRuleKey] = useState('');
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleNameEn, setNewRuleNameEn] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState('PREFERENCE');
  const [newRulePoints, setNewRulePoints] = useState(5);
  const [newRulePriority, setNewRulePriority] = useState(160);
  const [newRuleField, setNewRuleField] = useState('matchedPrimaryService');
  const [newRuleOperator, setNewRuleOperator] = useState('eq');
  const [newRuleValue, setNewRuleValue] = useState('true');

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [rulesRes, leadsRes, usersRes] = await Promise.all([
        fetch('/api/admin/matching/rules'),
        fetch('/api/admin/leads?limit=50'),
        fetch('/api/admin/users'),
      ]);

      if (rulesRes.ok) {
        const rulesData = await rulesRes.json();
        setRules(rulesData.rules || []);
        setConfig(rulesData.config || null);
        setMatchVersion(rulesData.matchVersion || 'v1');
      }

      let firstLeadId = '';
      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        const leadList: SimpleLeadItem[] = (leadsData.leads || []).slice(0, 40);
        setLeads(leadList);
        if (leadList.length > 0) {
          firstLeadId = leadList[0].id;
          setSelectedLeadId(firstLeadId);
        }
      }

      let firstDevId = '';
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        const devList: SimpleDeveloperItem[] = (usersData.users || []).filter(
          (u: { role: string }) => u.role === 'DEVELOPER'
        );
        setDevelopers(devList);
        if (devList.length > 0) {
          firstDevId = devList[0].id;
          setSelectedDeveloperId(firstDevId);
        }
      }

      if (firstLeadId && firstDevId) {
        await runPairInspection(firstLeadId, firstDevId);
      }
    } catch {
      setErrorBanner('تعذر تحميل بيانات محرك المطابقة.');
    } finally {
      setLoading(false);
    }
  }

  async function runPairInspection(leadId: string, developerId: string) {
    if (!leadId || !developerId) return;
    setRunningDebugger(true);
    setErrorBanner(null);
    try {
      const [pairRes, leadRankRes] = await Promise.all([
        fetch(`/api/matching/leads/${leadId}/developers/${developerId}`),
        fetch(`/api/matching/leads/${leadId}?includeRejected=true`),
      ]);

      if (pairRes.ok) {
        const pairData = await pairRes.json();
        setDebugReport(pairData.debugReport || pairData);
      }
      if (leadRankRes.ok) {
        const rankData = await leadRankRes.json();
        setLeadRanking(rankData);
      }
    } catch {
      setErrorBanner('حدث خطأ أثناء تشغيل فاحص المطابقة.');
    } finally {
      setRunningDebugger(false);
    }
  }

  async function handleRecalculateAll() {
    setRecalculating(true);
    setStatusBanner(null);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/admin/matching/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchLimit: 50 }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusBanner(
          `تمت إعادة حساب ${data.recalculatedPairs} زوج مطابقة (${data.eligiblePairs} مؤهل، ${data.rejectedPairs} مستبعد) — الإصدار ${data.matchVersion}`
        );
        if (selectedLeadId && selectedDeveloperId) {
          await runPairInspection(selectedLeadId, selectedDeveloperId);
        }
      } else {
        setErrorBanner(data.error || 'تعذر إعادة حساب المطابقات.');
      }
    } catch {
      setErrorBanner('تعذر الاتصال بالخادم.');
    } finally {
      setRecalculating(false);
    }
  }

  async function handleToggleRule(rule: MatchingRuleItem) {
    try {
      const res = await fetch(`/api/admin/matching/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      const data = await res.json();
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, enabled: !rule.enabled, version: data.matchVersion } : r))
        );
        setMatchVersion(data.matchVersion);
        setStatusBanner(`تم تحديث حالة القاعدة ${rule.key} وترقية الإصدار إلى ${data.matchVersion}`);
      }
    } catch {
      setErrorBanner('تعذر تحديث القاعدة.');
    }
  }

  async function handleUpdateRulePoints(rule: MatchingRuleItem, newPoints: number) {
    try {
      const res = await fetch(`/api/admin/matching/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: newPoints }),
      });
      const data = await res.json();
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, points: newPoints, version: data.matchVersion } : r))
        );
        setMatchVersion(data.matchVersion);
        setStatusBanner(`تم تعديل نقاط القاعدة ${rule.key} إلى ${newPoints} (الإصدار ${data.matchVersion})`);
      }
    } catch {
      setErrorBanner('تعذر تعديل نقاط القاعدة.');
    }
  }

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    setErrorBanner(null);
    setStatusBanner(null);

    let parsedValue: unknown = newRuleValue;
    if (newRuleValue === 'true') parsedValue = true;
    else if (newRuleValue === 'false') parsedValue = false;
    else if (!Number.isNaN(Number(newRuleValue)) && newRuleValue.trim() !== '') {
      parsedValue = Number(newRuleValue);
    }

    try {
      const res = await fetch('/api/admin/matching/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newRuleKey.trim().toUpperCase(),
          name: newRuleName.trim(),
          nameEn: newRuleNameEn.trim() || newRuleName.trim(),
          category: newRuleCategory,
          points: Number(newRulePoints),
          priority: Number(newRulePriority),
          enabled: true,
          condition: {
            field: newRuleField,
            operator: newRuleOperator,
            value: parsedValue,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRules((prev) => [...prev, data.rule]);
        setMatchVersion(data.matchVersion);
        setNewRuleKey('');
        setNewRuleName('');
        setNewRuleNameEn('');
        setStatusBanner(`تمت إضافة القاعدة ${data.rule.key} بنجاح (الإصدار ${data.matchVersion})`);
      } else {
        setErrorBanner(data.error || 'تعذر إنشاء القاعدة.');
      }
    } catch {
      setErrorBanner('تعذر إنشاء القاعدة.');
    }
  }

  async function handleDeleteRule(ruleId: string, key: string) {
    try {
      const res = await fetch(`/api/admin/matching/rules/${ruleId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
        setMatchVersion(data.matchVersion);
        setStatusBanner(`تم حذف القاعدة ${key} (الإصدار ${data.matchVersion})`);
      }
    } catch {
      setErrorBanner('تعذر حذف القاعدة.');
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setErrorBanner(null);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/admin/matching/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_CONFIG',
          ...config,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfig(data.config);
        setMatchVersion(data.matchVersion);
        setStatusBanner(`تم حفظ سياسات المطابقة بنجاح وترقية الإصدار إلى ${data.matchVersion}`);
      } else {
        setErrorBanner(data.error || 'تعذر حفظ الإعدادات.');
      }
    } catch {
      setErrorBanner('تعذر حفظ الإعدادات.');
    }
  }

  return (
    <AppShell isAdmin={true} density="compact" pageTitle="محرك المطابقة">
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Compass className="h-6 w-6 text-brand" />
              <h1 className="text-xl font-extrabold text-fg-primary">
                محرك المطابقة القياسي ومصحح الأهلية (Phase 4 Deterministic Matching Engine)
              </h1>
            </div>
            <p className="mt-1 text-xs text-fg-secondary">
              فحص الأهلية الإلزامية (Layer A Hard Eligibility) وقواعد الملاءمة الموزونة (Layer B Soft Rules) بدون أي نماذج عشوائية أو ذكاء اصطناعي.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-xl border border-line-brand bg-brand-soft px-3 py-1.5 text-xs font-extrabold text-brand">
              إصدار المطابقة النشط: {matchVersion}
            </span>
            <button
              onClick={handleRecalculateAll}
              disabled={recalculating}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-hover disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${recalculating ? 'animate-spin' : ''}`} />
              {recalculating ? 'جاري إعادة الحساب...' : 'إعادة حساب المطابقات (Recalculate)'}
            </button>
          </div>
        </div>

        {statusBanner && (
          <div className="rounded-xl border border-line-brand bg-brand-soft p-4 text-xs font-bold text-brand">
            ✓ {statusBanner}
          </div>
        )}
        {errorBanner && (
          <div className="rounded-xl border border-danger-border bg-danger-bg p-4 text-xs font-bold text-danger-text">
            ✕ {errorBanner}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-line pb-3">
          <button
            onClick={() => setActiveTab('debugger')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors ${
              activeTab === 'debugger'
                ? 'bg-brand text-white shadow-xs'
                : 'border border-line bg-surface text-fg-secondary hover:bg-subtle'
            }`}
          >
            <Bug className="h-4 w-4" />
            مصحح المطابقة التفصيلي (Admin Match Debugger)
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors ${
              activeTab === 'rules'
                ? 'bg-brand text-white shadow-xs'
                : 'border border-line bg-surface text-fg-secondary hover:bg-subtle'
            }`}
          >
            <Sliders className="h-4 w-4" />
            قواعد المطابقة الموزونة ({rules.length} Rules)
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors ${
              activeTab === 'config'
                ? 'bg-brand text-white shadow-xs'
                : 'border border-line bg-surface text-fg-secondary hover:bg-subtle'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            سياسات التحقق والبيانات غير المكتملة
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-line bg-white p-12 text-center text-sm font-semibold text-fg-secondary">
            جاري تحميل بيانات محرك المطابقة...
          </div>
        ) : activeTab === 'debugger' ? (
          <div className="space-y-6">
            {/* Lead & Developer Selector */}
            <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <h2 className="text-sm font-extrabold text-fg-primary">
                اختر العميل المحتمل (Lead) والمطور (Developer) لتحليل أسباب القبول أو الاستبعاد:
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1.5">
                    العميل المحتمل (Lead):
                  </label>
                  <select
                    value={selectedLeadId}
                    onChange={(e) => {
                      const nextLead = e.target.value;
                      setSelectedLeadId(nextLead);
                      if (nextLead && selectedDeveloperId) {
                        runPairInspection(nextLead, selectedDeveloperId);
                      }
                    }}
                    className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-xs font-semibold text-fg-primary"
                  >
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.businessName} — ({l.category} | {l.city} | Score: {l.score})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1.5">
                    المطور (Developer):
                  </label>
                  <select
                    value={selectedDeveloperId}
                    onChange={(e) => {
                      const nextDev = e.target.value;
                      setSelectedDeveloperId(nextDev);
                      if (selectedLeadId && nextDev) {
                        runPairInspection(selectedLeadId, nextDev);
                      }
                    }}
                    className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-xs font-semibold text-fg-primary"
                  >
                    {developers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.email}) — [{d.status}]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => runPairInspection(selectedLeadId, selectedDeveloperId)}
                    disabled={runningDebugger}
                    className="w-full rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    {runningDebugger ? 'جاري الفحص...' : 'تشغيل فاحص المطابقة (Inspect Pair)'}
                  </button>
                </div>
              </div>
            </div>

            {debugReport && (
              <div className="space-y-6">
                {/* Summary Banner */}
                <div
                  className={`flex flex-col justify-between gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center ${
                    debugReport.eligible
                      ? 'border-line-brand bg-brand-soft/70'
                      : 'border-danger-border bg-danger-bg/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {debugReport.eligible ? (
                      <CheckCircle2 className="h-8 w-8 text-brand shrink-0" />
                    ) : (
                      <XCircle className="h-8 w-8 text-danger-text shrink-0" />
                    )}
                    <div>
                      <span
                        className={`inline-block rounded-lg px-2.5 py-0.5 text-xs font-extrabold ${
                          debugReport.eligible
                            ? 'bg-brand text-white'
                            : 'bg-danger-fill text-white'
                        }`}
                      >
                        {debugReport.resultLabel} ({debugReport.eligible ? 'مؤهل للمطابقة' : 'مستبعد'})
                      </span>
                      <h3 className="mt-1 text-base font-extrabold text-fg-primary">
                        {debugReport.leadData.businessName} ⇄ {debugReport.developerPreferences.name}
                      </h3>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="rounded-xl bg-white px-4 py-2 text-center shadow-sm border border-line">
                      <span className="block text-[11px] font-semibold text-fg-secondary">
                        قوة التطابق (Match Strength)
                      </span>
                      <span className="text-xl font-extrabold text-brand">
                        {debugReport.finalMatchStrength}/100
                      </span>
                    </div>
                    <div className="rounded-xl bg-white px-4 py-2 text-center shadow-sm border border-line">
                      <span className="block text-[11px] font-semibold text-fg-secondary">
                        النقاط الخام (Raw Points)
                      </span>
                      <span className="text-xl font-extrabold text-fg-primary">
                        {debugReport.matchPoints}
                      </span>
                    </div>
                    <div className="rounded-xl bg-white px-4 py-2 text-center shadow-sm border border-line">
                      <span className="block text-[11px] font-semibold text-fg-secondary">
                        الجودة / الفرصة
                      </span>
                      <span className="text-sm font-extrabold text-fg-primary">
                        Q: {debugReport.leadData.qualityScore} | Opp: {debugReport.leadData.opportunityScore}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Layer A: Hard Eligibility Gate Checks */}
                <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-extrabold text-fg-primary">
                    الطبقة الأولى (Layer A — Hard Eligibility Gates): فحص شروط الأهلية الإلزامية
                  </h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-start text-xs">
                      <thead>
                        <tr className="border-b border-line bg-subtle text-fg-secondary">
                          <th className="p-2.5 font-bold">البُعد (Dimension)</th>
                          <th className="p-2.5 font-bold">الحالة</th>
                          <th className="p-2.5 font-bold">الكود (Code)</th>
                          <th className="p-2.5 font-bold">بيانات العميل (Lead)</th>
                          <th className="p-2.5 font-bold">تفضيل المطور (Developer)</th>
                          <th className="p-2.5 font-bold">السبب التفصيلي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {debugReport.hardEligibilityChecks.map((chk, idx) => (
                          <tr key={idx} className="hover:bg-subtle/70">
                            <td className="p-2.5 font-bold text-fg-primary">{chk.dimension}</td>
                            <td className="p-2.5">
                              {chk.status === 'PASS' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
                                  <CheckCircle2 className="h-3 w-3" /> PASS
                                </span>
                              ) : chk.status === 'WARN' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-bold text-warning-text">
                                  <AlertTriangle className="h-3 w-3" /> WARN
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-bold text-danger-text">
                                  <XCircle className="h-3 w-3" /> FAIL
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 font-mono text-[11px] font-semibold text-fg-primary">
                              {chk.code}
                            </td>
                            <td className="p-2.5 text-fg-primary">{chk.leadValue}</td>
                            <td className="p-2.5 text-fg-primary">{chk.developerPreference}</td>
                            <td className="p-2.5 font-semibold text-fg-primary">{chk.reasonAr}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Layer B: Soft Matching Rules Breakdown */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-extrabold text-brand">
                      الطبقة الثانية (Layer B): القواعد المنطبقة (+ النقاط المكتسبة)
                    </h3>
                    {debugReport.appliedRules.length === 0 ? (
                      <p className="mt-4 text-xs text-fg-secondary">
                        لم يتم احتساب نقاط ملاءمة (إما لعدم اجتياز شروط الأهلية الإلزامية أو عدم انطباق قواعد).
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {debugReport.appliedRules.map((rule) => (
                          <div
                            key={rule.key}
                            className="flex items-center justify-between rounded-xl border border-line-brand bg-brand-soft/40 p-3 text-xs"
                          >
                            <div>
                              <span className="font-mono text-[11px] font-bold text-brand">
                                {rule.key} ({rule.category})
                              </span>
                              <p className="mt-0.5 font-semibold text-fg-primary">{rule.reasonAr}</p>
                            </div>
                            <span
                              className={`rounded-lg px-2.5 py-1 text-xs font-extrabold ${
                                rule.points >= 0
                                  ? 'bg-brand text-white'
                                  : 'bg-warning-text text-white'
                              }`}
                            >
                              {rule.points >= 0 ? `+${rule.points}` : rule.points}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-extrabold text-fg-primary">
                      القواعد غير المنطبقة أو المستبدلة ضمن نفس المجموعة (Unapplied Rules)
                    </h3>
                    <div className="mt-3 max-h-80 overflow-y-auto space-y-2">
                      {debugReport.unappliedRules.map((rule) => (
                        <div
                          key={rule.key}
                          className="flex items-center justify-between rounded-xl border border-line bg-subtle p-2.5 text-xs"
                        >
                          <div>
                            <span className="font-mono text-[11px] font-bold text-fg-primary">
                              {rule.key} ({rule.category})
                            </span>
                            <p className="mt-0.5 text-fg-secondary">{rule.reasonAr}</p>
                          </div>
                          <span className="rounded bg-subtle px-2 py-0.5 text-[10px] font-bold text-fg-secondary">
                            {rule.outcome || '0 pts'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* All Ranked Developers for Selected Lead */}
            {leadRanking && (
              <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-fg-primary">
                    <Users className="h-4 w-4 text-brand" />
                    ترتيب جميع المطورين لهذا العميل ({leadRanking.diagnostics.summaryAr})
                  </h3>
                  <span className="text-xs font-semibold text-fg-secondary">
                    {leadRanking.diagnostics.summary}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-bold text-brand mb-2">
                      المطورون المؤهلون مرتبون حسب قوة التطابق ({leadRanking.eligibleDevelopers.length}):
                    </h4>
                    {leadRanking.eligibleDevelopers.length === 0 ? (
                      <div className="rounded-xl border border-warning-border bg-warning-bg p-3 text-xs text-warning-text font-semibold">
                        لا يوجد مطورون مؤهلون لهذا العميل حاليًا ({leadRanking.diagnostics.summary}).
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {leadRanking.eligibleDevelopers.map((m) => (
                          <div
                            key={m.developerId}
                            onClick={() => {
                              setSelectedDeveloperId(m.developerId);
                              runPairInspection(selectedLeadId, m.developerId);
                            }}
                            className="cursor-pointer flex items-center justify-between rounded-xl border border-line-brand bg-brand-soft/40 p-3 text-xs hover:bg-brand-soft"
                          >
                            <div>
                              <span className="font-extrabold text-brand">
                                #{m.rank} — {developers.find((d) => d.id === m.developerId)?.name || m.developerId}
                              </span>
                              <p className="mt-0.5 text-[11px] text-fg-secondary">
                                {m.matchedCriteria.map((c) => `${c.key} (+${c.points})`).join(' • ')}
                              </p>
                            </div>
                            <span className="rounded-lg bg-brand px-2.5 py-1 font-extrabold text-white">
                              {m.matchStrength}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-danger-text mb-2">
                      المطورون المستبعدون وأسباب الرفض ({leadRanking.rejectedDevelopers?.length || 0}):
                    </h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(leadRanking.rejectedDevelopers || []).map((m) => (
                        <div
                          key={m.developerId}
                          onClick={() => {
                            setSelectedDeveloperId(m.developerId);
                            runPairInspection(selectedLeadId, m.developerId);
                          }}
                          className="cursor-pointer flex items-center justify-between rounded-xl border border-danger-border bg-danger-bg/40 p-3 text-xs hover:bg-danger-bg"
                        >
                          <div>
                            <span className="font-bold text-fg-primary">
                              {developers.find((d) => d.id === m.developerId)?.name || m.developerId}
                            </span>
                            <p className="mt-0.5 text-[11px] font-semibold text-danger-text">
                              {m.hardFailures.map((hf) => `${hf.key}: ${hf.reasonAr}`).join(' | ')}
                            </p>
                          </div>
                          <span className="rounded bg-danger-bg px-2 py-0.5 text-[10px] font-bold text-danger-text">
                            REJECTED
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'rules' ? (
          <div className="space-y-6">
            {/* Existing Rules Table */}
            <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <h2 className="text-sm font-extrabold text-fg-primary">
                قواعد المطابقة الموزونة (Layer B Configurable Matching Rules)
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-line bg-subtle text-fg-secondary">
                      <th className="p-2.5 font-bold">المفتاح (Key)</th>
                      <th className="p-2.5 font-bold">الاسم</th>
                      <th className="p-2.5 font-bold">الفئة</th>
                      <th className="p-2.5 font-bold">المجموعة (Group)</th>
                      <th className="p-2.5 font-bold">الأولوية</th>
                      <th className="p-2.5 font-bold">النقاط</th>
                      <th className="p-2.5 font-bold">الحالة</th>
                      <th className="p-2.5 font-bold">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rules.map((r) => (
                      <tr key={r.id} className="hover:bg-subtle">
                        <td className="p-2.5 font-mono text-[11px] font-bold text-fg-primary">
                          {r.key}
                        </td>
                        <td className="p-2.5 font-semibold text-fg-primary">
                          {r.name}
                          <span className="block text-[11px] text-fg-muted">{r.nameEn}</span>
                        </td>
                        <td className="p-2.5">
                          <span className="rounded bg-subtle px-2 py-0.5 font-bold text-fg-primary">
                            {r.category}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-fg-secondary">
                          {r.ruleGroup || '—'}
                        </td>
                        <td className="p-2.5 font-bold text-fg-primary">{r.priority}</td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            defaultValue={r.points}
                            onBlur={(e) => {
                              const val = Number(e.target.value);
                              if (!Number.isNaN(val) && val !== r.points) {
                                handleUpdateRulePoints(r, val);
                              }
                            }}
                            className="w-20 rounded-lg border border-line px-2 py-1 text-center font-bold text-fg-primary"
                          />
                        </td>
                        <td className="p-2.5">
                          <button
                            onClick={() => handleToggleRule(r)}
                            className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                              r.enabled
                                ? 'bg-brand-soft text-brand'
                                : 'bg-subtle text-fg-secondary'
                            }`}
                          >
                            {r.enabled ? 'مفعلة' : 'معطلة'}
                          </button>
                        </td>
                        <td className="p-2.5">
                          <button
                            onClick={() => handleDeleteRule(r.id, r.key)}
                            className="rounded-lg p-1.5 text-danger-text hover:bg-danger-bg"
                            title="حذف القاعدة"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add New Rule Form */}
            <form
              onSubmit={handleCreateRule}
              className="rounded-2xl border border-line bg-white p-5 shadow-sm space-y-4"
            >
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-fg-primary">
                <Plus className="h-4 w-4 text-brand" />
                إضافة قاعدة مطابقة قياسية جديدة (Create Matching Rule)
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    المفتاح (Rule Key):
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: CUSTOM_HIGH_OPP_BOOST"
                    value={newRuleKey}
                    onChange={(e) => setNewRuleKey(e.target.value)}
                    className="w-full rounded-xl border border-line px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    الاسم بالعربية:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مكافأة الفرصة البيعية المرتفعة"
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                    className="w-full rounded-xl border border-line px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    الفئة (Category):
                  </label>
                  <select
                    value={newRuleCategory}
                    onChange={(e) => setNewRuleCategory(e.target.value)}
                    className="w-full rounded-xl border border-line px-3 py-2 text-xs"
                  >
                    <option value="SERVICE">SERVICE</option>
                    <option value="NICHE">NICHE</option>
                    <option value="LOCATION">LOCATION</option>
                    <option value="BUDGET">BUDGET</option>
                    <option value="LEAD_TYPE">LEAD_TYPE</option>
                    <option value="QUALITY">QUALITY</option>
                    <option value="FRESHNESS">FRESHNESS</option>
                    <option value="PREFERENCE">PREFERENCE</option>
                    <option value="PERFORMANCE">PERFORMANCE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    الحقل الشرطي (Field):
                  </label>
                  <select
                    value={newRuleField}
                    onChange={(e) => setNewRuleField(e.target.value)}
                    className="w-full rounded-xl border border-line px-3 py-2 text-xs"
                  >
                    <option value="matchedPrimaryService">matchedPrimaryService</option>
                    <option value="leadOpportunityScore">leadOpportunityScore</option>
                    <option value="leadQualityScore">leadQualityScore</option>
                    <option value="hasPriorityPreferenceMatch">hasPriorityPreferenceMatch</option>
                    <option value="locationMatchTier">locationMatchTier</option>
                    <option value="budgetMatchTier">budgetMatchTier</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    المعامل (Operator):
                  </label>
                  <select
                    value={newRuleOperator}
                    onChange={(e) => setNewRuleOperator(e.target.value)}
                    className="w-full rounded-xl border border-line px-3 py-2 text-xs"
                  >
                    <option value="eq">eq (يساوي)</option>
                    <option value="neq">neq (لا يساوي)</option>
                    <option value="gte">gte (أكبر أو يساوي)</option>
                    <option value="gt">gt (أكبر من)</option>
                    <option value="lte">lte (أصغر أو يساوي)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    القيمة المستهدفة (Value) والنقاط:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={newRuleValue}
                      onChange={(e) => setNewRuleValue(e.target.value)}
                      className="w-full rounded-xl border border-line px-3 py-2 text-xs"
                      placeholder="true / 85"
                    />
                    <input
                      type="number"
                      required
                      value={newRulePoints}
                      onChange={(e) => setNewRulePoints(Number(e.target.value))}
                      className="w-24 rounded-xl border border-line px-3 py-2 text-xs font-bold"
                      placeholder="+5"
                    />
                  </div>
                </div>
              </div>
              <button
                type="submit"
                className="rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-hover"
              >
                إضافة القاعدة وحفظ الإصدار الجديد
              </button>
            </form>
          </div>
        ) : (
          config && (
            <form
              onSubmit={handleSaveConfig}
              className="rounded-2xl border border-line bg-white p-6 shadow-sm space-y-5"
            >
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-fg-primary">
                <Activity className="h-4 w-4 text-brand" />
                إعدادات سياسات الأهلية الإلزامية والبيانات غير المكتملة (MatchingConfig)
              </h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    نمط مطابقة الخدمات المتعددة (Service Match Mode):
                  </label>
                  <select
                    value={config.serviceMatchMode}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        serviceMatchMode: e.target.value as MatchingConfigState['serviceMatchMode'],
                      })
                    }
                    className="w-full rounded-xl border border-line px-3 py-2.5 text-xs font-semibold"
                  >
                    <option value="ALL_REQUIRED">ALL_REQUIRED (يجب دعم جميع خدمات العميل المطلوبة)</option>
                    <option value="ANY_REQUIRED">ANY_REQUIRED (يكفي دعم خدمة واحدة من المطلوبة)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    سياسة العملاء قيد المراجعة (REQUIRES_VERIFICATION Policy):
                  </label>
                  <select
                    value={config.requiresVerificationPolicy}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        requiresVerificationPolicy: e.target
                          .value as MatchingConfigState['requiresVerificationPolicy'],
                      })
                    }
                    className="w-full rounded-xl border border-line px-3 py-2.5 text-xs font-semibold"
                  >
                    <option value="EXCLUDE">EXCLUDE (استبعاد صارم من المطابقة)</option>
                    <option value="VERIFIED_DEVELOPERS_ONLY">
                      VERIFIED_DEVELOPERS_ONLY (للمطورين الموثقين فقط مع تنبيه)
                    </option>
                    <option value="INCLUDE_WITH_WARNING">
                      INCLUDE_WITH_WARNING (السماح مع تنبيه وتحذير)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    سياسة الموقع الجغرافي غير المعروف (Unknown Location Policy):
                  </label>
                  <select
                    value={config.unknownLocationPolicy}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        unknownLocationPolicy: e.target
                          .value as MatchingConfigState['unknownLocationPolicy'],
                      })
                    }
                    className="w-full rounded-xl border border-line px-3 py-2.5 text-xs font-semibold"
                  >
                    <option value="ALLOW_WITH_PENALTY">ALLOW_WITH_PENALTY (السماح مع خصم نقاط)</option>
                    <option value="REQUIRE_VERIFICATION">REQUIRE_VERIFICATION (يشترط التوثيق)</option>
                    <option value="FAIL">FAIL (رفض واستبعاد فوري)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    سياسة الميزانية غير المحددة (Unknown Budget Policy):
                  </label>
                  <select
                    value={config.unknownBudgetPolicy}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        unknownBudgetPolicy: e.target
                          .value as MatchingConfigState['unknownBudgetPolicy'],
                      })
                    }
                    className="w-full rounded-xl border border-line px-3 py-2.5 text-xs font-semibold"
                  >
                    <option value="ALLOW_WITH_PENALTY">ALLOW_WITH_PENALTY (السماح مع خصم نقاط)</option>
                    <option value="REQUIRE_VERIFICATION">REQUIRE_VERIFICATION (يشترط التوثيق)</option>
                    <option value="FAIL">FAIL (رفض واستبعاد فوري)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-fg-primary">
                  <input
                    type="checkbox"
                    checked={config.budgetHardRequirement}
                    onChange={(e) =>
                      setConfig({ ...config, budgetHardRequirement: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-line text-brand"
                  />
                  اشتراط توافق الميزانية كشرط إلزامي صارم (Hard Budget Gate)
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-fg-primary">
                  <input
                    type="checkbox"
                    checked={config.requireActiveSubscription}
                    onChange={(e) =>
                      setConfig({ ...config, requireActiveSubscription: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-line text-brand"
                  />
                  اشتراط وجود اشتراك نشط ورصيد نقاط موجب للمطابقة
                </label>
              </div>

              <button
                type="submit"
                className="rounded-xl bg-brand px-6 py-2.5 text-xs font-bold text-white hover:bg-brand-hover"
              >
                حفظ السياسات وترقية إصدار المطابقة
              </button>
            </form>
          )
        )}
      </div>
    </AppShell>
  );
}
