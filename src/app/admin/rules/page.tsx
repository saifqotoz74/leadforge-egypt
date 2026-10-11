'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { RuleWeightEditor, ScoringRule } from '@/components/domain/RuleWeightEditor';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Banner } from '@/components/ui/Banner';
import { Dialog } from '@/components/ui/Dialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Plus, RefreshCw, Trash2, ArrowUpRight } from 'lucide-react';

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
  const t = useTranslations('adminRules');
  const locale = useLocale();
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

  async function handleUpdateRule(ruleId: string, changes: Partial<RuleItem>) {
    setMsg(null);
    setErrorMsg(null);
    const existing = rules.find((r) => r.id === ruleId);
    if (!existing) return;

    const res = await fetch(`/api/admin/rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...existing, ...changes }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg(t('updateSuccess'));
      await loadRules();
    } else {
      setErrorMsg(data.error || t('updateError'));
    }
  }

  async function handleSaveWeights(updatedRules: ScoringRule[]) {
    for (const r of updatedRules) {
      if (r.weight !== r.originalWeight) {
        await handleUpdateRule(r.id, { weight: r.weight, points: r.weight });
      }
    }
  }

  async function handleDeleteRule(ruleId: string) {
    setMsg(null);
    setErrorMsg(null);
    const res = await fetch(`/api/admin/rules/${ruleId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg(t('deleteSuccess'));
      await loadRules();
    } else {
      setErrorMsg(data.error || t('deleteError'));
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
      setMsg(t('createSuccess'));
      await loadRules();
    } else {
      setErrorMsg(data.error || t('createError'));
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
        const ver = data.report?.scoringVersion || data.scoringVersion || scoringVersion;
        setScoringVersion(ver);
        setMsg(t('recalcSuccess', { processed }));
      } else {
        setErrorMsg(data.error || t('updateError'));
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
        setMsg(t('bumpSuccess', { version: ver }));
        await loadRules();
      } else {
        setErrorMsg(data.error || t('updateError'));
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
      setMsg(t('updateSuccess'));
    } else {
      setErrorMsg(t('updateError'));
    }
  }

  const scoringRulesForEditor: ScoringRule[] = rules.map((r) => ({
    id: r.id,
    name: locale === 'en' ? r.nameEn || r.name : r.name,
    conditionDescription: `${r.field} ${r.operator} ${r.targetValue}`,
    expressionCode: r.code || r.key || r.id,
    weight: r.weight,
    originalWeight: r.weight,
  }));

  return (
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('title')}
          description={t('desc', { version: scoringVersion })}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBumpVersion}
                isLoading={recalculating}
                className="gap-1.5"
              >
                <ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" />
                <span>{t('btnBumpVersion')}</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleRecalculateAll}
                isLoading={recalculating}
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" />
                <span>{t('btnRecalculate')}</span>
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowNewModal(true)}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>{t('btnAddRule')}</span>
              </Button>
            </div>
          }
        />

        {msg && <Banner variant="info">{msg}</Banner>}
        {errorMsg && <Banner variant="danger">{errorMsg}</Banner>}

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyDesc')}
            action={{
              label: t('btnAddRule'),
              onClick: () => setShowNewModal(true),
            }}
          />
        ) : (
          <>
            {/* Rule Weight Editor Component per Spec 7.14 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>{t('rulesWeightTitle')}</CardTitle>
                <span className="text-caption text-fg-muted tabular-nums">
                  {t('activeRulesCount', { count: rules.length })}
                </span>
              </CardHeader>
              <CardContent>
                <RuleWeightEditor
                  initialRules={scoringRulesForEditor}
                  onSave={handleSaveWeights}
                />
              </CardContent>
            </Card>

            {/* Individual Rule Management (Enable/Disable & Delete) */}
            <Card>
              <CardHeader>
                <CardTitle>{t('manageRulesTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="rounded-xl border border-line bg-surface p-4 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-semibold text-body-sm text-fg-primary line-clamp-1">
                            {locale === 'en' ? rule.nameEn || rule.name : rule.name}
                          </span>
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-caption tabular-nums font-semibold ${
                              rule.enabled
                                ? 'bg-brand-soft text-brand'
                                : 'bg-subtle text-fg-muted'
                            }`}
                          >
                            {rule.weight} {t('pointsSuffix')}
                          </span>
                        </div>
                        <p className="text-caption text-fg-muted line-clamp-1 ltr-iso">
                          {rule.code}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-line">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUpdateRule(rule.id, { enabled: !rule.enabled })}
                          className="text-caption text-fg-secondary"
                        >
                          {rule.enabled ? t('disableRule') : t('enableRule')}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-danger-text hover:text-danger-text gap-1 text-caption"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{t('deleteRule')}</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Freshness Thresholds Config Form */}
            <Card>
              <CardHeader>
                <CardTitle>{t('freshnessTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveFreshness} className="grid gap-4 sm:grid-cols-4 items-end">
                  <Input
                    label={t('freshMaxLabel')}
                    type="number"
                    min={1}
                    max={60}
                    value={freshness.freshMaxDays}
                    onChange={(e) =>
                      setFreshness({ ...freshness, freshMaxDays: Number(e.target.value) })
                    }
                  />

                  <Input
                    label={t('recentMaxLabel')}
                    type="number"
                    min={7}
                    max={120}
                    value={freshness.recentMaxDays}
                    onChange={(e) =>
                      setFreshness({ ...freshness, recentMaxDays: Number(e.target.value) })
                    }
                  />

                  <Input
                    label={t('needsVerifyMaxLabel')}
                    type="number"
                    min={30}
                    max={365}
                    value={freshness.needsVerifyMaxDays}
                    onChange={(e) =>
                      setFreshness({ ...freshness, needsVerifyMaxDays: Number(e.target.value) })
                    }
                  />

                  <Button type="submit" variant="secondary" size="md" className="w-full">
                    {t('saveFreshness')}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}

        {/* Create Rule Modal */}
        <Dialog
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          title="إضافة قاعدة تقييم جديدة"
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button type="button" variant="ghost" onClick={() => setShowNewModal(false)}>
                إلغاء
              </Button>
              <Button type="submit" form="new-rule-form" variant="primary">
                إضافة القاعدة
              </Button>
            </div>
          }
        >
          <form id="new-rule-form" onSubmit={handleCreateRule} className="flex flex-col gap-4 py-2">
            <Input
              label="اسم القاعدة (بالعربية)"
              required
              value={newRule.name}
              onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
            />

            <Input
              label="كود القاعدة الفريد (Code Key)"
              required
              value={newRule.code}
              onChange={(e) => setNewRule({ ...newRule, code: e.target.value })}
              dir="ltr"
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="الحقل المفحوص (Field)"
                required
                value={newRule.field}
                onChange={(e) => setNewRule({ ...newRule, field: e.target.value })}
                dir="ltr"
              />

              <Select
                label="المعامل الشرطي"
                value={newRule.operator}
                onChange={(e) => setNewRule({ ...newRule, operator: e.target.value })}
                options={[
                  { value: 'EQUALS', label: 'يساوي (EQUALS)' },
                  { value: 'NOT_EQUALS', label: 'لا يساوي (NOT_EQUALS)' },
                  { value: 'GREATER_THAN', label: 'أكبر من (GREATER_THAN)' },
                  { value: 'GREATER_THAN_OR_EQUAL', label: 'أكبر أو يساوي (>=)' },
                  { value: 'IS_TRUE', label: 'صحيح (IS_TRUE)' },
                  { value: 'IS_FALSE', label: 'خاطئ (IS_FALSE)' },
                  { value: 'IS_NULL', label: 'فارغ (IS_NULL)' },
                  { value: 'IS_NOT_NULL', label: 'غير فارغ (IS_NOT_NULL)' },
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="القيمة المستهدفة (Target Value)"
                value={newRule.targetValue}
                onChange={(e) => setNewRule({ ...newRule, targetValue: e.target.value })}
                dir="ltr"
              />

              <Input
                label="الوزن / النقاط (Weight)"
                type="number"
                min={-50}
                max={50}
                value={newRule.weight}
                onChange={(e) => setNewRule({ ...newRule, weight: Number(e.target.value) })}
              />
            </div>
          </form>
        </Dialog>
      </div>
    </AppShell>
  );
}
