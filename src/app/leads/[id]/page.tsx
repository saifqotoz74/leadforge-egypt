'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { ScorePair } from '@/components/domain/ScorePair';
import { ScoreBreakdown, ScoreRuleItem } from '@/components/domain/ScoreBreakdown';
import { OwnershipTag } from '@/components/domain/OwnershipTag';
import { PurchaseConfirm } from '@/components/domain/PurchaseConfirm';
import { DealTimeline } from '@/components/domain/DealTimeline';
import { LeadTemperature } from '@/components/domain/OpportunityBadge';
import { QualityState } from '@/components/domain/QualityIndicator';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { LockedField } from '@/components/ui/LockedField';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog } from '@/components/ui/Dialog';
import { PIPELINE_STATUS_LABELS } from '@/lib/constants';
import { localizeCity, localizeCategory } from '@/lib/taxonomy';
import { fmtNumber } from '@/lib/format';
import {
  CheckCircle2,
  Copy,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  MessageCircle,
  MapPin,
  Navigation,
  ExternalLink,
} from 'lucide-react';
import { WhatsAppOutreachModal } from '@/components/domain/WhatsAppOutreachModal';

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
  const t = useTranslations('lead');
  const tCommon = useTranslations('common');
  const tGeo = useTranslations('geo');
  const tCat = useTranslations('categories');
  const tEnums = useTranslations('enums');
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const leadId = String(params.id || '');

  const [lead, setLead] = useState<LeadDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setClaiming] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'info' | 'warning' | 'danger'; text: string } | null>(
    null
  );
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Status tracking state
  const [pipelineStatus, setPipelineStatus] = useState('CLAIMED');
  const [outcomeReasonCode] = useState('PRICE');
  const [estimatedProjectValue] = useState('');
  const [wonReason] = useState('');
  const [notes, setNotes] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [isInvalidConfirmOpen, setIsInvalidConfirmOpen] = useState(false);

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
        setActionMsg({ type: 'danger', text: data.error || t('claimError') });
      } else {
        setActionMsg({
          type: 'info',
          text: t('claimSuccess', { remaining: fmtNumber(data.remainingCredits, locale) }),
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('leadforge:user-updated'));
        }
        setIsPurchaseModalOpen(false);
        await loadLead();
      }
    } catch {
      setActionMsg({ type: 'danger', text: t('networkError') });
    } finally {
      setClaiming(false);
    }
  }

  async function executeSaveStatus(targetStatus: string) {
    setSavingStatus(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/engagement/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          reasonCode:
            targetStatus === 'LOST' || targetStatus === 'INVALID'
              ? outcomeReasonCode
              : undefined,
          estimatedProjectValue:
            targetStatus === 'WON' && estimatedProjectValue.trim() !== ''
              ? Number(estimatedProjectValue)
              : undefined,
          currency: 'EGP',
          wonReason: targetStatus === 'WON' ? wonReason || notes : undefined,
          note: notes,
          nextFollowUpAt: nextFollowUpAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ type: 'danger', text: data.error || t('statusUpdateError') });
      } else {
        setActionMsg({ type: 'info', text: t('statusUpdateSuccess') });
        await loadLead();
      }
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleSaveStatus(e: React.FormEvent) {
    e.preventDefault();
    if (pipelineStatus === 'INVALID') {
      setIsInvalidConfirmOpen(true);
      return;
    }
    await executeSaveStatus(pipelineStatus);
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
        setActionMsg({ type: 'danger', text: data.error || t('feedbackError') });
      } else {
        setActionMsg({ type: 'info', text: t('feedbackSuccess') });
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

  if (loading) {
    return (
      <AppShell density="comfortable" pageTitle={t('pageTitle')}>
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

  if (!lead) {
    return (
      <AppShell density="comfortable" pageTitle={t('pageTitle')}>
        <div className="py-12">
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyDesc')}
            action={{
              label: t('breadcrumbsLeads'),
              onClick: () => router.push('/leads'),
            }}
          />
        </div>
      </AppShell>
    );
  }

  const isFieldVisit = !lead.hasPhone && !lead.phone;
  const price = lead.creditCost ?? (isFieldVisit ? 1 : (lead.exclusive ? 25 : 5));
  const derivedRules: ScoreRuleItem[] =
    Array.isArray(lead.qualificationRules) && lead.qualificationRules.length > 0
      ? lead.qualificationRules.map((r) => ({
          id: r.code,
          label: locale === 'en' ? r.nameEn || r.name : r.name,
          points: r.weight,
          maxWeight: 40,
        }))
      : (lead.websiteAnalysis?.opportunityReasons || []).map((op) => ({
          id: op.code,
          label: locale === 'en' ? op.reasonEn || op.reasonAr : op.reasonAr,
          points: op.points,
          maxWeight: 40,
        }));

  const localizedCategory = localizeCategory(lead.category, tCat as any);
  const localizedCity = localizeCity(lead.city, tGeo as any);
  const localizedGov = localizeCity(lead.governorate, tGeo as any);
  const localizedArea = lead.area ? localizeCity(lead.area, tGeo as any) : '';
  const areaSep = locale === 'ar' ? '، ' : ', ';
  const locationSubtitle = `${localizedCategory} • ${localizedCity}${
    localizedArea ? `${areaSep}${localizedArea}` : ''
  }`;
  const fullAddressDisplay = lead.address || `${localizedGov} • ${localizedCity}`;

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
          description={locationSubtitle}
          breadcrumbs={[
            { label: t('breadcrumbsDashboard'), href: '/dashboard' },
            { label: t('breadcrumbsLeads'), href: '/leads' },
            { label: lead.businessName },
          ]}
          actions={
            <Link href="/leads">
              <Button
                variant="ghost"
                size="sm"
                startIcon={<ArrowRight className="w-4 h-4 rtl:-scale-x-100" />}
              >
                {t('breadcrumbsLeads')}
              </Button>
            </Link>
          }
        />

        {/* Global Feedback Banner */}
        {actionMsg && (
          <Banner variant={actionMsg.type}>
            {actionMsg.text}
          </Banner>
        )}

        {/* Field Visit Notice Callout */}
        {isFieldVisit && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 dark:border-amber-800/40 text-amber-900 dark:text-amber-200">
            <MapPin className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-body">فرصة زيارة ميدانية / تواصل سوشيال ميديا 📍</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-semibold bg-amber-200/60 text-amber-900 dark:bg-amber-800/60 dark:text-amber-100">
                  سعر مخفض: 1 نقطة فقط
                </span>
              </div>
              <p className="text-body-sm text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                هذا النشاط التجاري متاح للزيارة الميدانية المباشرة أو التواصل عبر منصات التواصل الاجتماعي. نظراً لعدم توفر رقم هاتف مباشر، تم تخفيض تكلفة الحصول على بياناته إلى نقطة واحدة فقط بدلاً من 5 نقاط.
              </p>
            </div>
          </div>
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
                title={t('whyScore')}
                rules={derivedRules}
                totalScore={lead.score}
              />
            )}

            {/* 3. Business Details (Locked or Revealed per Spec 1.1, 7.4 & Template T4) */}
            <Card>
              <CardHeader>
                <CardTitle>{t('contactAndBusiness')}</CardTitle>
                {lead.isClaimedByMe ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft text-brand text-caption font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    {t('dataUnlocked')}
                  </span>
                ) : (
                  <span className="text-caption text-fg-secondary">
                    {t('dataLocked')}
                  </span>
                )}
              </CardHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                {/* Phone */}
                <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-subtle border border-line">
                  <span className="text-caption text-fg-secondary">{t('phoneNumber')}</span>
                  {lead.isClaimedByMe && lead.phone ? (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <a
                          href={`tel:${lead.phone}`}
                          className="ltr-iso font-semibold tabular-nums text-fg-brand hover:underline"
                        >
                          {lead.phone}
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(lead.phone!, 'phone')}
                          startIcon={<Copy className="w-3.5 h-3.5" />}
                        >
                          {copiedField === 'phone' ? t('copied') : t('copy')}
                        </Button>
                      </div>

                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setIsWhatsAppModalOpen(true)}
                        startIcon={<MessageCircle className="w-4 h-4" />}
                        className="w-full justify-center"
                      >
                        بدء محادثة واتساب وعرض المقترح
                      </Button>
                    </div>
                  ) : isFieldVisit ? (
                    <div className="py-1">
                      <span className="text-body-sm text-fg-muted font-medium">
                        غير متوفر (فرصة مخصصة للزيارة الميدانية / تواصل سوشيال)
                      </span>
                    </div>
                  ) : (
                    <LockedField type="phone" />
                  )}
                </div>

                {/* Email */}
                <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-subtle border border-line">
                  <span className="text-caption text-fg-secondary">{t('emailAddress')}</span>
                  {lead.isClaimedByMe && lead.email ? (
                    <div className="flex items-center justify-between">
                      <a
                        href={`mailto:${lead.email}`}
                        title={lead.email}
                        className="ltr-iso font-semibold text-fg-brand hover:underline truncate max-w-44" /* design-allow: truncate */
                      >
                        {lead.email}
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(lead.email!, 'email')}
                        startIcon={<Copy className="w-3.5 h-3.5" />}
                      >
                        {copiedField === 'email' ? t('copied') : t('copy')}
                      </Button>
                    </div>
                  ) : (
                    <LockedField type="email" />
                  )}
                </div>

                {/* Website */}
                <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-subtle border border-line">
                  <span className="text-caption text-fg-secondary">{t('website')}</span>
                  {lead.website ? (
                    <a
                      href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={lead.website}
                      className="ltr-iso text-body-sm text-fg-brand hover:underline truncate" /* design-allow: truncate */
                    >
                      {lead.website}
                    </a>
                  ) : (
                    <span className="text-body-sm text-fg-muted">{t('noWebsite')}</span>
                  )}
                </div>

                {/* Location */}
                <div className="flex flex-col gap-2 p-3 rounded-lg bg-subtle border border-line sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-caption text-fg-secondary">{t('locationAddress')}</span>
                    <span className="inline-flex items-center gap-1 text-caption text-fg-brand">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>موقع النشاط التجاري</span>
                    </span>
                  </div>
                  <p
                    title={fullAddressDisplay}
                    className="text-body-sm text-fg-primary"
                  >
                    {fullAddressDisplay}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${lead.businessName} ${lead.address || `${localizedGov} ${localizedCity}`}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line bg-surface text-fg-primary hover:border-line-strong hover:bg-subtle text-caption font-semibold transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5 text-brand" />
                      <span>فتح الموقع على خرائط جوجل (Google Maps) 📍</span>
                    </a>

                    {lead.facebook && (
                      <a
                        href={lead.facebook}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface text-fg-primary hover:border-line-strong hover:bg-subtle text-caption font-medium transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>صفحة فيسبوك</span>
                      </a>
                    )}

                    {lead.instagram && (
                      <a
                        href={lead.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface text-fg-primary hover:border-line-strong hover:bg-subtle text-caption font-medium transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>حساب إنستغرام</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* 4. Technical Analysis Card */}
            {lead.websiteAnalysis && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('techAnalysis')}</CardTitle>
                </CardHeader>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 text-body-sm">
                  <div className="p-3 rounded-lg bg-subtle">
                    <span className="text-caption text-fg-secondary block">{t('httpsEncryption')}</span>
                    <span className="font-semibold text-fg-primary">
                      {lead.websiteAnalysis.isHttps && lead.websiteAnalysis.sslValid ? t('enabled') : t('disabled')}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-subtle">
                    <span className="text-caption text-fg-secondary block">{t('mobileCompatibility')}</span>
                    <span className="font-semibold text-fg-primary">
                      {lead.websiteAnalysis.hasMobileViewport ? t('compatible') : t('incompatible')}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-subtle">
                    <span className="text-caption text-fg-secondary block">{t('responseTime')}</span>
                    <span className="ltr-iso font-semibold tabular-nums text-fg-primary">
                      {lead.websiteAnalysis.responseTimeMs ? `${fmtNumber(lead.websiteAnalysis.responseTimeMs, locale)} ms` : '-'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-subtle">
                    <span className="text-caption text-fg-secondary block">{t('siteStructure')}</span>
                    <span className="font-semibold text-fg-primary">
                      {lead.websiteAnalysis.isOldBasicStructure ? t('needsUpdate') : t('standardModern')}
                    </span>
                  </div>
                </div>
              </Card>
            )}

            {/* 5. Claimed Lead Actions (CRM Pipeline & Feedback) */}
            {lead.isClaimedByMe && (
              <div id="deal-pipeline" className="flex flex-col gap-6">
                {/* Pipeline Stage Management */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('pipelineTitle')}</CardTitle>
                  </CardHeader>
                  <form onSubmit={handleSaveStatus} className="flex flex-col gap-4 py-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Select
                        label={t('stageLabel')}
                        value={pipelineStatus}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'INVALID') {
                            setIsInvalidConfirmOpen(true);
                          } else {
                            setPipelineStatus(val);
                          }
                        }}
                        options={Object.keys(PIPELINE_STATUS_LABELS).map((k) => ({
                          value: k,
                          label: tEnums(`PipelineStatus.${k}`),
                        }))}
                      />

                      <Input
                        label={t('nextFollowUp')}
                        type="date"
                        value={nextFollowUpAt}
                        onChange={(e) => setNextFollowUpAt(e.target.value)}
                      />
                    </div>

                    <Textarea
                      label={t('followUpNotes')}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t('followUpPlaceholder')}
                      rows={3}
                    />

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        isLoading={savingStatus}
                      >
                        {t('saveStage')}
                      </Button>
                    </div>
                  </form>
                </Card>

                {/* Structured Feedback Form */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('qualityFeedbackTitle')}</CardTitle>
                  </CardHeader>
                  <form onSubmit={handleSaveFeedback} className="flex flex-col gap-4 py-2">
                    <div className="flex items-center gap-4">
                      <span className="text-label text-fg-primary">{t('wasUseful')}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant={useful === true ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => setUseful(true)}
                          startIcon={<ThumbsUp className="w-3.5 h-3.5" />}
                        >
                          {t('yes')}
                        </Button>
                        <Button
                          type="button"
                          variant={useful === false ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={() => setUseful(false)}
                          startIcon={<ThumbsDown className="w-3.5 h-3.5" />}
                        >
                          {t('no')}
                        </Button>
                      </div>
                    </div>

                    <Textarea
                      label={t('feedbackCommentLabel')}
                      value={feedbackComment}
                      onChange={(e) => setFeedbackComment(e.target.value)}
                      placeholder={t('feedbackCommentPlaceholder')}
                      rows={2}
                    />

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="secondary"
                        isLoading={savingFeedback}
                      >
                        {t('sendFeedback')}
                      </Button>
                    </div>
                  </form>
                </Card>

                {/* Deal Timeline & Activity per Spec 7.13 */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('timelineTitle')}</CardTitle>
                  </CardHeader>
                  <div className="p-4">
                    <DealTimeline
                      events={[
                        ...(lead.myClaim?.notes
                          ? [
                              {
                                id: 'note-claim',
                                type: 'NOTE' as const,
                                author: t('noteInitial'),
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
                                author: t('noteContact'),
                                content: t('noteContactContent'),
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
                          setActionMsg({ type: 'info', text: t('noteSuccess') });
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
                            note: t('wrongNumberReport'),
                          }),
                        });
                        if (res.ok) {
                          setActionMsg({
                            type: 'info',
                            text: t('wrongNumberSignal'),
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
                <div className="flex items-center justify-between">
                  <span className="text-caption text-fg-secondary">{t('costUnlock')}</span>
                  {isFieldVisit && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                      خصم زيارة ميدانية (1 نقطة)
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="ltr-iso text-display font-bold leading-none tabular-nums text-fg-primary">
                    {fmtNumber(price, locale)}
                  </span>
                  <span className="text-body text-fg-secondary font-medium">{t('pointCredits')}</span>
                </div>
                <span className="text-caption text-fg-muted mt-1">
                  {t('estimatedBudget')}{' '}
                  <span className="ltr-iso font-medium tabular-nums text-fg-secondary">
                    {fmtNumber(lead.estimatedBudget, locale)}
                  </span>{' '}
                  {t('egp')}
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
                    ? t('exclusiveExplanation')
                    : t('sharedExplanation', { count: lead.maxPurchasers || 3 })}
                </p>
              </div>

              {/* Action Button — Block 3.3: Post-purchase clear next action */}
              {lead.isClaimedByMe ? (
                <Link href="/my-leads" className="w-full">
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    endIcon={<ArrowRight className="w-4 h-4 rtl:-scale-x-100" />}
                  >
                    {t('goToDeal')}
                  </Button>
                </Link>
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
                  {t('purchaseLead')}
                </Button>
              )}

              {/* Trust & Reassurance Line per Spec 4 & 7.10 */}
              <p className="text-caption text-fg-muted text-center">
                {t('trustReassurance')}
              </p>
            </div>
          </div>
        </div>

        {/* Mobile Sticky Bottom Bar per Spec Section 8 */}
        <div className="lg:hidden fixed bottom-0 inset-x-0 bg-surface border-t border-line p-4 flex items-center justify-between z-20 shadow-md">
          <div className="flex flex-col">
            <span className="text-caption text-fg-secondary">{t('costUnlock')}</span>
            <span className="ltr-iso font-bold tabular-nums text-body text-fg-primary">
              {fmtNumber(price, locale)} {t('points')}
            </span>
          </div>

          {lead.isClaimedByMe ? (
            <Link href="/my-leads">
              <Button
                variant="primary"
                size="md"
                endIcon={<ArrowRight className="w-4 h-4 rtl:-scale-x-100" />}
              >
                {t('goToDeal')}
              </Button>
            </Link>
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
              {t('purchaseLead')}
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

        {/* Confirmation Dialog for INVALID Status (UX-013) */}
        <Dialog
          isOpen={isInvalidConfirmOpen}
          onClose={() => setIsInvalidConfirmOpen(false)}
          title={t('confirmInvalidTitle')}
          size="sm"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setIsInvalidConfirmOpen(false)}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                variant="primary"
                isLoading={savingStatus}
                onClick={async () => {
                  setPipelineStatus('INVALID');
                  setIsInvalidConfirmOpen(false);
                  await executeSaveStatus('INVALID');
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
        {lead && (
          <WhatsAppOutreachModal
            isOpen={isWhatsAppModalOpen}
            onClose={() => setIsWhatsAppModalOpen(false)}
            leadId={lead.id}
            businessName={lead.businessName}
            phone={lead.phone}
            category={lead.category}
            city={lead.city}
            governorate={lead.governorate}
            website={lead.website}
            websiteStatus={lead.websiteStatus}
            nextFollowUpAt={lead.myClaim?.nextFollowUpAt || null}
            onContactLogged={loadLead}
          />
        )}
      </div>
    </AppShell>
  );
}
