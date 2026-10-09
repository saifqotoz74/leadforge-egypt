'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  CATEGORY_LABELS_AR,
  FEEDBACK_REASON_LABELS,
  PIPELINE_STATUS_LABELS,
} from '@/lib/constants';
import { fmtNumber, fmtDate } from '@/lib/format';
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
} from 'lucide-react';

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

const BOARD_STAGES: { stage: PipelineStage; label: string }[] = [
  { stage: 'NEW', label: 'جديدة' },
  { stage: 'CLAIMED', label: 'تم الشراء' },
  { stage: 'CONTACTED', label: 'تم التواصل' },
  { stage: 'MEETING', label: 'اجتماع مجدول' },
  { stage: 'PROPOSAL_SENT', label: 'عرض أسعار' },
  { stage: 'NEGOTIATION', label: 'تفاوض' },
  { stage: 'WON', label: 'تم التعاقد' },
  { stage: 'LOST', label: 'لم تكتمل' },
];

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

export default function MyLeadsPage() {
  const router = useRouter();
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

  async function handleQuickStatusChange(leadId: string, newStatus: PipelineStage) {
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

  const viewTabs: TabItem[] = [
    { id: 'board', label: 'لوحة المراحل (Kanban)', icon: <Kanban className="w-4 h-4" /> },
    { id: 'list', label: 'قائمة الصفقات', icon: <ListFilter className="w-4 h-4" /> },
  ];

  return (
    <AppShell
      density="compact"
      pageTitle="صفقاتي (Pipeline)"
      userCredits={userCredits}
    >
      <div className="flex flex-col gap-6">
        {/* Template T5 PageHeader */}
        <PageHeader
          title="صفقاتي ومتابعة العملاء (Pipeline)"
          description="تتبع وإدارة مراحل التفاوض مع العملاء الذين قمت بفتح بياناتهم."
          breadcrumbs={[
            { label: 'لوحة القيادة', href: '/dashboard' },
            { label: 'صفقاتي' },
          ]}
          actions={
            <Link href="/leads">
              <Button variant="primary" size="sm">
                + اقتناص عملاء جدد
              </Button>
            </Link>
          }
        />

        {/* View Switcher and Filter Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-body-sm text-fg-secondary">
            إجمالي الصفقات المفتوحة:{' '}
            <span className="ltr-iso font-mono font-semibold tabular-nums text-fg-brand">
              {fmtNumber(leads.length)}
            </span>{' '}
            عميل
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
            title="لم تشترِ أي فرصة بعد"
            description="ابدأ بتصفح الفرص المطابقة لملفك وافتح بيانات التواصل مع العملاء."
            action={{
              label: 'تصفح الفرص',
              onClick: () => router.push('/leads'),
            }}
          />
        ) : viewMode === 'board' ? (
          /* Template T5 Kanban Board View (Spec 7.13) */
          <div className="flex gap-4 overflow-x-auto pb-6 items-start">
            {BOARD_STAGES.map(({ stage, label }) => {
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
                الكل ({fmtNumber(leads.length)})
              </Button>
              {Object.entries(PIPELINE_STATUS_LABELS).map(([key, info]) => {
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
                    {info.labelAr} ({fmtNumber(count)})
                  </Button>
                );
              })}
            </div>

            {filteredLeads.length === 0 ? (
              <EmptyState
                variant="no-results"
                title="لا توجد صفقات في هذه المرحلة"
                description="لم يتم العثور على صفقات تطابق المرحلة المحددة."
                action={{
                  label: 'عرض جميع الصفقات',
                  onClick: () => setStatusFilter('ALL'),
                }}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {filteredLeads.map((lead) => {
                  const pStatus = (lead.myClaim?.pipelineStatus as PipelineStage) || 'NEW';

                  return (
                    <Card key={lead.id} className="p-4">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex flex-col gap-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/leads/${lead.id}`}
                              className="text-body font-semibold text-fg-primary hover:text-fg-brand truncate"
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

                          <p className="text-caption text-fg-secondary">
                            <span>{lead.city}</span>
                            <span className="mx-1.5">—</span>
                            <span>{CATEGORY_LABELS_AR[lead.category] || lead.category}</span>
                          </p>

                          <div className="flex flex-wrap items-center gap-4 pt-1 text-caption font-semibold">
                            {lead.phone && (
                              <span className="inline-flex items-center gap-1 text-fg-brand">
                                <Phone className="w-3.5 h-3.5" />
                                <span className="ltr-iso font-mono">{lead.phone}</span>
                              </span>
                            )}
                            {lead.email && (
                              <span className="inline-flex items-center gap-1 text-fg-primary">
                                <Mail className="w-3.5 h-3.5" />
                                <span className="ltr-iso font-mono">{lead.email}</span>
                              </span>
                            )}
                            {lead.myClaim?.nextFollowUpAt && (
                              <span className="inline-flex items-center gap-1 text-fg-secondary">
                                <Calendar className="w-3.5 h-3.5" />
                                متابعة: {fmtDate(new Date(lead.myClaim.nextFollowUpAt))}
                              </span>
                            )}
                          </div>

                          {lead.myClaim?.notes && (
                            <p className="mt-1 p-2 rounded bg-subtle text-caption text-fg-secondary">
                              <strong>ملاحظات:</strong> {lead.myClaim.notes}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <Select
                            value={pStatus}
                            disabled={updatingId === lead.id}
                            onChange={(e) =>
                              handleQuickStatusChange(
                                lead.id,
                                e.target.value as PipelineStage
                              )
                            }
                            options={Object.entries(PIPELINE_STATUS_LABELS).map(([k, v]) => ({
                              value: k,
                              label: v.labelAr,
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
                            {lead.myFeedback ? 'تم التقييم' : 'تقييم الفرصة'}
                          </Button>

                          <Link href={`/leads/${lead.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              startIcon={<ExternalLink className="w-3.5 h-3.5 rtl:-scale-x-100" />}
                            >
                              التفاصيل
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
              ? `تقييم فرصة: ${feedbackModalLead.businessName}`
              : ''
          }
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                variant="ghost"
                onClick={() => setFeedbackModalLead(null)}
                disabled={submittingFeedback}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmitFeedback}
                isLoading={submittingFeedback}
              >
                حفظ التقييم
              </Button>
            </div>
          }
        >
          {feedbackModalLead && (
            <form onSubmit={handleSubmitFeedback} className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-2">
                <span className="text-label text-fg-primary">هل كانت بيانات الفرصة مفيدة؟</span>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={fbUseful ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setFbUseful(true)}
                    startIcon={<ThumbsUp className="w-3.5 h-3.5" />}
                  >
                    نعم
                  </Button>
                  <Button
                    type="button"
                    variant={!fbUseful ? 'danger' : 'secondary'}
                    size="sm"
                    onClick={() => setFbUseful(false)}
                    startIcon={<ThumbsDown className="w-3.5 h-3.5" />}
                  >
                    لا
                  </Button>
                </div>
              </div>

              {!fbUseful && (
                <Select
                  label="سبب عدم الفائدة"
                  value={fbReason}
                  onChange={(e) => setFbReason(e.target.value)}
                  options={Object.entries(FEEDBACK_REASON_LABELS).map(([k, label]) => ({
                    value: k,
                    label,
                  }))}
                />
              )}

              <Input
                label="ملاحظات إضافية"
                value={fbComment}
                onChange={(e) => setFbComment(e.target.value)}
                placeholder="أضف أي تفاصيل تساعد في تحسين جودة البيانات..."
              />
            </form>
          )}
        </Dialog>
      </div>
    </AppShell>
  );
}
