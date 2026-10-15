'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { PipelineColumn } from '@/components/domain/PipelineColumn';
import { PipelineCard, PipelineLeadItem } from '@/components/domain/PipelineCard';
import { StageBadge, PipelineStage } from '@/components/domain/StageBadge';
import { OpportunityBadge, LeadTemperature } from '@/components/domain/OpportunityBadge';
import { Tabs, TabItem } from '@/components/ui/Tabs';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  FEEDBACK_REASON_LABELS,
  PIPELINE_STATUS_LABELS,
} from '@/lib/constants';
import { localizeCity, localizeCategory } from '@/lib/taxonomy';
import { fmtNumber, fmtDate, formatRelativeTime } from '@/lib/format';
import {
  Kanban,
  ListFilter,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  CheckCircle2,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  MessageCircle,
} from 'lucide-react';
import { WhatsAppOutreachModal } from '@/components/domain/WhatsAppOutreachModal';

interface ClaimedLeadItem {
  id: string;
  businessName: string;
  category: string;
  city: string;
  phone?: string | null;
  email?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  score: number;
  temperature: string;
  exclusive: boolean;
  myClaim: {
    id: string;
    pipelineStatus: string;
    notes?: string | null;
    lastContactedAt?: string | null;
    nextFollowUpAt?: string | null;
    claimedAt: string;
  };
  myFeedback?: {
    useful: boolean;
    reason?: string | null;
  } | null;
}

const ALL_PIPELINE_STAGES: PipelineStage[] = [
  'NEW',
  'CLAIMED',
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'MEETING',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
  'NOT_INTERESTED',
  'INVALID',
];

const NEXT_STAGE_MAP: Partial<Record<PipelineStage, PipelineStage>> = {
  NEW: 'CONTACTED',
  CLAIMED: 'CONTACTED',
  CONTACTED: 'MEETING',
  REPLIED: 'MEETING',
  INTERESTED: 'PROPOSAL_SENT',
  MEETING: 'PROPOSAL_SENT',
  PROPOSAL_SENT: 'NEGOTIATION',
  NEGOTIATION: 'WON',
};

export default function MyLeadsPage() {
  const router = useRouter();
  const t = useTranslations('pipeline');
  const tCommon = useTranslations('common');
  const tGeo = useTranslations('geo');
  const tCat = useTranslations('categories');
  const tEnums = useTranslations('enums');
  const locale = useLocale();

  const [leads, setLeads] = useState<ClaimedLeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Feedback Dialog state
  const [feedbackModalLead, setFeedbackModalLead] = useState<ClaimedLeadItem | null>(null);
  const [fbUseful, setFbUseful] = useState<boolean>(true);
  const [fbReason, setFbReason] = useState('WRONG_PHONE');
  const [fbComment, setFbComment] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [userCredits, setUserCredits] = useState<number | undefined>(undefined);

  // Confirm Invalid Dialog state (UX-013)
  const [pendingInvalidChange, setPendingInvalidChange] = useState<{
    leadId: string;
    newStatus: PipelineStage;
  } | null>(null);

  // WhatsApp Outreach Dialog state
  const [outreachModalLead, setOutreachModalLead] = useState<ClaimedLeadItem | null>(null);

  const loadMyLeads = useCallback(async () => {
    setLoading(true);
    try {
      const [res, creditsRes] = await Promise.all([
        fetch('/api/leads?claimedOnly=true'),
        fetch('/api/developer/credits'),
      ]);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
      if (creditsRes.ok) {
        const creditsData = await creditsRes.json();
        if (typeof creditsData.balance === 'number') {
          setUserCredits(creditsData.balance);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMyLeads();
  }, [loadMyLeads]);

  async function applyStatusChange(leadId: string, newStatus: PipelineStage) {
    setUpdatingId(leadId);
    try {
      const res = await fetch(`/api/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await loadMyLeads();
      }
    } finally {
      setUpdatingId(null);
    }
  }

  function handleQuickStatusChange(leadId: string, newStatus: PipelineStage) {
    if (newStatus === 'INVALID') {
      setPendingInvalidChange({ leadId, newStatus });
      return;
    }
    applyStatusChange(leadId, newStatus);
  }

  async function handleSubmitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackModalLead) return;
    setSubmittingFeedback(true);
    try {
      const res = await fetch(`/api/leads/${feedbackModalLead.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useful: fbUseful,
          reason: fbUseful ? null : fbReason,
          comment: fbComment,
        }),
      });
      if (res.ok) {
        setFeedbackModalLead(null);
        setFbComment('');
        await loadMyLeads();
      }
    } finally {
      setSubmittingFeedback(false);
    }
  }

  const filteredLeads =
    statusFilter === 'ALL'
      ? leads
      : leads.filter((l) => (l.myClaim?.pipelineStatus || 'NEW') === statusFilter);

  const boardStages: { stage: PipelineStage; label: string }[] = [
    { stage: 'NEW', label: t('stageNew') },
    { stage: 'CLAIMED', label: t('stageClaimed') },
    { stage: 'CONTACTED', label: t('stageContacted') },
    { stage: 'MEETING', label: t('stageMeeting') },
    { stage: 'PROPOSAL_SENT', label: t('stageProposal') },
    { stage: 'NEGOTIATION', label: t('stageNegotiation') },
    { stage: 'WON', label: t('stageWon') },
    { stage: 'LOST', label: t('stageLost') },
  ];

  const viewTabs: TabItem[] = [
    { id: 'board', label: t('boardView'), icon: <Kanban className="w-4 h-4" /> },
    { id: 'list', label: t('listView'), icon: <ListFilter className="w-4 h-4" /> },
  ];

  return (
    <AppShell
      density="compact"
      pageTitle={t('pageTitle')}
      userCredits={userCredits}
    >
      <div className="flex flex-col gap-6">
        {/* Template T5 PageHeader */}
        <PageHeader
          title={t('title')}
          description={t('description')}
          breadcrumbs={[
            { label: t('breadcrumbsDashboard'), href: '/dashboard' },
            { label: t('pageTitle') },
          ]}
          actions={
            <Link href="/leads">
              <Button variant="primary" size="sm">
                {t('findNewLeads')}
              </Button>
            </Link>
          }
        />

        {/* View Switcher and Filter Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-body-sm text-fg-secondary">
            {t('totalOpenDeals')}{' '}
            <span className="ltr-iso font-semibold tabular-nums text-fg-brand">
              {fmtNumber(leads.length, locale)}
            </span>{' '}
            {t('clients', { count: leads.length })}
          </p>

          <Tabs
            variant="segmented"
            tabs={viewTabs}
            activeTab={viewMode}
            onChange={(id) => setViewMode(id as 'board' | 'list')}
          />
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="w-column shrink-0 flex flex-col gap-3">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : leads.length === 0 ? (
          <EmptyState
            variant="first-use"
            title={t('noLeadsTitle')}
            description={t('noLeadsDesc')}
            action={{
              label: t('browseLeads'),
              onClick: () => router.push('/leads'),
            }}
          />
        ) : viewMode === 'board' ? (
          /* Template T5 Kanban Board View (Spec 7.13) */
          <div className="flex gap-4 overflow-x-auto pb-6 items-start">
            {boardStages.map(({ stage, label }) => {
              const stageLeads = leads.filter(
                (l) => (l.myClaim?.pipelineStatus || 'NEW') === stage
              );

              return (
                <PipelineColumn
                  key={stage}
                  title={label}
                  count={stageLeads.length}
                >
                  {stageLeads.map((lead) => {
                    const cardItem: PipelineLeadItem = {
                      id: lead.id,
                      businessName: lead.businessName,
                      location: localizeCity(lead.city, tGeo as any),
                      category: localizeCategory(lead.category, tCat as any),
                      temperature: (lead.temperature as LeadTemperature) || 'HOT',
                      score: lead.score,
                      stage: (lead.myClaim?.pipelineStatus as PipelineStage) || 'NEW',
                      lastActivityDate:
                        lead.myClaim?.lastContactedAt || lead.myClaim?.claimedAt,
                    };

                    return (
                      <PipelineCard
                        key={lead.id}
                        lead={cardItem}
                        stages={ALL_PIPELINE_STAGES}
                        onStageChange={(id, newStage) =>
                          handleQuickStatusChange(id, newStage)
                        }
                        onClick={(id) => router.push(`/leads/${id}`)}
                      />
                    );
                  })}
                </PipelineColumn>
              );
            })}
          </div>
        ) : (
          /* Template T5 List View */
          <div className="flex flex-col gap-4">
            {/* Quick Status Filter Tabs */}
            <div className="flex flex-wrap gap-2 pb-2">
              <Button
                variant={statusFilter === 'ALL' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setStatusFilter('ALL')}
              >
                {t('allCount', { count: fmtNumber(leads.length, locale) })}
              </Button>
              {Object.keys(PIPELINE_STATUS_LABELS).map((key) => {
                const count = leads.filter(
                  (l) => (l.myClaim?.pipelineStatus || 'NEW') === key
                ).length;
                return (
                  <Button
                    key={key}
                    variant={statusFilter === key ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setStatusFilter(key)}
                  >
                    {tEnums(`PipelineStatus.${key}`)} ({fmtNumber(count, locale)})
                  </Button>
                );
              })}
            </div>

            {filteredLeads.length === 0 ? (
              <EmptyState
                variant="no-results"
                title={t('noLeadsInStageTitle')}
                description={t('noLeadsInStageDesc')}
                action={{
                  label: t('viewAllDeals'),
                  onClick: () => setStatusFilter('ALL'),
                }}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {filteredLeads.map((lead) => {
                  const pStatus = (lead.myClaim?.pipelineStatus as PipelineStage) || 'NEW';
                  const nextStage = NEXT_STAGE_MAP[pStatus];
                  const nextActionKey = `nextAction_${pStatus}`;
                  const nextActionLabel = t.has(nextActionKey) ? t(nextActionKey) : t('details');
                  const lastAct = lead.myClaim?.lastContactedAt || lead.myClaim?.claimedAt;

                  return (
                    <Card key={lead.id} className="p-4">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex flex-col gap-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/leads/${lead.id}`}
                              title={lead.businessName}
                              className="text-body font-semibold text-fg-primary hover:text-fg-brand truncate" /* design-allow: truncate */
                            >
                              {lead.businessName}
                            </Link>
                            <OpportunityBadge
                              temperature={(lead.temperature as LeadTemperature) || 'HOT'}
                              score={lead.score}
                              size="sm"
                            />
                            <StageBadge stage={pStatus} size="sm" />
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-caption text-fg-secondary">
                            <span>{localizeCity(lead.city, tGeo as any)}</span>
                            <span className="h-1 w-1 rounded-full bg-fg-muted" aria-hidden="true" />
                            <span>{localizeCategory(lead.category, tCat as any)}</span>
                            {lastAct && (
                              <>
                                <span className="h-1 w-1 rounded-full bg-fg-muted" aria-hidden="true" />
                                <span className="tabular-nums">
                                  {tCommon('activityPrefix', { time: formatRelativeTime(lastAct, locale) })}
                                </span>
                              </>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-4 pt-1 text-caption font-semibold">
                            {lead.phone ? (
                              <span className="inline-flex items-center gap-1 text-fg-brand">
                                <Phone className="w-3.5 h-3.5" />
                                <span className="ltr-iso tabular-nums">{lead.phone}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                                📍 زيارة ميدانية / سوشيال
                              </span>
                            )}
                            {lead.email && (
                              <span className="inline-flex items-center gap-1 text-fg-primary">
                                <Mail className="w-3.5 h-3.5" />
                                <span className="ltr-iso">{lead.email}</span>
                              </span>
                            )}
                            {lead.myClaim?.nextFollowUpAt && (
                              <span className="inline-flex items-center gap-1 text-fg-secondary">
                                <Calendar className="w-3.5 h-3.5" />
                                {t('followUp')} {fmtDate(new Date(lead.myClaim.nextFollowUpAt), locale)}
                              </span>
                            )}
                          </div>

                          {lead.myClaim?.notes && (
                            <p className="mt-1 p-2 rounded bg-subtle text-caption text-fg-secondary">
                              <strong>{t('notes')}</strong> {lead.myClaim.notes}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {nextStage && (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={updatingId === lead.id}
                              onClick={() => handleQuickStatusChange(lead.id, nextStage)}
                              endIcon={<ArrowRight className="w-3.5 h-3.5 rtl:-scale-x-100" />}
                            >
                              {nextActionLabel}
                            </Button>
                          )}

                          <Select
                            value={pStatus}
                            disabled={updatingId === lead.id}
                            onChange={(e) =>
                              handleQuickStatusChange(
                                lead.id,
                                e.target.value as PipelineStage
                              )
                            }
                            options={Object.keys(PIPELINE_STATUS_LABELS).map((k) => ({
                              value: k,
                              label: tEnums(`PipelineStatus.${k}`),
                            }))}
                            className="w-36"
                          />

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setFeedbackModalLead(lead);
                              setFbUseful(lead.myFeedback ? lead.myFeedback.useful : true);
                              setFbReason(lead.myFeedback?.reason || 'WRONG_PHONE');
                            }}
                            startIcon={
                              lead.myFeedback ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-fg-brand" />
                              ) : (
                                <MessageSquare className="w-3.5 h-3.5 text-fg-secondary" />
                              )
                            }
                          >
                            {lead.myFeedback ? t('feedbackDone') : t('giveFeedback')}
                          </Button>

                          {lead.phone ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setOutreachModalLead(lead)}
                              startIcon={<MessageCircle className="w-3.5 h-3.5 text-brand" />}
                              title="تواصل عبر واتساب"
                            >
                              تواصل عبر واتساب
                            </Button>
                          ) : (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                `${lead.businessName} ${lead.city}`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface text-fg-primary hover:border-line-strong hover:bg-subtle text-caption font-semibold transition-colors"
                            >
                              <span>خريطة الموقع 📍</span>
                            </a>
                          )}

                          <Link href={`/leads/${lead.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              startIcon={<ExternalLink className="w-3.5 h-3.5 rtl:-scale-x-100" />}
                            >
                              {t('details')}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Feedback Dialog */}
        <Dialog
          isOpen={feedbackModalLead !== null}
          onClose={() => setFeedbackModalLead(null)}
          title={
            feedbackModalLead
              ? t('feedbackDialogTitle', { name: feedbackModalLead.businessName })
              : ''
          }
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                variant="ghost"
                onClick={() => setFeedbackModalLead(null)}
                disabled={submittingFeedback}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmitFeedback}
                isLoading={submittingFeedback}
              >
                {t('saveFeedback')}
              </Button>
            </div>
          }
        >
          {feedbackModalLead && (
            <form onSubmit={handleSubmitFeedback} className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-2">
                <span className="text-label text-fg-primary">{t('wasUseful')}</span>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={fbUseful ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setFbUseful(true)}
                    startIcon={<ThumbsUp className="w-3.5 h-3.5" />}
                  >
                    {t('yes')}
                  </Button>
                  <Button
                    type="button"
                    variant={!fbUseful ? 'danger' : 'secondary'}
                    size="sm"
                    onClick={() => setFbUseful(false)}
                    startIcon={<ThumbsDown className="w-3.5 h-3.5" />}
                  >
                    {t('no')}
                  </Button>
                </div>
              </div>

              {!fbUseful && (
                <Select
                  label={t('unhelpfulReason')}
                  value={fbReason}
                  onChange={(e) => setFbReason(e.target.value)}
                  options={Object.keys(FEEDBACK_REASON_LABELS).map((k) => ({
                    value: k,
                    label: tEnums(`FeedbackReason.${k}`),
                  }))}
                />
              )}

              <Input
                label={t('additionalNotes')}
                value={fbComment}
                onChange={(e) => setFbComment(e.target.value)}
                placeholder={t('additionalNotesPlaceholder')}
              />
            </form>
          )}
        </Dialog>

        {/* Confirmation Dialog for INVALID Status (UX-013) */}
        <Dialog
          isOpen={Boolean(pendingInvalidChange)}
          onClose={() => setPendingInvalidChange(null)}
          title={t('confirmInvalidTitle')}
          size="sm"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setPendingInvalidChange(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (pendingInvalidChange) {
                    const { leadId, newStatus } = pendingInvalidChange;
                    setPendingInvalidChange(null);
                    applyStatusChange(leadId, newStatus);
                  }
                }}
              >
                {t('confirmInvalidAction')}
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-fg-secondary leading-relaxed">
            {t('confirmInvalidDescription')}
          </p>
        </Dialog>

        {/* WhatsApp Outreach Modal */}
        {outreachModalLead && (
          <WhatsAppOutreachModal
            isOpen={outreachModalLead !== null}
            onClose={() => setOutreachModalLead(null)}
            leadId={outreachModalLead.id}
            businessName={outreachModalLead.businessName}
            phone={outreachModalLead.phone}
            category={outreachModalLead.category}
            city={outreachModalLead.city}
            nextFollowUpAt={outreachModalLead.myClaim?.nextFollowUpAt}
            onContactLogged={loadMyLeads}
          />
        )}
      </div>
    </AppShell>
  );
}
