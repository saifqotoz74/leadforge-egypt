'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import {
  CATEGORY_LABELS_AR,
  FEEDBACK_REASON_LABELS,
  PIPELINE_STATUS_LABELS,
  TEMPERATURE_LABELS,
  WEBSITE_STATUS_LABELS,
} from '@/lib/constants';
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  Globe,
  Phone,
  Mail,
  MapPin,
  Star,
  Clock,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck,
  Layers,
  Save,
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
    classification?: string;
  } | null;
  qualityScore?: number;
  qualityStatus?: string;
  completenessScore?: number;
  freshnessStatus?: string;
  verificationStatus?: string;
  saleabilityStatus?: string;
  businessStatus?: string;
  qualityFlags?: string[];
  qualitySummary?: string | null;
  verifications?: {
    id: string;
    verificationType: string;
    status: string;
    details?: Record<string, unknown> | null;
    checkedAt: string;
    expiresAt?: string | null;
  }[];
  status: string;
  confidence: string;
  qualificationReasons: string[];
  qualificationRules: {
    ruleId: string;
    code: string;
    name: string;
    nameEn: string;
    weight: number;
  }[];
  scoreHistory?: {
    id: string;
    previousScore?: number | null;
    newScore: number;
    previousClassification?: string | null;
    newClassification: string;
    scoringVersion: string;
    trigger: string;
    calculatedAt: string;
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
    analyzedAt?: string;
  } | null;
  leadType: string;
  exclusive: boolean;
  maxPurchasers: number;
  currentPurchasers: number;
  source: string;
  sourceList: string[];
  lastVerifiedAt: string;
  freshness: {
    status: string;
    labelAr: string;
    daysSinceVerified: number;
    badgeClass: string;
  };
  matchEvaluation: {
    isMatch: boolean;
    matchPercentage: number;
    matchedCriteria: string[];
    unmatchedCriteria: string[];
  };
  isClaimedByMe: boolean;
  myClaim?: {
    id: string;
    pipelineStatus: string;
    notes?: string | null;
    lastContactedAt?: string | null;
    nextFollowUpAt?: string | null;
    claimedAt: string;
    statusHistories?: {
      id: string;
      previousStatus?: string | null;
      newStatus: string;
      reasonCode?: string | null;
      note?: string | null;
      notes?: string | null;
      actorType?: string;
      createdAt: string;
    }[];
  } | null;
  myEngagement?: {
    id: string;
    currentStatus: string;
    finalOutcome?: string | null;
    outcomeReasonCode?: string | null;
    outcomeReasonNote?: string | null;
    estimatedProjectValue?: number | null;
    currency?: string;
    wonReason?: string | null;
    lostReasonCode?: string | null;
    invalidReasonCode?: string | null;
    claimedAt: string;
    firstContactedAt?: string | null;
    lastContactedAt?: string | null;
  } | null;
  myFeedback?: {
    id: string;
    useful: boolean;
    reason?: string | null;
    category?: string;
    reasonCode?: string | null;
    rating?: number | null;
    confidence?: string;
    comment?: string | null;
  } | null;
  myFeedbacks?: {
    id: string;
    useful: boolean;
    category: string;
    reasonCode?: string | null;
    rating?: number | null;
    confidence: string;
    comment?: string | null;
    createdAt: string;
  }[];
  myContactAttempts?: {
    id: string;
    channel: string;
    result: string;
    note?: string | null;
    attemptedAt: string;
  }[];
}

const ALLOWED_UI_TRANSITIONS: Record<string, string[]> = {
  CLAIMED: ['CONTACTED', 'INVALID', 'NOT_INTERESTED'],
  CONTACTED: ['REPLIED', 'NOT_INTERESTED', 'LOST', 'INVALID'],
  REPLIED: ['INTERESTED', 'NOT_INTERESTED', 'LOST', 'INVALID'],
  INTERESTED: ['MEETING', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'NOT_INTERESTED', 'INVALID'],
  MEETING: ['PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'INVALID'],
  PROPOSAL_SENT: ['NEGOTIATION', 'WON', 'LOST', 'INVALID'],
  NEGOTIATION: ['WON', 'LOST', 'INVALID'],
  WON: [],
  LOST: [],
  NOT_INTERESTED: [],
  INVALID: [],
};

const LOST_REASONS_LIST = [
  'PRICE',
  'COMPETITOR',
  'NO_BUDGET',
  'NO_RESPONSE',
  'TIMING',
  'WRONG_CONTACT',
  'WRONG_BUSINESS',
  'DUPLICATE',
  'BUSINESS_CLOSED',
  'NOT_INTERESTED',
  'SERVICE_MISMATCH',
  'OTHER',
];

const INVALID_REASONS_LIST = [
  'WRONG_PHONE',
  'WRONG_EMAIL',
  'BUSINESS_CLOSED',
  'BUSINESS_NOT_FOUND',
  'DUPLICATE',
  'WRONG_CATEGORY',
  'WRONG_LOCATION',
  'FAKE_BUSINESS',
  'ALREADY_CLIENT',
  'OTHER',
];

const STRUCTURED_FEEDBACK_OPTIONS: Record<string, string[]> = {
  CONTACT: [
    'CONTACT_SUCCESSFUL',
    'PHONE_ANSWERED',
    'PHONE_NO_ANSWER',
    'PHONE_UNREACHABLE',
    'PHONE_INVALID',
    'WHATSAPP_ACTIVE',
    'WHATSAPP_INACTIVE',
    'EMAIL_VALID',
    'EMAIL_UNRESPONSIVE',
    'EMAIL_INVALID',
    'EMAIL_BOUNCED',
  ],
  BUSINESS: [
    'BUSINESS_OPEN',
    'BUSINESS_CLOSED',
    'BUSINESS_DUPLICATE',
    'BUSINESS_MOVED',
    'BUSINESS_WRONG_CATEGORY',
    'BUSINESS_WRONG_LOCATION',
    'WRONG_CATEGORY',
    'WRONG_LOCATION',
    'ALREADY_HAS_GOOD_WEBSITE',
    'NO_WEBSITE_CONFIRMED',
  ],
  SALES: [
    'INTERESTED',
    'HIGH_INTEREST',
    'MEETING_BOOKED',
    'REQUESTED_QUOTE',
    'NOT_INTERESTED',
    'ALREADY_WORKING_WITH_DEVELOPER',
    'BUDGET_TOO_LOW',
    'BUDGET_TOO_HIGH',
    'TIMING_NOT_RIGHT',
    'LOW_BUDGET',
    'PRICE_OBJECTION',
    'COMPETITOR_CHOSEN',
    'DECISION_DELAYED',
    'NOT_DECISION_MAKER',
    'NEED_FOLLOW_UP',
  ],
  LEAD_QUALITY: [
    'GREAT_LEAD',
    'GOOD_LEAD',
    'HIGH_QUALITY_LEAD',
    'POOR_LEAD',
    'LOW_QUALITY_LEAD',
    'INVALID_LEAD',
    'INCOMPLETE_CONTACT_INFO',
    'MISLEADING_DESCRIPTION',
    'DUPLICATE_LEAD',
  ],
};

export default function LeadDetailPage() {
  const params = useParams();
  const leadId = String(params.id || '');

  const [lead, setLead] = useState<LeadDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

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

  const loadLead = useCallback(async () => {
    setLoading(true);
    try {
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
        setActionMsg({ type: 'error', text: data.error || 'تعذر فتح بيانات الفرصة.' });
      } else {
        setActionMsg({
          type: 'success',
          text: `تم فتح بيانات التواصل بنجاح! الرصيد المتبقي: ${data.remainingCredits} نقطة.`,
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('leadforge:user-updated'));
        }
        await loadLead();
      }
    } catch {
      setActionMsg({ type: 'error', text: 'حدث خطأ أثناء الاتصال بالخادم.' });
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
        setActionMsg({ type: 'error', text: data.error || 'تعذر تحديث الحالة.' });
      } else {
        setActionMsg({ type: 'success', text: 'تم تحديث مرحلة الصفقة وحفظ السجل بنجاح.' });
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
        setActionMsg({ type: 'error', text: data.error || 'تعذر تسجيل محاولة التواصل.' });
      } else {
        setContactNote('');
        setActionMsg({ type: 'success', text: 'تم تسجيل محاولة التواصل بنجاح.' });
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
        setActionMsg({ type: 'error', text: data.error || 'تعذر حفظ التقييم.' });
      } else {
        setActionMsg({ type: 'success', text: 'شكرًا لك! تم تسجيل التقييم المنظم لجودة هذه الفرصة.' });
        await loadLead();
      }
    } finally {
      setSavingFeedback(false);
    }
  }

  return (
    <AppShell>
      {loading || !lead ? (
        <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white p-6" />
      ) : (
        <div className="space-y-6">
          {/* Top Breadcrumb */}
          <div className="flex items-center justify-between">
            <Link
              href="/leads"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-emerald-600"
            >
              <ArrowRight className="h-4 w-4" />
              <span>العودة إلى اكتشاف العملاء</span>
            </Link>
          </div>

          {actionMsg && (
            <div
              className={`rounded-xl border p-4 text-xs font-bold ${
                actionMsg.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {actionMsg.text}
            </div>
          )}

          {/* Header Summary Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-extrabold ${
                      (TEMPERATURE_LABELS[lead.temperature] || TEMPERATURE_LABELS.HOT).badgeClass
                    }`}
                  >
                    Opportunity: {lead.temperature} — {lead.score}/100
                  </span>

                  {typeof lead.qualityScore === 'number' && (
                    <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-extrabold text-teal-800">
                      Quality: {lead.qualityStatus || 'HIGH'} — {lead.qualityScore}/100
                    </span>
                  )}

                  {lead.verificationStatus && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                      {lead.verificationStatus}
                    </span>
                  )}

                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${
                      lead.exclusive
                        ? 'border-purple-200 bg-purple-50 text-purple-800'
                        : 'border-slate-200 bg-slate-100 text-slate-700'
                    }`}
                  >
                    {lead.exclusive
                      ? 'فرصة حصرية (Exclusive 1/1)'
                      : `فرصة مشتركة (${lead.currentPurchasers}/${lead.maxPurchasers} مشترين)`}
                  </span>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${lead.freshness.badgeClass}`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {lead.freshness.labelAr} ({lead.freshnessStatus || lead.freshness.status})
                  </span>
                </div>

                <h1 className="mt-3 text-2xl font-extrabold text-slate-900">
                  {lead.businessName}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
                  <span>{CATEGORY_LABELS_AR[lead.category] || lead.category}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {lead.governorate} — {lead.city}
                    {lead.area ? ` (${lead.area})` : ''}
                  </span>
                  {lead.address && <span>• {lead.address}</span>}
                </p>
              </div>

              <div className="flex flex-col items-stretch sm:items-end gap-2">
                {lead.isClaimedByMe ? (
                  <span className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-100 px-4 py-2.5 text-xs font-extrabold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    الفرصة مملوكة في قائمة عملائك
                  </span>
                ) : (
                  <button
                    onClick={handleClaim}
                    disabled={
                      claiming ||
                      lead.status !== 'AVAILABLE' ||
                      Boolean(lead.saleabilityStatus && lead.saleabilityStatus !== 'AVAILABLE')
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>
                      {claiming
                        ? 'جاري فتح البيانات...'
                        : lead.status === 'CLAIMED_FULL' ||
                          lead.saleabilityStatus === 'CLAIMED_FULL'
                        ? 'هذه الفرصة مكتملة العدد'
                        : lead.status !== 'AVAILABLE' ||
                          (lead.saleabilityStatus && lead.saleabilityStatus !== 'AVAILABLE')
                        ? 'هذه الفرصة غير متاحة للشراء حاليًا (تحتاج تحقق)'
                        : 'اقتناص الفرصة وفتح بيانات التواصل (1 نقطة)'}
                    </span>
                  </button>
                )}
                <span className="text-xs font-bold text-slate-500">
                  الميزانية التقديرية للمشروع: {lead.estimatedBudget.toLocaleString()} ج.م
                </span>
              </div>
            </div>

            {/* Contact & Digital Info Grid */}
            <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3.5">
                <span className="text-xs text-slate-400">رقم الهاتف:</span>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
                  <Phone className="h-4 w-4 text-emerald-600" />
                  <span dir="ltr">{lead.phone || 'غير متوفر'}</span>
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3.5">
                <span className="text-xs text-slate-400">البريد الإلكتروني:</span>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-extrabold text-slate-900 truncate">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <span dir="ltr">{lead.email || 'غير متوفر'}</span>
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3.5">
                <span className="text-xs text-slate-400">فيسبوك / إنستجرام:</span>
                <div className="mt-1 text-xs font-bold text-slate-800 space-y-1">
                  <p className="truncate">
                    FB: {lead.hasFacebook ? lead.facebook : 'غير متوفر'}
                  </p>
                  <p className="truncate">
                    IG: {lead.hasInstagram ? lead.instagram : 'غير متوفر'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3.5">
                <span className="text-xs text-slate-400">التقييم والفروع:</span>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {lead.rating ?? '—'} ({lead.reviewCount} مراجعة) • {lead.branchCount} فرع
                </p>
              </div>
            </div>
          </div>

          {/* Qualification Breakdown & Website Analyzer Row */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Qualification Rules Breakdown */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  لماذا حصل هذا العميل على تقييم {lead.score}/100؟ (Qualification Breakdown)
                </h2>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-[11px] font-bold text-slate-600">
                  Engine {lead.scoringVersion || 'v1'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                تقييم قياسي مبني على القواعد النشطة في النظام بدون أي تخمين.
              </p>

              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-slate-700" dir="ltr">
                <div>Score: <strong>{lead.score}/100</strong></div>
                <div>Classification: <strong>{lead.classification || lead.temperature}</strong></div>
                <div className="mt-1 font-semibold text-slate-800">Why:</div>
                <ul className="mt-1 space-y-0.5">
                  {Array.isArray(lead.qualificationRules) &&
                    lead.qualificationRules.map((rule) => (
                      <li key={`why-${rule.code}`}>
                        {rule.weight >= 0 ? `+${rule.weight}` : `${rule.weight}`} {rule.nameEn || rule.name}
                      </li>
                    ))}
                </ul>
              </div>

              <div className="mt-4 space-y-2">
                {Array.isArray(lead.qualificationRules) &&
                  lead.qualificationRules.map((rule) => (
                    <div
                      key={rule.code}
                      className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs ${
                        rule.weight >= 0
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-amber-200 bg-amber-50/60'
                      }`}
                    >
                      <span className="flex items-center gap-2 font-bold text-slate-800">
                        <CheckCircle2
                          className={`h-4 w-4 ${
                            rule.weight >= 0 ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                        />
                        {rule.name} ({rule.nameEn})
                      </span>
                      <span
                        className={`rounded-lg px-2.5 py-0.5 font-extrabold text-white ${
                          rule.weight >= 0 ? 'bg-emerald-600' : 'bg-amber-600'
                        }`}
                      >
                        {rule.weight >= 0 ? `+${rule.weight}` : rule.weight}
                      </span>
                    </div>
                  ))}
              </div>

              {/* Score Audit History */}
              {Array.isArray(lead.scoreHistory) && lead.scoreHistory.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3.5 text-xs">
                  <span className="font-extrabold text-slate-800">
                    سجل التقييمات التدقيقي (Score History):
                  </span>
                  <div className="mt-2 space-y-1.5">
                    {lead.scoreHistory.slice(0, 3).map((snap) => (
                      <div
                        key={snap.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700"
                      >
                        <span dir="ltr" className="font-mono font-bold">
                          {snap.previousScore !== null && snap.previousScore !== undefined
                            ? `${snap.previousScore} → ${snap.newScore}/100`
                            : `${snap.newScore}/100`}{' '}
                          ({snap.newClassification})
                        </span>
                        <span className="text-slate-500">
                          {snap.trigger} • {snap.scoringVersion}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sources & Deduplication History */}
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
                <span className="flex items-center gap-1.5 font-extrabold text-slate-800">
                  <Layers className="h-4 w-4 text-slate-600" />
                  المصادر المدمجة (Sources & Deduplication):
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(lead.sourceList || [lead.source]).map((src, i) => (
                    <span
                      key={i}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-bold text-slate-700"
                    >
                      ├── {src}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Website Analyzer Report (Section 20) */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                <Globe className="h-5 w-5 text-blue-600" />
                تقرير فاحص المواقع الفني (Rule-Based Website Analyzer)
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                تحليل فني لبنية الموقع وحالة النطاق لاكتشاف فرص التطوير أو إعادة التصميم.
              </p>

              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-600">حالة الموقع:</span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-bold ${
                      (
                        WEBSITE_STATUS_LABELS[lead.websiteStatus] ||
                        WEBSITE_STATUS_LABELS.UNKNOWN
                      ).badgeClass
                    }`}
                  >
                    {
                      (
                        WEBSITE_STATUS_LABELS[lead.websiteStatus] ||
                        WEBSITE_STATUS_LABELS.UNKNOWN
                      ).labelAr
                    }
                  </span>
                </div>

                {lead.website && (
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-600">الرابط المسجل:</span>
                    <span dir="ltr" className="font-mono font-bold text-slate-800">
                      {lead.website}
                    </span>
                  </div>
                )}

                {lead.websiteAnalysis && lead.websiteStatus !== 'NO_WEBSITE' && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                    <div>
                      <span className="text-slate-400">حالة النطاق / HTTP:</span>{' '}
                      <strong className="text-slate-800">
                        {lead.websiteAnalysis.domainStatus || 'ACTIVE'} ({lead.websiteAnalysis.httpStatus ?? 'N/A'})
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">تشفير HTTPS / SSL:</span>{' '}
                      <strong
                        className={
                          lead.websiteAnalysis.isHttps && lead.websiteAnalysis.sslValid
                            ? 'text-emerald-700'
                            : 'text-rose-600'
                        }
                      >
                        {lead.websiteAnalysis.isHttps && lead.websiteAnalysis.sslValid
                          ? '✓ مفعل وصالح'
                          : '✕ غير مفعل'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">توافق الموبايل (Viewport):</span>{' '}
                      <strong
                        className={
                          lead.websiteAnalysis.hasMobileViewport
                            ? 'text-emerald-700'
                            : 'text-rose-600'
                        }
                      >
                        {lead.websiteAnalysis.hasMobileViewport ? '✓ متوافق' : '✕ غير متوافق'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">زمن الاستجابة:</span>{' '}
                      <strong className="text-slate-800">
                        {lead.websiteAnalysis.responseTimeMs
                          ? `${lead.websiteAnalysis.responseTimeMs} ms`
                          : '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">عنوان الصفحة (Title):</span>{' '}
                      <strong className="text-slate-800">
                        {lead.websiteAnalysis.title || '✕ مفقود'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">وصف Meta Description:</span>{' '}
                      <strong className="text-slate-800">
                        {lead.websiteAnalysis.metaDescription ? '✓ متوفر' : '✕ مفقود'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">مؤشرات التجاوب (Responsive):</span>{' '}
                      <strong
                        className={
                          lead.websiteAnalysis.hasResponsiveIndicators
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }
                      >
                        {lead.websiteAnalysis.hasResponsiveIndicators ? '✓ حديثة' : '✕ ضعيفة'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">هيكل HTML البرمجي:</span>{' '}
                      <strong
                        className={
                          lead.websiteAnalysis.isOldBasicStructure
                            ? 'text-rose-600'
                            : 'text-emerald-700'
                        }
                      >
                        {lead.websiteAnalysis.isOldBasicStructure
                          ? '✕ قديم/بدائي (يحتاج تطوير)'
                          : '✓ قياسي حديث'}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {lead.websiteAnalysis?.opportunityReasons &&
                lead.websiteAnalysis.opportunityReasons.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-slate-700">
                      نقاط الفرصة البيعية المكتشفة تقنيًا:
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {lead.websiteAnalysis.opportunityReasons.map((op) => (
                        <div
                          key={op.code}
                          className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900"
                        >
                          <span className="flex items-center gap-1.5">
                            <XCircle className="h-4 w-4 text-amber-600" />
                            {op.reasonAr}
                          </span>
                          <span>+{op.points} فرصة</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Phase 3 Data Quality & Verification Breakdown (Clean Developer Signals) */}
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-800">
                    مؤشرات جودة وحداثة الفرصة (Lead Quality & Verification):
                  </span>
                  <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 font-mono font-extrabold text-teal-800">
                    Lead Quality: {lead.qualityStatus || 'HIGH'} ({lead.qualityScore ?? 100}/100)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-700" dir="ltr">
                  <div>
                    Lead Quality: <strong>{lead.qualityStatus || 'HIGH'}</strong>
                  </div>
                  <div>
                    Freshness:{' '}
                    <strong>
                      Verified {lead.freshness?.daysSinceVerified ?? 0} days ago
                    </strong>
                  </div>
                  <div>
                    Verified:{' '}
                    <strong>
                      {lead.hasPhone && lead.businessStatus !== 'CLOSED'
                        ? 'Phone + Business Active'
                        : lead.businessStatus !== 'CLOSED'
                          ? 'Business Active'
                          : 'Needs Review'}
                    </strong>
                  </div>
                  <div>
                    Contact:{' '}
                    <strong>
                      {lead.hasPhone
                        ? 'Phone Available'
                        : lead.hasEmail
                          ? 'Email Available'
                          : 'Social Channel Available'}
                    </strong>
                  </div>
                  <div>
                    Website:{' '}
                    <strong>
                      {lead.websiteStatus === 'NO_WEBSITE'
                        ? 'No Website'
                        : lead.websiteStatus === 'POOR_WEBSITE'
                          ? 'Outdated / Poor Website'
                          : 'Has Website'}
                    </strong>
                  </div>
                  <div>
                    Completeness: <strong>{lead.completenessScore ?? 100}%</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Phase 6 Engagement Lifecycle, Contact Attempts, Structured Feedback & Timeline (Visible when claimed) */}
          {lead.isClaimedByMe && (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-12">
                {/* Engagement Status State Machine & Outcome Form */}
                <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">
                        تتبع مرحلة التعاقد والنتيجة (Phase 6 Engagement State Machine)
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        انتقالات قياسية محكومة (State Machine) خاصة بحسابك فقط دون التأثير على المطورين الآخرين.
                      </p>
                    </div>
                    {(() => {
                      const cur =
                        lead.myEngagement?.currentStatus ||
                        (lead.myClaim?.pipelineStatus === 'NEW'
                          ? 'CLAIMED'
                          : lead.myClaim?.pipelineStatus || 'CLAIMED');
                      const info = PIPELINE_STATUS_LABELS[cur] || PIPELINE_STATUS_LABELS.CLAIMED;
                      return (
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-extrabold ${info.badgeClass}`}
                        >
                          الحالة الحالية: {info.labelAr} ({cur})
                        </span>
                      );
                    })()}
                  </div>

                  {(() => {
                    const currentEngStatus =
                      lead.myEngagement?.currentStatus ||
                      (lead.myClaim?.pipelineStatus === 'NEW'
                        ? 'CLAIMED'
                        : lead.myClaim?.pipelineStatus || 'CLAIMED');
                    const allowedNext = ALLOWED_UI_TRANSITIONS[currentEngStatus] || [];
                    const isTerminal = ['WON', 'LOST', 'NOT_INTERESTED', 'INVALID'].includes(
                      currentEngStatus
                    );

                    if (isTerminal) {
                      return (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
                          <div className="font-extrabold text-slate-900">
                            تم إغلاق هذه الفرصة في حالة نهائية ({currentEngStatus})
                          </div>
                          {lead.myEngagement?.estimatedProjectValue ? (
                            <div className="text-emerald-700 font-bold">
                              قيمة المشروع التقديرية:{' '}
                              {lead.myEngagement.estimatedProjectValue.toLocaleString()}{' '}
                              {lead.myEngagement.currency || 'EGP'}
                            </div>
                          ) : null}
                          {lead.myEngagement?.outcomeReasonCode ? (
                            <div className="text-slate-700">
                              كود السبب: <strong>{lead.myEngagement.outcomeReasonCode}</strong>
                            </div>
                          ) : null}
                          {lead.myEngagement?.outcomeReasonNote ? (
                            <div className="text-slate-600">
                              ملاحظات الإغلاق: {lead.myEngagement.outcomeReasonNote}
                            </div>
                          ) : null}
                          <p className="text-[11px] text-slate-500">
                            الحالات النهائية مقفلة ضد التغيير المباشر لضمان سلامة التقارير. لتصحيح خطأ غير مقصود، يمكن لمدير النظام استخدام Admin Status Correction.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <form onSubmit={handleSaveStatus} className="mt-4 space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-bold text-slate-700">
                              الانتقال إلى المرحلة التالية (Allowed Next States)
                            </label>
                            <select
                              value={pipelineStatus}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                setPipelineStatus(nextVal);
                                if (nextVal === 'LOST') setOutcomeReasonCode('PRICE');
                                if (nextVal === 'INVALID') setOutcomeReasonCode('WRONG_PHONE');
                              }}
                              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold"
                            >
                              {allowedNext.map((key) => {
                                const info = PIPELINE_STATUS_LABELS[key] || { labelAr: key };
                                return (
                                  <option key={key} value={key}>
                                    {info.labelAr} ({key})
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700">
                              موعد المتابعة القادم (Next Follow-Up)
                            </label>
                            <input
                              type="date"
                              value={nextFollowUpAt}
                              onChange={(e) => setNextFollowUpAt(e.target.value)}
                              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold"
                            />
                          </div>
                        </div>

                        {pipelineStatus === 'WON' && (
                          <div className="grid gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-bold text-emerald-900">
                                قيمة المشروع المتفق عليها (ج.م - اختياري)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={estimatedProjectValue}
                                onChange={(e) => setEstimatedProjectValue(e.target.value)}
                                placeholder="مثال: 18000"
                                className="mt-1 w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-emerald-900">
                                ملخص الفوز بالصفقة (Won Reason)
                              </label>
                              <input
                                type="text"
                                value={wonReason}
                                onChange={(e) => setWonReason(e.target.value)}
                                placeholder="مثال: التعاقد على تطوير موقع حجز متكامل..."
                                className="mt-1 w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold"
                              />
                            </div>
                          </div>
                        )}

                        {pipelineStatus === 'LOST' && (
                          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5">
                            <label className="block text-xs font-bold text-rose-900">
                              سبب خسارة الصفقة (LOST Reason Code — إلزامي)
                            </label>
                            <select
                              value={outcomeReasonCode}
                              onChange={(e) => setOutcomeReasonCode(e.target.value)}
                              className="mt-1.5 w-full rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-bold"
                            >
                              {LOST_REASONS_LIST.map((code) => (
                                <option key={code} value={code}>
                                  {code}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {pipelineStatus === 'INVALID' && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
                            <label className="block text-xs font-bold text-amber-900">
                              سبب عدم صلاحية الفرصة (INVALID Reason Code — يرسل إشارة تحقق لمحرك الجودة)
                            </label>
                            <select
                              value={outcomeReasonCode}
                              onChange={(e) => setOutcomeReasonCode(e.target.value)}
                              className="mt-1.5 w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold"
                            >
                              {INVALID_REASONS_LIST.map((code) => (
                                <option key={code} value={code}>
                                  {FEEDBACK_REASON_LABELS[code]
                                    ? `${FEEDBACK_REASON_LABELS[code]} (${code})`
                                    : code}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-bold text-slate-700">
                            ملاحظات المرحلة / تفاصيل العرض (Notes)
                          </label>
                          <textarea
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="سجل تفاصيل المكالمة، السعر المقترح، أو سبب الإغلاق..."
                            className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-xs font-semibold"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={savingStatus || allowedNext.length === 0}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" />
                          <span>
                            {savingStatus ? 'جاري الحفظ...' : `تأكيد الانتقال إلى ${pipelineStatus}`}
                          </span>
                        </button>
                      </form>
                    );
                  })()}

                  {/* Contact Attempt Logger */}
                  <div className="mt-6 border-t border-slate-100 pt-5">
                    <h3 className="text-sm font-extrabold text-slate-900">
                      تسجيل محاولة تواصل (Contact Attempt Log)
                    </h3>
                    <form
                      onSubmit={handleRecordContactAttempt}
                      className="mt-3 grid gap-3 sm:grid-cols-4"
                    >
                      <select
                        value={contactChannel}
                        onChange={(e) => setContactChannel(e.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                      >
                        <option value="PHONE">هاتف (PHONE)</option>
                        <option value="WHATSAPP">واتساب (WHATSAPP)</option>
                        <option value="EMAIL">بريد (EMAIL)</option>
                        <option value="SMS">رسالة (SMS)</option>
                        <option value="SOCIAL">سوشيال (SOCIAL)</option>
                        <option value="OTHER">أخرى (OTHER)</option>
                      </select>

                      <select
                        value={contactResult}
                        onChange={(e) => setContactResult(e.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                      >
                        <option value="ANSWERED">تم الرد (ANSWERED)</option>
                        <option value="NO_ANSWER">لا يوجد رد (NO_ANSWER)</option>
                        <option value="MESSAGE_SENT">تم إرسال رسالة (MESSAGE_SENT)</option>
                        <option value="REPLIED">تفاعل بالرد (REPLIED)</option>
                        <option value="INVALID_NUMBER">رقم غير صحيح (INVALID_NUMBER)</option>
                        <option value="BOUNCED">ارتداد البريد (BOUNCED)</option>
                        <option value="BLOCKED">محظور (BLOCKED)</option>
                        <option value="OTHER">أخرى (OTHER)</option>
                      </select>

                      <input
                        type="text"
                        value={contactNote}
                        onChange={(e) => setContactNote(e.target.value)}
                        placeholder="ملاحظة سريعة عن المحاولة..."
                        className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                      />

                      <button
                        type="submit"
                        disabled={savingContact}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-extrabold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        {savingContact ? 'جاري الحفظ...' : '+ تسجيل المحاولة'}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Structured Feedback Form */}
                <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-base font-extrabold text-slate-900">
                    التقييم المنظم لجودة الفرصة (Structured Lead Feedback)
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    أرسل إشارات جودة مصنفة (CONTACT / BUSINESS / SALES / LEAD_QUALITY) لتحسين التحقق.
                  </p>

                  <form onSubmit={handleSaveFeedback} className="mt-4 space-y-3.5">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setUseful(true)}
                        className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-extrabold transition ${
                          useful === true
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <ThumbsUp className="h-4 w-4" />
                        <span>مفيدة (Useful)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setUseful(false)}
                        className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-extrabold transition ${
                          useful === false
                            ? 'border-rose-600 bg-rose-50 text-rose-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <ThumbsDown className="h-4 w-4" />
                        <span>تحتاج مراجعة (Issue)</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          فئة التقييم (Category)
                        </label>
                        <select
                          value={feedbackCategory}
                          onChange={(e) => {
                            const cat = e.target.value;
                            setFeedbackCategory(cat);
                            const firstCode = STRUCTURED_FEEDBACK_OPTIONS[cat]?.[0] || 'OTHER';
                            setFeedbackReason(firstCode);
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                        >
                          <option value="CONTACT">بيانات التواصل (CONTACT)</option>
                          <option value="BUSINESS">حالة النشاط (BUSINESS)</option>
                          <option value="SALES">المبيعات والميزانية (SALES)</option>
                          <option value="LEAD_QUALITY">جودة الفرصة (LEAD_QUALITY)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          التقييم الرقمي (Rating 1-5)
                        </label>
                        <select
                          value={feedbackRating}
                          onChange={(e) => setFeedbackRating(Number(e.target.value))}
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                        >
                          <option value={5}>5 / 5 — ممتازة</option>
                          <option value={4}>4 / 5 — جيدة جدًا</option>
                          <option value={3}>3 / 5 — متوسطة</option>
                          <option value={2}>2 / 5 — ضعيفة</option>
                          <option value={1}>1 / 5 — غير صالحة</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700">
                        رمز السبب المعياري (Structured Reason Code)
                      </label>
                      <select
                        value={feedbackReason}
                        onChange={(e) => setFeedbackReason(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                      >
                        {(STRUCTURED_FEEDBACK_OPTIONS[feedbackCategory] || []).map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                        <option value="OTHER">OTHER</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700">
                        ملاحظات إضافية (Comment)
                      </label>
                      <input
                        type="text"
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        placeholder="تفاصيل إضافية حول التواصل أو حالة العميل..."
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={savingFeedback}
                      className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-extrabold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {savingFeedback ? 'جاري إرسال التقييم...' : 'إرسال التقييم المنظم'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Engagement History & Activity Timeline */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-extrabold text-slate-900">
                  سجل النشاط والانتقالات ومرات التواصل (Developer Engagement Timeline)
                </h3>
                <div className="mt-4 grid gap-4 md:grid-cols-3 text-xs">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <div className="font-extrabold text-slate-800 mb-2">
                      انتقالات الحالة ({lead.myClaim?.statusHistories?.length || 0})
                    </div>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {(lead.myClaim?.statusHistories || []).map((h) => (
                        <div
                          key={h.id}
                          className="rounded-lg bg-white p-2 border border-slate-200 text-[11px]"
                        >
                          <div className="font-mono font-bold text-slate-800" dir="ltr">
                            {h.previousStatus || 'INITIAL'} → {h.newStatus}
                          </div>
                          {h.reasonCode && (
                            <div className="text-emerald-700 font-bold">Reason: {h.reasonCode}</div>
                          )}
                          {(h.note || h.notes) && (
                            <div className="text-slate-600">{h.note || h.notes}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <div className="font-extrabold text-slate-800 mb-2">
                      محاولات التواصل ({lead.myContactAttempts?.length || 0})
                    </div>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {(lead.myContactAttempts || []).map((a) => (
                        <div
                          key={a.id}
                          className="rounded-lg bg-white p-2 border border-slate-200 text-[11px]"
                        >
                          <div className="font-mono font-bold text-indigo-700" dir="ltr">
                            {a.channel} — {a.result}
                          </div>
                          {a.note && <div className="text-slate-600">{a.note}</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <div className="font-extrabold text-slate-800 mb-2">
                      سجل التقييمات ({lead.myFeedbacks?.length || 0})
                    </div>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {(lead.myFeedbacks || []).map((f) => (
                        <div
                          key={f.id}
                          className="rounded-lg bg-white p-2 border border-slate-200 text-[11px]"
                        >
                          <div className="font-mono font-bold text-teal-800" dir="ltr">
                            [{f.category}] {f.reasonCode} ({f.confidence})
                          </div>
                          {f.rating && <div className="text-amber-600 font-bold">★ {f.rating}/5</div>}
                          {f.comment && <div className="text-slate-600">{f.comment}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
