'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { ScorePair } from '@/components/domain/ScorePair';
import { ScoreBreakdown, ScoreRuleItem } from '@/components/domain/ScoreBreakdown';
import { OwnershipTag, OwnershipType } from '@/components/domain/OwnershipTag';
import { PurchaseConfirm } from '@/components/domain/PurchaseConfirm';
import { DealTimeline } from '@/components/domain/DealTimeline';
import { OpportunityBadge, LeadTemperature } from '@/components/domain/OpportunityBadge';
import { QualityState } from '@/components/domain/QualityIndicator';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { LockedField } from '@/components/ui/LockedField';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  CATEGORY_LABELS_AR,
  FEEDBACK_REASON_LABELS,
  PIPELINE_STATUS_LABELS,
  WEBSITE_STATUS_LABELS,
} from '@/lib/constants';
import { fmtNumber, fmtDate } from '@/lib/format';
import {
  Phone,
  Mail,
  MapPin,
  Globe,
  Star,
  CheckCircle2,
  Copy,
  Clock,
  Layers,
  Calendar,
  Send,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';

interface LeadDetailData {
  id: string;
  businessName: string;
  category: string;
  governorate: string;
  city: string;
  area?: string | null;
  address?: string | null;
  phone?: string | null;
  hasPhone: boolean;
  email?: string | null;
  hasEmail: boolean;
  website?: string | null;
  websiteStatus: string;
  facebook?: string | null;
  hasFacebook: boolean;
  instagram?: string | null;
  hasInstagram: boolean;
  rating?: number | null;
  reviewCount: number;
  branchCount: number;
  estimatedBudget: number;
  score: number;
  temperature: string;
  classification?: string;
  scoringVersion?: string;
  scoreExplanation?: {
    summary?: string;
    reasons?: Array<string | { ruleKey?: string; label?: string; points?: number; reason?: string }>;
    version?: string;
    rawScore?: number;
    normalizedScore?: number;
  } | null;
  qualityScore?: number;
  qualityStatus?: string;
  completenessScore?: number;
  freshnessStatus?: string;
  verificationStatus?: string;
  saleabilityStatus?: string;
  businessStatus?: string;
  status?: string;
  qualificationReasons: string[];
  qualificationRules: {
    ruleId: string;
    code: string;
    name: string;
    nameEn: string;
    weight: number;
  }[];
  websiteAnalysis?: {
    url: string | null;
    domain: string | null;
    domainStatus?: string;
    reachable: boolean;
    httpStatus: number | null;
    isHttps: boolean;
    sslValid: boolean;
    responseTimeMs: number | null;
    title: string | null;
    metaDescription: string | null;
    hasMobileViewport: boolean;
    hasResponsiveIndicators: boolean;
    isOldBasicStructure: boolean;
    opportunityScore: number;
    opportunityReasons: {
      code: string;
      reasonAr: string;
      reasonEn: string;
      points: number;
    }[];
  } | null;
  leadType: string;
  exclusive: boolean;
  maxPurchasers: number;
  currentPurchasers: number;
  source: string;
  sourceList: string[];
  lastVerifiedAt: string;
  creditCost?: number;
  isClaimedByMe: boolean;
  myClaim?: {
    id: string;
    pipelineStatus: string;
    notes?: string | null;
    lastContactedAt?: string | null;
    nextFollowUpAt?: string | null;
    claimedAt: string;
  };
  myEngagement?: {
    currentStatus: string;
  };
  myFeedback?: {
    useful: boolean;
    category?: string;
    reasonCode?: string;
    reason?: string;
    rating?: number;
    comment?: string;
  } | null;
}

const ALLOWED_UI_TRANSITIONS: Record<string, string[]> = {
  NEW: ['CLAIMED'],
  CLAIMED: ['CONTACTED', 'INVALID'],
  CONTACTED: ['REPLIED', 'NOT_INTERESTED', 'INVALID'],
  REPLIED: ['INTERESTED', 'MEETING', 'NOT_INTERESTED', 'INVALID'],
  INTERESTED: ['MEETING', 'PROPOSAL_SENT', 'LOST', 'INVALID'],
  MEETING: ['PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'INVALID'],
  PROPOSAL_SENT: ['NEGOTIATION', 'WON', 'LOST', 'INVALID'],
  NEGOTIATION: ['WON', 'LOST', 'INVALID'],
  WON: [],
  LOST: [],
  NOT_INTERESTED: [],
  INVALID: [],
};

function mapQualityStatus(lead: LeadDetailData): QualityState {
  if (lead.verificationStatus === 'VERIFIED') return 'VERIFIED';
  if (lead.freshnessStatus === 'FRESH') return 'FRESH';
  if (lead.freshnessStatus === 'AGING' || lead.freshnessStatus === 'RECENT') return 'AGING';
  if (lead.freshnessStatus === 'STALE' || lead.freshnessStatus === 'VERY_STALE') return 'STALE';
  if (lead.verificationStatus === 'UNVERIFIED') return 'UNVERIFIED';
  return 'FRESH';
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = String(params.id || '');

  const [lead, setLead] = useState<LeadDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'info' | 'warning' | 'danger'; text: string } | null>(
    null
  );
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Status tracking state
  const [pipelineStatus, setPipelineStatus] = useState('CLAIMED');
  const [outcomeReasonCode, setOutcomeReasonCode] = useState('PRICE');
  const [estimatedProjectValue, setEstimatedProjectValue] = useState('');
  const [wonReason, setWonReason] = useState('');
  const [notes, setNotes] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // Contact Attempt state
  const [contactChannel, setContactChannel] = useState('PHONE');
  const [contactResult, setContactResult] = useState('ANSWERED');
  const [contactNote, setContactNote] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  // Structured Feedback state
  const [useful, setUseful] = useState<boolean | null>(null);
  const [feedbackCategory, setFeedbackCategory] = useState('CONTACT');
  const [feedbackReason, setFeedbackReason] = useState('PHONE_ANSWERED');
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [userCredits, setUserCredits] = useState<number>(150);

  const loadLead = useCallback(async () => {
    setLoading(true);
    try {
      fetch('/api/developer/credits')
        .then((r) => r.ok && r.json())
        .then((d) => {
          if (typeof d?.balance === 'number') setUserCredits(d.balance);
        })
        .catch(() => {});

      const res = await fetch(`/api/leads/${leadId}`);
      if (res.ok) {
        const data = await res.json();
        const l: LeadDetailData = data.lead;
        setLead(l);
        const currentEngStatus =
          l.myEngagement?.currentStatus ||
          (l.myClaim?.pipelineStatus === 'NEW' ? 'CLAIMED' : l.myClaim?.pipelineStatus || 'CLAIMED');
        const nextAllowed = ALLOWED_UI_TRANSITIONS[currentEngStatus] || [];
        setPipelineStatus(nextAllowed[0] || currentEngStatus);
        if (l.myClaim) {
          setNotes(l.myClaim.notes || '');
          setNextFollowUpAt(
            l.myClaim.nextFollowUpAt ? l.myClaim.nextFollowUpAt.slice(0, 10) : ''
          );
        }
        if (l.myFeedback) {
          setUseful(l.myFeedback.useful);
          if (l.myFeedback.category) setFeedbackCategory(l.myFeedback.category);
          if (l.myFeedback.reasonCode || l.myFeedback.reason) {
            setFeedbackReason(l.myFeedback.reasonCode || l.myFeedback.reason || 'PHONE_ANSWERED');
          }
          if (l.myFeedback.rating) setFeedbackRating(l.myFeedback.rating);
          setFeedbackComment(l.myFeedback.comment || '');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    loadLead();
  }, [loadLead]);

  async function handleClaim() {
    setClaiming(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ type: 'danger', text: data.error || 'تعذر فتح بيانات الفرصة.' });
      } else {
        setActionMsg({
          type: 'info',
          text: `تم الشراء بنجاح! الرصيد المتبقي: ${data.remainingCredits} نقطة.`,
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('leadforge:user-updated'));
        }
        setIsPurchaseModalOpen(false);
        await loadLead();
      }
    } catch {
      setActionMsg({ type: 'danger', text: 'حدث خطأ أثناء الاتصال بالخادم.' });
    } finally {
      setClaiming(false);
    }
  }

  async function handleSaveStatus(e: React.FormEvent) {
    e.preventDefault();
    setSavingStatus(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/engagement/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: pipelineStatus,
          reasonCode:
            pipelineStatus === 'LOST' || pipelineStatus === 'INVALID'
              ? outcomeReasonCode
              : undefined,
          estimatedProjectValue:
            pipelineStatus === 'WON' && estimatedProjectValue.trim() !== ''
              ? Number(estimatedProjectValue)
              : undefined,
          currency: 'EGP',
          wonReason: pipelineStatus === 'WON' ? wonReason || notes : undefined,
          note: notes,
          nextFollowUpAt: nextFollowUpAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ type: 'danger', text: data.error || 'تعذر تحديث الحالة.' });
      } else {
        setActionMsg({ type: 'info', text: 'تم تحديث مرحلة الصفقة بنجاح.' });
        await loadLead();
      }
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleRecordContactAttempt(e: React.FormEvent) {
    e.preventDefault();
    setSavingContact(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/contact-attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: contactChannel,
          result: contactResult,
          note: contactNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ type: 'danger', text: data.error || 'تعذر تسجيل محاولة التواصل.' });
      } else {
        setContactNote('');
        setActionMsg({ type: 'info', text: 'تم تسجيل محاولة التواصل بنجاح.' });
        await loadLead();
      }
    } finally {
      setSavingContact(false);
    }
  }

  async function handleSaveFeedback(e: React.FormEvent) {
    e.preventDefault();
    setSavingFeedback(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: feedbackCategory,
          reasonCode: feedbackReason,
          rating: feedbackRating,
          useful: useful ?? feedbackRating >= 4,
          comment: feedbackComment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ type: 'danger', text: data.error || 'تعذر حفظ التقييم.' });
      } else {
        setActionMsg({ type: 'info', text: 'تم تسجيل التقييم لجودة هذه الفرصة بنجاح.' });
        await loadLead();
      }
    } finally {
      setSavingFeedback(false);
    }
  }

  function handleCopy(text: string, fieldKey: string) {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 2000);
    }
  }

  if (loading || !lead) {
    return (
      <AppShell density="comfortable" pageTitle="تفاصيل الفرصة">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-10 w-48 rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 flex flex-col gap-6">
              <Skeleton className="h-44 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
            <div className="lg:col-span-4">
              <Skeleton className="h-72 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const price = lead.creditCost || (lead.exclusive ? 5 : 1);
  const derivedRules: ScoreRuleItem[] =
    Array.isArray(lead.qualificationRules) && lead.qualificationRules.length > 0
      ? lead.qualificationRules.map((r) => ({
          id: r.code,
          label: r.name,
          points: r.weight,
          maxWeight: 40,
        }))
      : (lead.websiteAnalysis?.opportunityReasons || []).map((op) => ({
          id: op.code,
          label: op.reasonAr,
          points: op.points,
          maxWeight: 40,
        }));

  return (
    <AppShell
      density="comfortable"
      pageTitle={lead.businessName}
      userCredits={userCredits}
    >
      <div className="flex flex-col gap-6">
        {/* Template T4 PageHeader with Breadcrumbs */}
        <PageHeader
          title={lead.businessName}
          description={`${CATEGORY_LABELS_AR[lead.category] || lead.category} — ${lead.city}${
            lead.area ? `، ${lead.area}` : ''
          }`}
          breadcrumbs={[
            { label: 'لوحة القيادة', href: '/dashboard' },
            { label: 'استعراض الفرص', href: '/leads' },
            { label: lead.businessName },
          ]}
        />

        {/* Global Feedback Banner */}
        {actionMsg && (
          <Banner variant={actionMsg.type}>
            {actionMsg.text}
          </Banner>
        )}

        {/* Template T4 Layout: Main (8 cols) and Aside (4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-20 lg:pb-0">
          {/* Main Column (8) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* 1. ScorePair per Spec 7.9 & Template T4 */}
            <ScorePair
              opportunityScore={lead.score}
              temperature={(lead.temperature as LeadTemperature) || 'HOT'}
              qualityScore={lead.qualityScore || 85}
              qualityStatus={mapQualityStatus(lead)}
              freshnessTimestamp={lead.lastVerifiedAt}
              onWhyClick={() => setShowBreakdown((prev) => !prev)}
            />

            {/* 2. "Why?" ScoreBreakdown per Spec 7.9 */}
            {showBreakdown && (
              <ScoreBreakdown
                title="لماذا هذه الدرجة؟"
                rules={derivedRules}
                totalScore={lead.score}
              />
            )}

            {/* 3. Business Details (Locked or Revealed per Spec 1.1, 7.4 & Template T4) */}
            <Card>
              <CardHeader>
                <CardTitle>بيانات التواصل والنشاط</CardTitle>
                {lead.isClaimedByMe ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft text-brand text-caption font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    تم فتح البيانات
                  </span>
                ) : (
                  <span className="text-caption text-fg-secondary">
                    بيانات مقفلة حتى الشراء
                  </span>
                )}
              </CardHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                {/* Phone */}
                <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-subtle border border-line">
                  <span className="text-caption text-fg-secondary">رقم الهاتف</span>
                  {lead.isClaimedByMe && lead.phone ? (
                    <div className="flex items-center justify-between">
                      <a
                        href={`tel:${lead.phone}`}
                        className="ltr-iso font-mono font-semibold text-fg-brand hover:underline"
                      >
                        {lead.phone}
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(lead.phone!, 'phone')}
                        startIcon={<Copy className="w-3.5 h-3.5" />}
                      >
                        {copiedField === 'phone' ? 'تم النسخ' : 'نسخ'}
                      </Button>
                    </div>
                  ) : (
                    <LockedField type="phone" />
                  )}
                </div>

                {/* Email */}
                <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-subtle border border-line">
                  <span className="text-caption text-fg-secondary">البريد الإلكتروني</span>
                  {lead.isClaimedByMe && lead.email ? (
                    <div className="flex items-center justify-between">
                      <a
                        href={`mailto:${lead.email}`}
                        className="ltr-iso font-mono font-semibold text-fg-brand hover:underline truncate max-w-44"
                      >
                        {lead.email}
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(lead.email!, 'email')}
                        startIcon={<Copy className="w-3.5 h-3.5" />}
                      >
                        {copiedField === 'email' ? 'تم النسخ' : 'نسخ'}
                      </Button>
                    </div>
                  ) : (
                    <LockedField type="email" />
                  )}
                </div>

                {/* Website */}
                <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-subtle border border-line">
                  <span className="text-caption text-fg-secondary">الموقع الإلكتروني</span>
                  {lead.website ? (
                    <a
                      href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ltr-iso font-mono text-body-sm text-fg-brand hover:underline truncate"
                    >
                      {lead.website}
                    </a>
                  ) : (
                    <span className="text-body-sm text-fg-muted">لا يوجد موقع مسجل</span>
                  )}
                </div>

                {/* Location */}
                <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-subtle border border-line">
                  <span className="text-caption text-fg-secondary">العنوان والموقع الجغرافي</span>
                  <p className="text-body-sm text-fg-primary truncate">
                    {lead.address || `${lead.governorate} — ${lead.city}`}
                  </p>
                </div>
              </div>
            </Card>

            {/* 4. Technical Analysis Card */}
            {lead.websiteAnalysis && (
              <Card>
                <CardHeader>
                  <CardTitle>التحليل الفني للموقع</CardTitle>
                </CardHeader>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 text-body-sm">
                  <div className="p-3 rounded-lg bg-subtle">
                    <span className="text-caption text-fg-secondary block">تشفير HTTPS</span>
                    <span className="font-semibold text-fg-primary">
                      {lead.websiteAnalysis.isHttps && lead.websiteAnalysis.sslValid ? 'مفعل' : 'غير مفعل'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-subtle">
                    <span className="text-caption text-fg-secondary block">توافق الموبايل</span>
                    <span className="font-semibold text-fg-primary">
                      {lead.websiteAnalysis.hasMobileViewport ? 'متوافق' : 'غير متوافق'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-subtle">
                    <span className="text-caption text-fg-secondary block">سرعة الاستجابة</span>
                    <span className="ltr-iso font-mono font-semibold text-fg-primary">
                      {lead.websiteAnalysis.responseTimeMs ? `${lead.websiteAnalysis.responseTimeMs} ms` : '—'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-subtle">
                    <span className="text-caption text-fg-secondary block">هيكل الموقع</span>
                    <span className="font-semibold text-fg-primary">
                      {lead.websiteAnalysis.isOldBasicStructure ? 'يحتاج تحديث' : 'قياسي حديث'}
                    </span>
                  </div>
                </div>
              </Card>
            )}

            {/* 5. Claimed Lead Actions (CRM Pipeline & Feedback) */}
            {lead.isClaimedByMe && (
              <div className="flex flex-col gap-6">
                {/* Pipeline Stage Management */}
                <Card>
                  <CardHeader>
                    <CardTitle>متابعة مرحلة الصفقة (CRM)</CardTitle>
                  </CardHeader>
                  <form onSubmit={handleSaveStatus} className="flex flex-col gap-4 py-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Select
                        label="مرحلة المتابعة"
                        value={pipelineStatus}
                        onChange={(e) => setPipelineStatus(e.target.value)}
                        options={Object.entries(PIPELINE_STATUS_LABELS).map(([k, v]) => ({
                          value: k,
                          label: v.labelAr,
                        }))}
                      />

                      <Input
                        label="تاريخ المتابعة القادمة"
                        type="date"
                        value={nextFollowUpAt}
                        onChange={(e) => setNextFollowUpAt(e.target.value)}
                      />
                    </div>

                    <Textarea
                      label="ملاحظات المتابعة والتفاوض"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="سجل ملاحظات مكالمتك مع العميل وتفاصيل الاتفاق..."
                      rows={3}
                    />

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        isLoading={savingStatus}
                      >
                        حفظ حالة الصفقة
                      </Button>
                    </div>
                  </form>
                </Card>

                {/* Structured Feedback Form */}
                <Card>
                  <CardHeader>
                    <CardTitle>تقييم جودة الفرصة</CardTitle>
                  </CardHeader>
                  <form onSubmit={handleSaveFeedback} className="flex flex-col gap-4 py-2">
                    <div className="flex items-center gap-4">
                      <span className="text-label text-fg-primary">هل كانت بيانات الفرصة مفيدة؟</span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant={useful === true ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => setUseful(true)}
                          startIcon={<ThumbsUp className="w-3.5 h-3.5" />}
                        >
                          نعم
                        </Button>
                        <Button
                          type="button"
                          variant={useful === false ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={() => setUseful(false)}
                          startIcon={<ThumbsDown className="w-3.5 h-3.5" />}
                        >
                          لا
                        </Button>
                      </div>
                    </div>

                    <Textarea
                      label="تعليق إضافي حول دقة البيانات"
                      value={feedbackComment}
                      onChange={(e) => setFeedbackComment(e.target.value)}
                      placeholder="ملاحظات حول جودة الهاتف أو اهتمام العميل..."
                      rows={2}
                    />

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="secondary"
                        isLoading={savingFeedback}
                      >
                        إرسال التقييم
                      </Button>
                    </div>
                  </form>
                </Card>

                {/* Deal Timeline & Activity per Spec 7.13 */}
                <Card>
                  <CardHeader>
                    <CardTitle>سجل الملاحظات والنشاط (Timeline)</CardTitle>
                  </CardHeader>
                  <div className="p-4">
                    <DealTimeline
                      events={[
                        ...(lead.myClaim?.notes
                          ? [
                              {
                                id: 'note-claim',
                                type: 'NOTE' as const,
                                author: 'ملاحظة أولية',
                                content: lead.myClaim.notes,
                                createdAt: lead.myClaim.claimedAt,
                              },
                            ]
                          : []),
                        ...(lead.myClaim?.lastContactedAt
                          ? [
                              {
                                id: 'contact-claim',
                                type: 'STATUS_CHANGE' as const,
                                author: 'محاولة تواصل',
                                content: 'آخر تواصل مسجل مع العميل',
                                createdAt: lead.myClaim.lastContactedAt,
                              },
                            ]
                          : []),
                      ]}
                      onAddNote={async (content) => {
                        const res = await fetch(`/api/leads/${leadId}/engagement/status`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            status: pipelineStatus,
                            note: content,
                          }),
                        });
                        if (res.ok) {
                          setActionMsg({ type: 'info', text: 'تم تسجيل الملاحظة بنجاح.' });
                          await loadLead();
                        }
                      }}
                      onReportWrongNumber={async () => {
                        const res = await fetch(`/api/leads/${leadId}/contact-attempts`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            channel: 'PHONE',
                            result: 'WRONG_NUMBER',
                            note: 'إبلاغ عن رقم خاطئ',
                          }),
                        });
                        if (res.ok) {
                          setActionMsg({
                            type: 'info',
                            text: 'سنرسل إشارة لإعادة التحقق من الرقم. لن يُحذف الرقم فوراً.',
                          });
                          await loadLead();
                        }
                      }}
                    />
                  </div>
                </Card>
              </div>
            )}
          </div>

          {/* Aside Column (4) Sticky Card per Spec Section 8 & 7.10 */}
          <div className="lg:col-span-4">
            <div className="sticky top-20 flex flex-col gap-5 p-6 rounded-xl border border-line bg-surface shadow-xs">
              {/* Price Section */}
              <div className="flex flex-col gap-1 pb-4 border-b border-line">
                <span className="text-caption text-fg-secondary">تكلفة فتح البيانات</span>
                <div className="flex items-baseline gap-2">
                  <span className="ltr-iso font-mono text-display font-bold leading-none tabular-nums text-fg-primary">
                    {fmtNumber(price)}
                  </span>
                  <span className="text-body text-fg-secondary font-medium">نقطة رصيد</span>
                </div>
                <span className="text-caption text-fg-muted mt-1">
                  الميزانية المقدرة:{' '}
                  <span className="ltr-iso font-mono font-medium text-fg-secondary">
                    {fmtNumber(lead.estimatedBudget)}
                  </span>{' '}
                  ج.م
                </span>
              </div>

              {/* Ownership Explanation */}
              <div className="flex flex-col gap-2">
                <OwnershipTag
                  type={lead.exclusive ? 'EXCLUSIVE' : 'SHARED'}
                  seatsRemaining={
                    lead.exclusive
                      ? undefined
                      : Math.max(0, (lead.maxPurchasers || 3) - (lead.currentPurchasers || 0))
                  }
                  maxSeats={lead.exclusive ? undefined : lead.maxPurchasers || 3}
                />
                <p className="text-body-sm text-fg-secondary leading-relaxed">
                  {lead.exclusive
                    ? 'ستكون الجهة الوحيدة التي تحصل على بيانات هذه الفرصة.'
                    : `يمكن لعدد أقصى من ${lead.maxPurchasers || 3} مطورين الحصول على هذه الفرصة.`}
                </p>
              </div>

              {/* Action Button */}
              {lead.isClaimedByMe ? (
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  disabled
                >
                  الفرصة مملوكة لديك
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={() => setIsPurchaseModalOpen(true)}
                  disabled={
                    lead.status !== 'AVAILABLE' ||
                    Boolean(lead.saleabilityStatus && lead.saleabilityStatus !== 'AVAILABLE')
                  }
                >
                  شراء بيانات الفرصة
                </Button>
              )}

              {/* Trust & Reassurance Line per Spec 4 & 7.10 */}
              <p className="text-caption text-fg-muted text-center">
                العملية نهائية ومحمية بنظام النقاط المعتمد.
              </p>
            </div>
          </div>
        </div>

        {/* Mobile Sticky Bottom Bar per Spec Section 8 */}
        <div className="lg:hidden fixed bottom-0 inset-x-0 bg-surface border-t border-line p-4 flex items-center justify-between z-20 shadow-md">
          <div className="flex flex-col">
            <span className="text-caption text-fg-secondary">التكلفة</span>
            <span className="ltr-iso font-mono font-bold text-body text-fg-primary">
              {fmtNumber(price)} نقطة
            </span>
          </div>

          {lead.isClaimedByMe ? (
            <Button variant="secondary" size="md" disabled>
              تم الشراء
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsPurchaseModalOpen(true)}
              disabled={
                lead.status !== 'AVAILABLE' ||
                Boolean(lead.saleabilityStatus && lead.saleabilityStatus !== 'AVAILABLE')
              }
            >
              شراء الفرصة
            </Button>
          )}
        </div>

        {/* Purchase Confirmation Dialog per Spec 7.10 */}
        <PurchaseConfirm
          isOpen={isPurchaseModalOpen}
          onClose={() => setIsPurchaseModalOpen(false)}
          lead={{
            id: lead.id,
            name: lead.businessName,
            temperature: (lead.temperature as LeadTemperature) || 'HOT',
            score: lead.score,
            ownershipType: lead.exclusive ? 'EXCLUSIVE' : 'SHARED',
            price,
            maxSeats: lead.maxPurchasers,
            phone: lead.phone || undefined,
            email: lead.email || undefined,
          }}
          userBalance={userCredits}
          onConfirmPurchase={handleClaim}
        />
      </div>
    </AppShell>
  );
}
