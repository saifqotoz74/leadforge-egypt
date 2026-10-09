'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { StatTile } from '@/components/domain/StatTile';
import { MergeCompare, LeadCompareRecord } from '@/components/domain/MergeCompare';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { fmtNumber, fmtDate } from '@/lib/format';
import {
  RotateCcw,
  History,
  Globe,
  ArrowRight,
} from 'lucide-react';

interface DedupSignal {
  signal: string;
  strength: 'STRONG' | 'MODERATE' | 'WEAK' | 'CONFLICT';
  level?: number | null;
  value?: string | null;
  candidateValue?: string | null;
  description?: string;
}

interface FieldConflict {
  field: string;
  existingValue: string | null;
  incomingValue: string | null;
  existingSource: string;
  incomingSource: string;
  resolution: string;
}

interface CandidateItem {
  id: string;
  decision: 'POSSIBLE_DUPLICATE' | 'CONFLICT' | 'DUPLICATE_CONFIRMED';
  status: 'PENDING' | 'CONFIRMED_MERGED' | 'KEPT_SEPARATE' | 'MARKED_INVALID' | 'RESOLVED';
  confidenceLevel: string;
  matchedLead: {
    id: string;
    businessName: string;
    city: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    source: string;
    score: number;
  };
  candidateLead?: {
    id: string;
    businessName: string;
    city: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    website?: string | null;
    source: string;
  } | null;
  sourceRecord?: {
    id: string;
    sourceName: string;
    sourceType: string;
    externalId: string | null;
    normalizedData: Record<string, unknown>;
  } | null;
  signals: DedupSignal[];
  conflicts: FieldConflict[];
  evidence: {
    duplicateEvidence: string[];
    conflictingEvidence: string[];
  };
  createdAt: string;
}

interface MergeHistoryItem {
  id: string;
  targetLeadId: string;
  sourceLeadId: string | null;
  sourceRecordId: string | null;
  mergeType: string;
  reason: string;
  decision: string;
  performedBy: string;
  performedAt: string;
  isReverted: boolean;
  revertedAt: string | null;
  targetLead: {
    id: string;
    businessName: string;
    city: string;
    phone: string | null;
    website: string | null;
    score: number;
  };
  fieldChanges: {
    enrichedFields?: string[];
    conflictedFields?: FieldConflict[];
  };
}

export default function AdminDuplicatesPage() {
  const t = useTranslations('adminDuplicates');
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [mergeHistory, setMergeHistory] = useState<MergeHistoryItem[]>([]);
  const [stats, setStats] = useState({
    pendingCandidates: 0,
    pendingConflicts: 0,
    totalActiveMerges: 0,
    totalSourceRecords: 0,
  });
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [activeTab, setActiveTab] = useState<'CANDIDATES' | 'HISTORY'>('CANDIDATES');
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function loadData(currentStatus = statusFilter) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/duplicates?status=${currentStatus}&includeHistory=true`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
        setMergeHistory(data.mergeHistory || []);
        if (data.stats) setStats(data.stats);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleConfirmMerge(candidateId: string, overrideWebsite = false) {
    setProcessingId(candidateId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/duplicates/${candidateId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredFields: overrideWebsite ? { website: 'INCOMING' } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ type: 'error', text: data.error || t('mergeError') });
      } else {
        setActionMsg({
          type: 'success',
          text: t('mergeSuccess'),
        });
        await loadData();
      }
    } catch {
      setActionMsg({ type: 'error', text: t('mergeError') });
    } finally {
      setProcessingId(null);
    }
  }

  async function handleRejectCandidate(
    candidateId: string,
    action: 'KEEP_SEPARATE' | 'MARK_INVALID'
  ) {
    setProcessingId(candidateId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/duplicates/${candidateId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ type: 'error', text: data.error || t('mergeError') });
      } else {
        setActionMsg({
          type: 'success',
          text:
            action === 'KEEP_SEPARATE'
              ? t('keepSeparateSuccess')
              : t('markInvalidSuccess'),
        });
        await loadData();
      }
    } catch {
      setActionMsg({ type: 'error', text: t('mergeError') });
    } finally {
      setProcessingId(null);
    }
  }

  async function handleUnmerge(mergeId: string) {
    setProcessingId(mergeId);
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/duplicates/unmerge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mergeId,
          reason: 'Manual unmerge by admin',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ type: 'error', text: data.error || t('unmergeError') });
      } else {
        setActionMsg({
          type: 'success',
          text: t('unmergeSuccess'),
        });
        await loadData();
      }
    } catch {
      setActionMsg({ type: 'error', text: t('unmergeError') });
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('title')}
          description={t('desc')}
          breadcrumbs={[
            { label: 'لوحة التحكم', href: '/admin' },
            { label: t('pageTitle') },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <Link href="/admin">
                <Button
                  variant="ghost"
                  size="sm"
                  startIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
                >
                  لوحة التحكم
                </Button>
              </Link>
              <Button
                variant={activeTab === 'CANDIDATES' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setActiveTab('CANDIDATES')}
              >
                {t('tabCandidates', { count: fmtNumber(stats.pendingCandidates) })}
              </Button>
              <Button
                variant={activeTab === 'HISTORY' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setActiveTab('HISTORY')}
                className="gap-1.5"
              >
                <History className="h-4 w-4" />
                <span>{t('tabHistory', { count: fmtNumber(stats.totalActiveMerges) })}</span>
              </Button>
            </div>
          }
        />

        {/* Summary KPI Row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label={t('pendingReview')}
            value={fmtNumber(stats.pendingCandidates)}
            statusText={t('pendingDesc')}
            isOutOfRange={stats.pendingCandidates > 0}
          />
          <StatTile
            label={t('conflicts')}
            value={fmtNumber(stats.pendingConflicts)}
            statusText={t('conflictsDesc')}
            isOutOfRange={stats.pendingConflicts > 0}
          />
          <StatTile
            label={t('activeMerges')}
            value={fmtNumber(stats.totalActiveMerges)}
            statusText={t('activeMergesDesc')}
          />
          <StatTile
            label={t('sourceRecords')}
            value={fmtNumber(stats.totalSourceRecords)}
            statusText={t('sourceRecordsDesc')}
          />
        </div>

        {actionMsg && (
          <Banner variant={actionMsg.type === 'success' ? 'info' : 'danger'}>
            {actionMsg.text}
          </Banner>
        )}

        {activeTab === 'CANDIDATES' ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === 'PENDING' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setStatusFilter('PENDING')}
                >
                  {t('filterPending')}
                </Button>
                <Button
                  variant={statusFilter === 'ALL' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setStatusFilter('ALL')}
                >
                  {t('filterAll')}
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col gap-4">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-72 w-full rounded-xl" />
                ))}
              </div>
            ) : candidates.length === 0 ? (
              <div className="py-12">
                <EmptyState
                  title={t('noPending')}
                  description={t('noPendingDesc')}
                />
              </div>
            ) : (
              candidates.map((cand) => {
                const normB =
                  cand.candidateLead ||
                  (cand.sourceRecord?.normalizedData as Record<string, unknown>) ||
                  {};

                const recordA: LeadCompareRecord = {
                  id: cand.matchedLead.id,
                  businessName: cand.matchedLead.businessName,
                  phone: cand.matchedLead.phone || undefined,
                  email: cand.matchedLead.email || undefined,
                  address: cand.matchedLead.address || undefined,
                  city: cand.matchedLead.city,
                  category: cand.matchedLead.source || undefined,
                  source: cand.matchedLead.source,
                };

                const recordB: LeadCompareRecord = {
                  id: (cand.candidateLead?.id as string) || (cand.sourceRecord?.id as string) || 'B',
                  businessName: (normB.businessName as string) || t('incomingRecord'),
                  phone: (normB.phone as string) || undefined,
                  email: (normB.email as string) || undefined,
                  address: (normB.address as string) || undefined,
                  city: (normB.city as string) || undefined,
                  category: (normB as Record<string, unknown>).category as string | undefined,
                  source: cand.sourceRecord?.sourceName || cand.candidateLead?.source || t('incomingSource'),
                };

                const ruleMatchedText =
                  cand.signals.map((s) => s.description || s.signal).join(' • ') ||
                  cand.decision;

                return (
                  <div key={cand.id} className="flex flex-col gap-3">
                    <MergeCompare
                      recordA={recordA}
                      recordB={recordB}
                      matchLevel={cand.confidenceLevel || cand.decision}
                      ruleMatched={ruleMatchedText}
                      onMerge={() => handleConfirmMerge(cand.id, false)}
                      onNotDuplicate={() => handleRejectCandidate(cand.id, 'KEEP_SEPARATE')}
                      onSkip={() => handleRejectCandidate(cand.id, 'MARK_INVALID')}
                    />

                    {cand.status === 'PENDING' && cand.decision === 'CONFLICT' && Boolean((normB as { website?: unknown }).website) && (
                      <div className="flex justify-end ps-4">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={processingId === cand.id}
                          onClick={() => handleConfirmMerge(cand.id, true)}
                          className="gap-1.5"
                        >
                          <Globe className="h-3.5 w-3.5 text-brand" />
                          <span>{t('mergeWebsiteB')}</span>
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* MERGE HISTORY TAB */
          <Card>
            <CardHeader>
              <CardTitle>{t('historyTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {mergeHistory.length === 0 ? (
                <div className="py-8">
                  <EmptyState
                    title={t('noHistory')}
                    description={t('desc')}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('colTarget')}</TableHead>
                        <TableHead>{t('colReason')}</TableHead>
                        <TableHead>{t('colBy')}</TableHead>
                        <TableHead>{t('colDate')}</TableHead>
                        <TableHead>{t('colStatus')}</TableHead>
                        <TableHead>{t('colAction')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mergeHistory.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-semibold text-fg-primary">
                            {item.targetLead?.businessName || item.targetLeadId}
                          </TableCell>
                          <TableCell className="text-body-sm text-fg-secondary">
                            <div>{item.reason}</div>
                            <span className="text-caption font-mono text-fg-muted">
                              {item.mergeType}
                            </span>
                          </TableCell>
                          <TableCell className="text-caption font-medium">
                            {item.performedBy}
                          </TableCell>
                          <TableCell className="text-caption font-mono ltr-iso text-fg-muted">
                            {fmtDate(new Date(item.performedAt))}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-caption font-medium ${
                                item.isReverted
                                  ? 'bg-subtle text-fg-muted'
                                  : 'bg-brand-soft text-brand font-semibold'
                              }`}
                            >
                              {item.isReverted ? t('reverted') : t('active')}
                            </span>
                          </TableCell>
                          <TableCell>
                            {!item.isReverted && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={processingId === item.id}
                                onClick={() => handleUnmerge(item.id)}
                                className="text-danger-text hover:text-danger-text gap-1"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>{t('btnUnmerge')}</span>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
