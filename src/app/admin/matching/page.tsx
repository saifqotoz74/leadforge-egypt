'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
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
  ArrowRight,
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
  };
  developerPreferences: {
    id: string;
    name: string;
    companyName: string | null;
    status: string;
    isVerified: boolean;
    nicheFocus: string[];
    serviceOfferings: string[];
    targetGovernorates: string[];
    targetCities: string[];
    minBudget: number | null;
    maxBudget: number | null;
    preferredLeadTypes: string[];
    minimumLeadScore: number;
    maximumActiveClaims: number;
  };
  hardEligibilityChecks: DebugCheckRecord[];
  appliedRules: Array<{
    key: string;
    category: string;
    points: number;
    reason: string;
    reasonAr: string;
  }>;
  unappliedRules: Array<{
    key: string;
    category: string;
    reason: string;
    reasonAr: string;
    outcome?: string;
  }>;
}

interface DeveloperMatchRanking {
  developerId: string;
  matchStrength: number;
  rawPoints: number;
  rank: number;
  eligible: boolean;
  matchedCriteria: Array<{ key: string; points: number }>;
  hardFailures: Array<{ key: string; reason: string; reasonAr: string }>;
}

export default function AdminMatchingPage() {
  const t = useTranslations('adminMatching');
  const [activeTab, setActiveTab] = useState<'debugger' | 'rules' | 'config'>('debugger');
  const [loading, setLoading] = useState(true);
  const [matchVersion, setMatchVersion] = useState('v1.0');
  const [recalculating, setRecalculating] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Debugger state
  const [leads, setLeads] = useState<SimpleLeadItem[]>([]);
  const [developers, setDevelopers] = useState<SimpleDeveloperItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [selectedDeveloperId, setSelectedDeveloperId] = useState<string>('');
  const [debugReport, setDebugReport] = useState<DebugReportData | null>(null);
  const [runningDebugger, setRunningDebugger] = useState(false);
  const [leadRanking, setLeadRanking] = useState<{
    leadId: string;
    eligibleDevelopers: DeveloperMatchRanking[];
    rejectedDevelopers: DeveloperMatchRanking[];
    diagnostics: { summary: string; summaryAr: string };
  } | null>(null);

  // Rules state
  const [rules, setRules] = useState<MatchingRuleItem[]>([]);
  const [newRuleKey, setNewRuleKey] = useState('');
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState('SERVICE');
  const [newRulePoints, setNewRulePoints] = useState(10);
  const [newRuleField, setNewRuleField] = useState('matchedPrimaryService');
  const [newRuleOperator, setNewRuleOperator] = useState('eq');
  const [newRuleValue, setNewRuleValue] = useState('true');

  // Config state
  const [config, setConfig] = useState<MatchingConfigState | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const [leadsRes, devsRes, rulesRes, cfgRes] = await Promise.all([
        fetch('/api/admin/leads?limit=30'),
        fetch('/api/admin/users?role=DEVELOPER'),
        fetch('/api/admin/matching/rules'),
        fetch('/api/admin/matching/config'),
      ]);

      if (leadsRes.ok) {
        const leadJson = await leadsRes.json();
        const leadItems = leadJson.leads || leadJson.data || [];
        setLeads(leadItems);
        if (leadItems.length > 0) {
          setSelectedLeadId(leadItems[0].id);
        }
      }

      if (devsRes.ok) {
        const devJson = await devsRes.json();
        const devItems = devJson.users || devJson.data || [];
        setDevelopers(devItems);
        if (devItems.length > 0) {
          setSelectedDeveloperId(devItems[0].id);
        }
      }

      if (rulesRes.ok) {
        const rJson = await rulesRes.json();
        setRules(rJson.rules || []);
        if (rJson.version) setMatchVersion(rJson.version);
      }

      if (cfgRes.ok) {
        const cJson = await cfgRes.json();
        setConfig(cJson.config || null);
        if (cJson.config?.currentVersion) {
          setMatchVersion(cJson.config.currentVersion);
        }
      }
    } catch {
      setErrorBanner('تعذر تحميل بيانات المحرك التشخيصي.');
    } finally {
      setLoading(false);
    }
  }

  async function runPairInspection(leadId: string, devId: string) {
    if (!leadId || !devId) return;
    setRunningDebugger(true);
    setErrorBanner(null);
    try {
      const res = await fetch(
        `/api/admin/matching/debug?leadId=${encodeURIComponent(leadId)}&developerId=${encodeURIComponent(devId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setDebugReport(data.report);
        if (data.leadRanking) {
          setLeadRanking(data.leadRanking);
        }
      } else {
        const err = await res.json();
        setErrorBanner(err.error || 'تعذر فحص المطابقة.');
      }
    } catch {
      setErrorBanner('حدث خطأ أثناء فحص المطابقة.');
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
      });
      if (res.ok) {
        const d = await res.json();
        setStatusBanner(
          `تم إعادة حساب ${d.matchesCount || 0} مطابقة بنجاح للإصدار ${d.version || matchVersion}.`
        );
        if (selectedLeadId && selectedDeveloperId) {
          runPairInspection(selectedLeadId, selectedDeveloperId);
        }
      } else {
        const err = await res.json();
        setErrorBanner(err.error || 'فشلت عملية إعادة الحساب.');
      }
    } catch {
      setErrorBanner('خطأ في الاتصال بالخادم.');
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
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, enabled: !rule.enabled } : r))
        );
        setStatusBanner(`تم تغيير حالة القاعدة ${rule.key}`);
      }
    } catch {
      setErrorBanner('تعذر تحديث حالة القاعدة.');
    }
  }

  async function handleUpdateRulePoints(rule: MatchingRuleItem, points: number) {
    try {
      const res = await fetch(`/api/admin/matching/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      });
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, points } : r))
        );
        setStatusBanner(`تم تعديل نقاط القاعدة ${rule.key} إلى ${points}`);
      }
    } catch {
      setErrorBanner('تعذر تحديث نقاط القاعدة.');
    }
  }

  async function handleDeleteRule(ruleId: string, ruleKey: string) {
    if (!confirm(`هل أنت متأكد من حذف القاعدة ${ruleKey}؟`)) return;
    try {
      const res = await fetch(`/api/admin/matching/rules/${ruleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
        setStatusBanner(`تم حذف القاعدة ${ruleKey}`);
      }
    } catch {
      setErrorBanner('تعذر حذف القاعدة.');
    }
  }

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newRuleKey || !newRuleName) return;
    try {
      const conditionPayload: Record<string, unknown> = {};
      conditionPayload[newRuleField] = {
        operator: newRuleOperator,
        value: newRuleValue === 'true' ? true : newRuleValue === 'false' ? false : newRuleValue,
      };

      const res = await fetch('/api/admin/matching/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newRuleKey,
          name: newRuleName,
          category: newRuleCategory,
          points: newRulePoints,
          condition: conditionPayload,
          priority: 50,
          enabled: true,
        }),
      });

      if (res.ok) {
        const d = await res.json();
        setRules((prev) => [...prev, d.rule]);
        setStatusBanner(`تم إنشاء القاعدة ${newRuleKey} وترقية الإصدار إلى ${d.version || 'الجديد'}`);
        setNewRuleKey('');
        setNewRuleName('');
        if (d.version) setMatchVersion(d.version);
      } else {
        const err = await res.json();
        setErrorBanner(err.error || 'فشل إنشاء القاعدة.');
      }
    } catch {
      setErrorBanner('خطأ أثناء حفظ القاعدة.');
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    try {
      const res = await fetch('/api/admin/matching/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        const d = await res.json();
        setStatusBanner(t('configSaved', { version: d.version || 'v2' }));
        if (d.version) setMatchVersion(d.version);
      } else {
        const err = await res.json();
        setErrorBanner(err.error || t('configError'));
      }
    } catch {
      setErrorBanner(t('configError'));
    }
  }

  return (
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      <div className="space-y-6">
        {/* Top Header Card */}
        <Card className="rounded-xl border border-line bg-surface p-6 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <Compass className="h-6 w-6 text-brand rtl:-scale-x-100" />
                <h1 className="text-xl font-extrabold text-fg-primary">
                  {t('title')}
                </h1>
              </div>
              <p className="mt-1 text-xs text-fg-secondary">
                {t('desc')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-xl border border-line-brand bg-brand-soft px-3 py-1.5 text-xs font-extrabold text-brand font-mono tabular-nums">
                {t('activeVersion', { version: matchVersion })}
              </span>
              <Button
                variant="primary"
                onClick={handleRecalculateAll}
                disabled={recalculating}
                className="gap-2 text-xs"
              >
                <RefreshCw className={`h-4 w-4 ${recalculating ? 'animate-spin' : ''}`} />
                {recalculating ? t('recalculating') : t('btnRecalculate')}
              </Button>
            </div>
          </div>
        </Card>

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
        <div className="flex flex-wrap items-center gap-2 border-b border-line pb-4">
          <Button
            variant={activeTab === 'debugger' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab('debugger')}
            className="gap-2 text-xs"
          >
            <Bug className="h-4 w-4" />
            <span>{t('tabDebugger')}</span>
          </Button>
          <Button
            variant={activeTab === 'rules' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab('rules')}
            className="gap-2 text-xs"
          >
            <Sliders className="h-4 w-4" />
            <span>{t('tabRules')} ({rules.length})</span>
          </Button>
          <Button
            variant={activeTab === 'config' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab('config')}
            className="gap-2 text-xs"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{t('tabConstraints')}</span>
          </Button>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : activeTab === 'debugger' ? (
          <div className="space-y-6">
            {/* Lead & Developer Selector */}
            <Card className="rounded-xl border border-line bg-surface p-5 shadow-xs">
              <h2 className="text-sm font-extrabold text-fg-primary">
                {t('title')}:
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1.5">
                    {t('selectLead')}
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
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-semibold text-fg-primary"
                  >
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.businessName} — ({l.category} | {l.city} | {l.score})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1.5">
                    {t('selectDev')}
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
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-semibold text-fg-primary"
                  >
                    {developers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.email}) — [{d.status}]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <Button
                    variant="primary"
                    onClick={() => runPairInspection(selectedLeadId, selectedDeveloperId)}
                    disabled={runningDebugger}
                    className="w-full text-xs"
                  >
                    {runningDebugger ? t('recalculating') : t('btnEvaluate')}
                  </Button>
                </div>
              </div>
            </Card>

            {!debugReport && !runningDebugger ? (
              <EmptyState
                title={t('noData')}
                description={t('desc')}
              />
            ) : debugReport ? (
              <div className="space-y-6">
                {/* Summary Banner */}
                <Card
                  className={`flex flex-col justify-between gap-4 rounded-xl border p-5 sm:flex-row sm:items-center ${
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
                      <Badge
                        variant={debugReport.eligible ? 'brand' : 'neutral'}
                        className={debugReport.eligible ? 'bg-brand text-fg-inverted' : 'bg-danger-fill text-fg-inverted'}
                      >
                        {debugReport.resultLabel} ({debugReport.eligible ? t('gateStatusPassed') : t('gateStatusFailed')})
                      </Badge>
                      <h3 className="mt-1 text-base font-extrabold text-fg-primary">
                        {debugReport.leadData.businessName} ⇄ {debugReport.developerPreferences.name}
                      </h3>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="rounded-xl bg-surface px-4 py-2 text-center shadow-xs border border-line">
                      <span className="block text-xs font-semibold text-fg-secondary">
                        {t('matchStrength')}
                      </span>
                      <span className="text-xl font-extrabold text-brand font-mono tabular-nums">
                        {debugReport.finalMatchStrength}/100
                      </span>
                    </div>
                    <div className="rounded-xl bg-surface px-4 py-2 text-center shadow-xs border border-line">
                      <span className="block text-xs font-semibold text-fg-secondary">
                        {t('totalFitScore')}
                      </span>
                      <span className="text-xl font-extrabold text-fg-primary font-mono tabular-nums">
                        {debugReport.matchPoints}
                      </span>
                    </div>
                    <div className="rounded-xl bg-surface px-4 py-2 text-center shadow-xs border border-line">
                      <span className="block text-xs font-semibold text-fg-secondary">
                        {t('colRule')}
                      </span>
                      <span className="text-xs font-extrabold text-fg-primary font-mono tabular-nums">
                        Q: {debugReport.leadData.qualityScore} | Opp: {debugReport.leadData.opportunityScore}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Layer A: Hard Eligibility Gate Checks */}
                <Card className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                  <h3 className="text-sm font-extrabold text-fg-primary">
                    {t('layerATitle')}
                  </h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-start text-xs">
                      <thead>
                        <tr className="border-b border-line bg-subtle text-fg-secondary">
                          <th className="p-2.5 font-bold text-start">{t('colGate')}</th>
                          <th className="p-2.5 font-bold text-start">{t('colGateStatus')}</th>
                          <th className="p-2.5 font-bold text-start">الكود</th>
                          <th className="p-2.5 font-bold text-start">{t('selectLead')}</th>
                          <th className="p-2.5 font-bold text-start">{t('selectDev')}</th>
                          <th className="p-2.5 font-bold text-start">{t('colGateReason')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {debugReport.hardEligibilityChecks.map((chk, idx) => (
                          <tr key={idx} className="hover:bg-subtle/70">
                            <td className="p-2.5 font-bold text-fg-primary">{chk.dimension}</td>
                            <td className="p-2.5">
                              {chk.status === 'PASS' ? (
                                <Badge variant="brand" className="gap-1 text-xs">
                                  <CheckCircle2 className="h-3 w-3" /> PASS
                                </Badge>
                              ) : chk.status === 'WARN' ? (
                                <Badge variant="neutral" className="gap-1 text-xs bg-warning-bg text-warning-text border-warning-border">
                                  <AlertTriangle className="h-3 w-3" /> WARN
                                </Badge>
                              ) : (
                                <Badge variant="neutral" className="gap-1 text-xs bg-danger-bg text-danger-text border-danger-border">
                                  <XCircle className="h-3 w-3" /> FAIL
                                </Badge>
                              )}
                            </td>
                            <td className="p-2.5 font-mono text-xs font-semibold text-fg-primary">
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
                </Card>

                {/* Layer B: Soft Matching Rules Breakdown */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                    <h3 className="text-sm font-extrabold text-brand">
                      {t('layerBTitle')}
                    </h3>
                    {debugReport.appliedRules.length === 0 ? (
                      <p className="mt-4 text-xs text-fg-secondary">
                        {t('noData')}
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {debugReport.appliedRules.map((rule) => (
                          <div
                            key={rule.key}
                            className="flex items-center justify-between rounded-xl border border-line-brand bg-brand-soft/40 p-3 text-xs"
                          >
                            <div>
                              <span className="font-mono text-xs font-bold text-brand">
                                {rule.key} ({rule.category})
                              </span>
                              <p className="mt-0.5 font-semibold text-fg-primary">{rule.reasonAr}</p>
                            </div>
                            <span
                              className={`rounded-lg px-2.5 py-1 text-xs font-extrabold font-mono tabular-nums ${
                                rule.points >= 0
                                  ? 'bg-brand text-fg-inverted'
                                  : 'bg-warning-text text-fg-inverted'
                              }`}
                            >
                              {rule.points >= 0 ? `+${rule.points}` : rule.points}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                    <h3 className="text-sm font-extrabold text-fg-primary">
                      {t('tabRules')} (Unapplied Rules)
                    </h3>
                    <div className="mt-3 max-h-80 overflow-y-auto space-y-2">
                      {debugReport.unappliedRules.map((rule) => (
                        <div
                          key={rule.key}
                          className="flex items-center justify-between rounded-xl border border-line bg-subtle p-2.5 text-xs"
                        >
                          <div>
                            <span className="font-mono text-xs font-bold text-fg-primary">
                              {rule.key} ({rule.category})
                            </span>
                            <p className="mt-0.5 text-fg-secondary">{rule.reasonAr}</p>
                          </div>
                          <span className="rounded bg-subtle px-2 py-0.5 text-xs font-bold text-fg-secondary font-mono">
                            {rule.outcome || '0'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>
            ) : null}

            {/* All Ranked Developers for Selected Lead */}
            {leadRanking && (
              <Card className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-fg-primary">
                    <Users className="h-4 w-4 text-brand" />
                    {leadRanking.diagnostics.summaryAr}
                  </h3>
                  <span className="text-xs font-semibold text-fg-secondary">
                    {leadRanking.diagnostics.summary}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-bold text-brand mb-2">
                      المطورون المؤهلون ({leadRanking.eligibleDevelopers.length}):
                    </h4>
                    {leadRanking.eligibleDevelopers.length === 0 ? (
                      <div className="rounded-xl border border-warning-border bg-warning-bg p-3 text-xs text-warning-text font-semibold">
                        لا يوجد مطورون مؤهلون لهذا العميل حاليًا.
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
                            className="cursor-pointer flex items-center justify-between rounded-xl border border-line-brand bg-brand-soft/40 p-3 text-xs hover:bg-brand-soft transition-colors"
                          >
                            <div>
                              <span className="font-extrabold text-brand">
                                #{m.rank} — {developers.find((d) => d.id === m.developerId)?.name || m.developerId}
                              </span>
                              <p className="mt-0.5 text-xs text-fg-secondary">
                                {m.matchedCriteria.map((c) => `${c.key} (+${c.points})`).join(' • ')}
                              </p>
                            </div>
                            <span className="rounded-lg bg-brand px-2.5 py-1 font-extrabold text-fg-inverted font-mono tabular-nums">
                              {m.matchStrength}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-danger-text mb-2">
                      المطورون المستبعدون ({leadRanking.rejectedDevelopers?.length || 0}):
                    </h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(leadRanking.rejectedDevelopers || []).map((m) => (
                        <div
                          key={m.developerId}
                          onClick={() => {
                            setSelectedDeveloperId(m.developerId);
                            runPairInspection(selectedLeadId, m.developerId);
                          }}
                          className="cursor-pointer flex items-center justify-between rounded-xl border border-danger-border bg-danger-bg/40 p-3 text-xs hover:bg-danger-bg transition-colors"
                        >
                          <div>
                            <span className="font-bold text-fg-primary">
                              {developers.find((d) => d.id === m.developerId)?.name || m.developerId}
                            </span>
                            <p className="mt-0.5 text-xs font-semibold text-danger-text">
                              {m.hardFailures.map((hf) => `${hf.key}: ${hf.reasonAr}`).join(' | ')}
                            </p>
                          </div>
                          <span className="rounded bg-danger-bg px-2 py-0.5 text-xs font-bold text-danger-text">
                            REJECTED
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        ) : activeTab === 'rules' ? (
          <div className="space-y-6">
            {/* Existing Rules Table */}
            <Card className="rounded-xl border border-line bg-surface p-5 shadow-xs">
              <h2 className="text-sm font-extrabold text-fg-primary">
                {t('tabRules')}
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-line bg-subtle text-fg-secondary">
                      <th className="p-2.5 font-bold text-start">المفتاح</th>
                      <th className="p-2.5 font-bold text-start">{t('colRule')}</th>
                      <th className="p-2.5 font-bold text-start">الفئة</th>
                      <th className="p-2.5 font-bold text-start">المجموعة</th>
                      <th className="p-2.5 font-bold text-start">الأولوية</th>
                      <th className="p-2.5 font-bold text-start">{t('colWeight')}</th>
                      <th className="p-2.5 font-bold text-start">{t('colGateStatus')}</th>
                      <th className="p-2.5 font-bold text-start">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rules.map((r) => (
                      <tr key={r.id} className="hover:bg-subtle">
                        <td className="p-2.5 font-mono text-xs font-bold text-fg-primary">
                          {r.key}
                        </td>
                        <td className="p-2.5 font-semibold text-fg-primary">
                          {r.name}
                          <span className="block text-xs text-fg-muted font-mono">{r.nameEn}</span>
                        </td>
                        <td className="p-2.5">
                          <span className="rounded bg-subtle px-2 py-0.5 font-bold text-fg-primary text-xs">
                            {r.category}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono text-xs text-fg-secondary">
                          {r.ruleGroup || '—'}
                        </td>
                        <td className="p-2.5 font-bold text-fg-primary font-mono tabular-nums">{r.priority}</td>
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
                            className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-center font-bold text-fg-primary font-mono tabular-nums text-xs"
                          />
                        </td>
                        <td className="p-2.5">
                          <button
                            onClick={() => handleToggleRule(r)}
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
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
            </Card>

            {/* Add New Rule Form */}
            <form
              onSubmit={handleCreateRule}
              className="rounded-xl border border-line bg-surface p-5 shadow-xs space-y-4"
            >
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-fg-primary">
                <Plus className="h-4 w-4 text-brand" />
                إضافة قاعدة مطابقة قياسية جديدة
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    المفتاح:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: CUSTOM_RULE"
                    value={newRuleKey}
                    onChange={(e) => setNewRuleKey(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg-primary"
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
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    الفئة:
                  </label>
                  <select
                    value={newRuleCategory}
                    onChange={(e) => setNewRuleCategory(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg-primary"
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
                    الحقل الشرطي:
                  </label>
                  <select
                    value={newRuleField}
                    onChange={(e) => setNewRuleField(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg-primary"
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
                    المعامل:
                  </label>
                  <select
                    value={newRuleOperator}
                    onChange={(e) => setNewRuleOperator(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg-primary"
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
                    القيمة المستهدفة والنقاط:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={newRuleValue}
                      onChange={(e) => setNewRuleValue(e.target.value)}
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg-primary"
                      placeholder="true / 85"
                    />
                    <input
                      type="number"
                      required
                      value={newRulePoints}
                      onChange={(e) => setNewRulePoints(Number(e.target.value))}
                      className="w-24 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold font-mono tabular-nums text-fg-primary"
                      placeholder="+5"
                    />
                  </div>
                </div>
              </div>
              <Button
                variant="primary"
                type="submit"
                className="gap-2 text-xs"
              >
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                إضافة القاعدة وحفظ الإصدار الجديد
              </Button>
            </form>
          </div>
        ) : (
          config && (
            <form
              onSubmit={handleSaveConfig}
              className="rounded-xl border border-line bg-surface p-6 shadow-xs space-y-5"
            >
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-fg-primary">
                <Activity className="h-4 w-4 text-brand rtl:-scale-x-100" />
                {t('tabConstraints')}
              </h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    نمط مطابقة الخدمات المتعددة:
                  </label>
                  <select
                    value={config.serviceMatchMode}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        serviceMatchMode: e.target.value as MatchingConfigState['serviceMatchMode'],
                      })
                    }
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-semibold text-fg-primary"
                  >
                    <option value="ALL_REQUIRED">ALL_REQUIRED (يجب دعم جميع خدمات العميل المطلوبة)</option>
                    <option value="ANY_REQUIRED">ANY_REQUIRED (يكفي دعم خدمة واحدة من المطلوبة)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    سياسة العملاء قيد المراجعة:
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
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-semibold text-fg-primary"
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
                    سياسة الموقع الجغرافي غير المعروف:
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
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-semibold text-fg-primary"
                  >
                    <option value="ALLOW_WITH_PENALTY">ALLOW_WITH_PENALTY (السماح مع خصم نقاط)</option>
                    <option value="REQUIRE_VERIFICATION">REQUIRE_VERIFICATION (يشترط التوثيق)</option>
                    <option value="FAIL">FAIL (رفض واستبعاد فوري)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg-primary mb-1">
                    سياسة الميزانية غير المحددة:
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
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-semibold text-fg-primary"
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
                  اشتراط توافق الميزانية كشرط إلزامي صارم
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

              <Button
                variant="primary"
                type="submit"
                className="gap-2 text-xs"
              >
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                {t('saveConfig')}
              </Button>
            </form>
          )
        )}
      </div>
    </AppShell>
  );
}
