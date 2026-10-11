'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Tabs, TabItem } from '@/components/ui/Tabs';
import { Select } from '@/components/ui/Select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { localizeCity, localizeCategory } from '@/lib/taxonomy';
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
      const [leadsRes, devsRes, rulesRes] = await Promise.all([
        fetch('/api/admin/leads?limit=30'),
        fetch('/api/admin/users?role=DEVELOPER'),
        fetch('/api/admin/matching/rules'),
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
        if (rJson.config) {
          setConfig(rJson.config);
          if (rJson.config.currentVersion) {
            setMatchVersion(rJson.config.currentVersion);
          }
        } else if (rJson.matchVersion) {
          setMatchVersion(rJson.matchVersion);
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
      const [pairRes, rankingRes] = await Promise.all([
        fetch(
          `/api/matching/leads/${encodeURIComponent(leadId)}/developers/${encodeURIComponent(devId)}`
        ),
        fetch(
          `/api/matching/leads/${encodeURIComponent(leadId)}?includeRejected=true`
        ),
      ]);

      if (pairRes.ok) {
        const data = await pairRes.json();
        const report = data.debugReport || data;
        setDebugReport(report);
      } else {
        const err = await pairRes.json();
        setErrorBanner(err.error || 'تعذر فحص المطابقة.');
      }

      if (rankingRes.ok) {
        const rankData = await rankingRes.json();
        setLeadRanking(rankData);
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
      const res = await fetch('/api/admin/matching/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_CONFIG',
          serviceMatchMode: config.serviceMatchMode,
          unknownLocationPolicy: config.unknownLocationPolicy,
          unknownBudgetPolicy: config.unknownBudgetPolicy,
          requiresVerificationPolicy: config.requiresVerificationPolicy,
          budgetHardRequirement: config.budgetHardRequirement,
          requireActiveSubscription: config.requireActiveSubscription,
          requireDeveloperVerified: config.requireDeveloperVerified,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const v = d.matchVersion || d.config?.currentVersion || 'v2';
        setStatusBanner(t('configSaved', { version: v }));
        if (v) setMatchVersion(v);
        if (d.config) setConfig(d.config);
      } else {
        const err = await res.json();
        setErrorBanner(err.error || t('configError'));
      }
    } catch {
      setErrorBanner(t('configError'));
    }
  }

  const tGeo = useTranslations('geo');
  const tCat = useTranslations('categories');

  const matchingTabs: TabItem[] = [
    {
      id: 'debugger',
      label: t('tabDebugger'),
      icon: <Bug className="h-4 w-4" />,
    },
    {
      id: 'rules',
      label: `${t('tabRules')} (${rules.length})`,
      icon: <Sliders className="h-4 w-4" />,
    },
    {
      id: 'config',
      label: t('tabConstraints'),
      icon: <ShieldCheck className="h-4 w-4" />,
    },
  ];

  return (
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      <div className="space-y-6">
        {/* Template Standard PageHeader */}
        <PageHeader
          title={t('title')}
          description={t('desc')}
          breadcrumbs={[
            { label: t('title') },
          ]}
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-md border border-line-brand bg-brand-soft px-3 py-1 text-caption font-semibold text-brand tabular-nums">
                {t('activeVersion', { version: matchVersion })}
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRecalculateAll}
                disabled={recalculating}
                startIcon={<RefreshCw className={`h-4 w-4 ${recalculating ? 'animate-spin' : ''}`} />}
              >
                {recalculating ? t('recalculating') : t('btnRecalculate')}
              </Button>
            </div>
          }
        />

        {statusBanner && (
          <Banner variant="info" onClose={() => setStatusBanner(null)}>
            {statusBanner}
          </Banner>
        )}
        {errorBanner && (
          <Banner variant="danger" onClose={() => setErrorBanner(null)}>
            {errorBanner}
          </Banner>
        )}

        {/* Standard Design System Segmented Tabs */}
        <Tabs
          variant="segmented"
          tabs={matchingTabs}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as any)}
        />

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : activeTab === 'debugger' ? (
          <div className="space-y-6">
            {/* Lead & Developer Selector */}
            <Card className="rounded-xl border border-line bg-surface p-5 shadow-xs">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-body font-semibold text-fg-primary">
                  {t('title')}
                </CardTitle>
              </CardHeader>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-end">
                <Select
                  label={t('selectLead')}
                  value={selectedLeadId}
                  onChange={(e) => {
                    const nextLead = e.target.value;
                    setSelectedLeadId(nextLead);
                    if (nextLead && selectedDeveloperId) {
                      runPairInspection(nextLead, selectedDeveloperId);
                    }
                  }}
                  options={leads.map((l) => ({
                    value: l.id,
                    label: `${l.businessName} — ${localizeCategory(l.category, tCat as any)} • ${localizeCity(l.city, tGeo as any)} (${l.score})`,
                  }))}
                />

                <Select
                  label={t('selectDev')}
                  value={selectedDeveloperId}
                  onChange={(e) => {
                    const nextDev = e.target.value;
                    setSelectedDeveloperId(nextDev);
                    if (selectedLeadId && nextDev) {
                      runPairInspection(selectedLeadId, nextDev);
                    }
                  }}
                  options={developers.map((d) => ({
                    value: d.id,
                    label: `${d.name} (${d.email}) — ${d.status}`,
                  }))}
                />

                <div>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => runPairInspection(selectedLeadId, selectedDeveloperId)}
                    disabled={runningDebugger}
                    className="w-full"
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
                      ? 'border-line-brand bg-brand-soft'
                      : 'border-danger-border bg-danger-bg'
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
                        className={debugReport.eligible ? 'bg-brand text-fg-on-brand' : 'bg-danger-solid text-fg-on-brand'}
                      >
                        {debugReport.resultLabel} ({debugReport.eligible ? t('gateStatusPassed') : t('gateStatusFailed')})
                      </Badge>
                      <h3 className="mt-1 text-base font-extrabold text-fg-primary">
                        <bdi dir="auto">{debugReport.leadData.businessName}</bdi> ⇄ <bdi dir="auto">{debugReport.developerPreferences.name}</bdi>
                      </h3>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="rounded-xl bg-surface px-4 py-2 text-center shadow-xs border border-line">
                      <span className="block text-xs font-semibold text-fg-secondary">
                        {t('matchStrength')}
                      </span>
                      <span className="text-xl font-extrabold text-brand tabular-nums ltr-iso">
                        {debugReport.finalMatchStrength}/100
                      </span>
                    </div>
                    <div className="rounded-xl bg-surface px-4 py-2 text-center shadow-xs border border-line">
                      <span className="block text-xs font-semibold text-fg-secondary">
                        {t('totalFitScore')}
                      </span>
                      <span className="text-xl font-extrabold text-fg-primary tabular-nums ltr-iso">
                        {debugReport.matchPoints}
                      </span>
                    </div>
                    <div className="rounded-xl bg-surface px-4 py-2 text-center shadow-xs border border-line">
                      <span className="block text-xs font-semibold text-fg-secondary">
                        {t('colRule')}
                      </span>
                      <span className="text-xs font-extrabold text-fg-primary tabular-nums ltr-iso">
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
                  <div className="mt-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('colGate')}</TableHead>
                          <TableHead>{t('colGateStatus')}</TableHead>
                          <TableHead>الكود</TableHead>
                          <TableHead>{t('selectLead')}</TableHead>
                          <TableHead>{t('selectDev')}</TableHead>
                          <TableHead>{t('colGateReason')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {debugReport.hardEligibilityChecks.map((chk, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-bold text-fg-primary">{chk.dimension}</TableCell>
                            <TableCell>
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
                            </TableCell>
                            <TableCell className="text-xs font-semibold text-fg-primary ltr-iso">
                              {chk.code}
                            </TableCell>
                            <TableCell className="text-fg-primary">{chk.leadValue}</TableCell>
                            <TableCell className="text-fg-primary">{chk.developerPreference}</TableCell>
                            <TableCell className="font-semibold text-fg-primary">{chk.reasonAr}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
                            className="flex items-center justify-between rounded-xl border border-line-brand bg-brand-soft p-3 text-xs"
                          >
                            <div>
                              <span className="text-xs font-bold text-brand ltr-iso">
                                {rule.key} ({rule.category})
                              </span>
                              <p className="mt-0.5 font-semibold text-fg-primary">{rule.reasonAr}</p>
                            </div>
                            <span
                              className={`rounded-lg px-2.5 py-1 text-xs font-extrabold tabular-nums ltr-iso ${
                                rule.points >= 0
                                  ? 'bg-brand text-fg-on-brand'
                                  : 'bg-warning-text text-fg-on-brand'
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
                            <span className="text-xs font-bold text-fg-primary ltr-iso">
                              {rule.key} ({rule.category})
                            </span>
                            <p className="mt-0.5 text-fg-secondary">{rule.reasonAr}</p>
                          </div>
                          <span className="rounded bg-subtle px-2 py-0.5 text-xs font-bold text-fg-secondary tabular-nums ltr-iso">
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
                            className="cursor-pointer flex items-center justify-between rounded-xl border border-line-brand bg-brand-soft p-3 text-xs hover:bg-brand-soft-strong transition-colors"
                          >
                            <div>
                              <span className="font-extrabold text-brand">
                                #{m.rank} - <bdi dir="auto">{developers.find((d) => d.id === m.developerId)?.name || m.developerId}</bdi>
                              </span>
                              <p className="mt-0.5 text-xs text-fg-secondary">
                                {m.matchedCriteria.map((c) => `${c.key} (+${c.points})`).join(' • ')}
                              </p>
                            </div>
                            <span className="rounded-lg bg-brand px-2.5 py-1 font-extrabold text-fg-on-brand tabular-nums ltr-iso">
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
                          className="cursor-pointer flex items-center justify-between rounded-xl border border-danger-border bg-danger-bg p-3 text-xs hover:bg-danger-bg transition-colors"
                        >
                          <div>
                            <span className="font-bold text-fg-primary">
                              <bdi dir="auto">{developers.find((d) => d.id === m.developerId)?.name || m.developerId}</bdi>
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
              <div className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المفتاح</TableHead>
                      <TableHead>{t('colRule')}</TableHead>
                      <TableHead>الفئة</TableHead>
                      <TableHead>المجموعة</TableHead>
                      <TableHead>الأولوية</TableHead>
                      <TableHead>{t('colWeight')}</TableHead>
                      <TableHead>{t('colGateStatus')}</TableHead>
                      <TableHead>إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs font-bold text-fg-primary ltr-iso">
                          {r.key}
                        </TableCell>
                        <TableCell className="font-semibold text-fg-primary">
                          {r.name}
                          <span className="block text-xs text-fg-muted ltr-iso">{r.nameEn}</span>
                        </TableCell>
                        <TableCell>
                          <span className="rounded bg-subtle px-2 py-0.5 font-bold text-fg-primary text-xs">
                            {r.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-fg-secondary ltr-iso">
                          {r.ruleGroup || '-'}
                        </TableCell>
                        <TableCell className="font-bold text-fg-primary tabular-nums">{r.priority}</TableCell>
                        <TableCell>
                          <input
                            type="number"
                            defaultValue={r.points}
                            onBlur={(e) => {
                              const val = Number(e.target.value);
                              if (!Number.isNaN(val) && val !== r.points) {
                                handleUpdateRulePoints(r, val);
                              }
                            }}
                            className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-center font-bold text-fg-primary tabular-nums text-xs"
                          />
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => handleDeleteRule(r.id, r.key)}
                            className="rounded-lg p-1.5 text-danger-text hover:bg-danger-bg"
                            title="حذف القاعدة"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                  <Select
                    label="الفئة:"
                    value={newRuleCategory}
                    onChange={(e) => setNewRuleCategory(e.target.value)}
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
                  </Select>
                </div>
                <div>
                  <Select
                    label="الحقل الشرطي:"
                    value={newRuleField}
                    onChange={(e) => setNewRuleField(e.target.value)}
                  >
                    <option value="matchedPrimaryService">matchedPrimaryService</option>
                    <option value="leadOpportunityScore">leadOpportunityScore</option>
                    <option value="leadQualityScore">leadQualityScore</option>
                    <option value="hasPriorityPreferenceMatch">hasPriorityPreferenceMatch</option>
                    <option value="locationMatchTier">locationMatchTier</option>
                    <option value="budgetMatchTier">budgetMatchTier</option>
                  </Select>
                </div>
                <div>
                  <Select
                    label="المعامل:"
                    value={newRuleOperator}
                    onChange={(e) => setNewRuleOperator(e.target.value)}
                  >
                    <option value="eq">eq (يساوي)</option>
                    <option value="neq">neq (لا يساوي)</option>
                    <option value="gte">gte (أكبر أو يساوي)</option>
                    <option value="gt">gt (أكبر من)</option>
                    <option value="lte">lte (أصغر أو يساوي)</option>
                  </Select>
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
                      className="w-24 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold tabular-nums text-fg-primary"
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
        ) : config ? (
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
                  <Select
                    label="نمط مطابقة الخدمات المتعددة:"
                    value={config.serviceMatchMode}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        serviceMatchMode: e.target.value as MatchingConfigState['serviceMatchMode'],
                      })
                    }
                  >
                    <option value="ALL_REQUIRED">ALL_REQUIRED (يجب دعم جميع خدمات العميل المطلوبة)</option>
                    <option value="ANY_REQUIRED">ANY_REQUIRED (يكفي دعم خدمة واحدة من المطلوبة)</option>
                  </Select>
                </div>

                <div>
                  <Select
                    label="سياسة العملاء قيد المراجعة:"
                    value={config.requiresVerificationPolicy}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        requiresVerificationPolicy: e.target
                          .value as MatchingConfigState['requiresVerificationPolicy'],
                      })
                    }
                  >
                    <option value="EXCLUDE">EXCLUDE (استبعاد صارم من المطابقة)</option>
                    <option value="VERIFIED_DEVELOPERS_ONLY">
                      VERIFIED_DEVELOPERS_ONLY (للمطورين الموثقين فقط مع تنبيه)
                    </option>
                    <option value="INCLUDE_WITH_WARNING">
                      INCLUDE_WITH_WARNING (السماح مع تنبيه وتحذير)
                    </option>
                  </Select>
                </div>

                <div>
                  <Select
                    label="سياسة الموقع الجغرافي غير المعروف:"
                    value={config.unknownLocationPolicy}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        unknownLocationPolicy: e.target
                          .value as MatchingConfigState['unknownLocationPolicy'],
                      })
                    }
                  >
                    <option value="ALLOW_WITH_PENALTY">ALLOW_WITH_PENALTY (السماح مع خصم نقاط)</option>
                    <option value="REQUIRE_VERIFICATION">REQUIRE_VERIFICATION (يشترط التوثيق)</option>
                    <option value="FAIL">FAIL (رفض واستبعاد فوري)</option>
                  </Select>
                </div>

                <div>
                  <Select
                    label="سياسة الميزانية غير المحددة:"
                    value={config.unknownBudgetPolicy}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        unknownBudgetPolicy: e.target
                          .value as MatchingConfigState['unknownBudgetPolicy'],
                      })
                    }
                  >
                    <option value="ALLOW_WITH_PENALTY">ALLOW_WITH_PENALTY (السماح مع خصم نقاط)</option>
                    <option value="REQUIRE_VERIFICATION">REQUIRE_VERIFICATION (يشترط التوثيق)</option>
                    <option value="FAIL">FAIL (رفض واستبعاد فوري)</option>
                  </Select>
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
          ) : (
            <EmptyState
              title={t('configNotAvailableTitle')}
              description={t('configNotAvailableDesc')}
            />
          )}
      </div>
    </AppShell>
  );
}
