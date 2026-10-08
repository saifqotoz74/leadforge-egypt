'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Phone,
  Mail,
  Globe,
  Star,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Clock,
  Layers,
  ShieldAlert,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import {
  CATEGORY_LABELS_AR,
  TEMPERATURE_LABELS,
  WEBSITE_STATUS_LABELS,
} from '@/lib/constants';

export interface LeadCardItem {
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
  websiteStatus: 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN';
  facebook?: string | null;
  hasFacebook: boolean;
  instagram?: string | null;
  hasInstagram: boolean;
  rating?: number | null;
  reviewCount: number;
  branchCount: number;
  estimatedBudget: number;
  score: number;
  temperature: 'COLD' | 'WARM' | 'HOT' | 'PREMIUM';
  classification?: 'COLD' | 'WARM' | 'HOT' | 'PREMIUM';
  scoringVersion?: string;
  scoreExplanation?: {
    summary?: string;
    reasons?: Array<string | { ruleKey?: string; label?: string; points?: number; reason?: string }>;
    version?: string;
  } | null;
  qualityScore?: number;
  qualityStatus?: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EXCELLENT' | string;
  completenessScore?: number;
  freshnessStatus?: 'FRESH' | 'RECENT' | 'NEEDS_VERIFICATION' | 'STALE' | 'VERY_STALE' | 'UNKNOWN' | string;
  verificationStatus?: 'UNVERIFIED' | 'PARTIALLY_VERIFIED' | 'VERIFIED' | 'FAILED_VERIFICATION' | string;
  saleabilityStatus?: string;
  qualityFlags?: string[];
  status: string;
  qualificationReasons: string[];
  qualificationRules?: {
    ruleId: string;
    code: string;
    name: string;
    nameEn: string;
    weight: number;
  }[];
  leadType: 'SHARED' | 'EXCLUSIVE';
  exclusive: boolean;
  maxPurchasers: number;
  currentPurchasers: number;
  source: string;
  sourceList?: string[];
  lastVerifiedAt: string;
  freshness?: {
    status: string;
    labelAr: string;
    daysSinceVerified: number;
    badgeClass: string;
  };
  matchEvaluation?: {
    isMatch: boolean;
    eligible?: boolean;
    matchPercentage: number;
    matchStrength?: number;
    matchVersion?: string;
    matchedCriteria: string[];
    unmatchedCriteria?: string[];
  };
  isClaimedByMe?: boolean;
}

const QUALITY_BADGE_MAP: Record<string, { label: string; cls: string }> = {
  EXCELLENT: { label: 'جودة ممتازة', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  HIGH: { label: 'جودة مرتفعة', cls: 'border-teal-200 bg-teal-50 text-teal-800' },
  MEDIUM: { label: 'جودة متوسطة', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  LOW: { label: 'جودة منخفضة', cls: 'border-orange-200 bg-orange-50 text-orange-800' },
  VERY_LOW: { label: 'جودة ضعيفة', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
};

const VERIFICATION_BADGE_MAP: Record<string, { label: string; cls: string }> = {
  VERIFIED: { label: '✓ موثق (Verified)', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  PARTIALLY_VERIFIED: { label: '✓ موثق جزئيًا', cls: 'border-blue-200 bg-blue-50 text-blue-800' },
  UNVERIFIED: { label: 'غير موثق', cls: 'border-slate-200 bg-slate-100 text-slate-600' },
  FAILED_VERIFICATION: { label: 'فشل التحقق', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
};

export function LeadCard({
  lead,
  onClaimSuccess,
}: {
  lead: LeadCardItem;
  onClaimSuccess?: (leadId: string, remainingCredits: number) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tempInfo = TEMPERATURE_LABELS[lead.temperature] || TEMPERATURE_LABELS.WARM;
  const webInfo = WEBSITE_STATUS_LABELS[lead.websiteStatus] || WEBSITE_STATUS_LABELS.UNKNOWN;
  const categoryAr = CATEGORY_LABELS_AR[lead.category] || lead.category;
  const qualityBadge =
    QUALITY_BADGE_MAP[lead.qualityStatus || 'HIGH'] || QUALITY_BADGE_MAP.HIGH;
  const verificationBadge =
    VERIFICATION_BADGE_MAP[lead.verificationStatus || 'VERIFIED'] ||
    VERIFICATION_BADGE_MAP.VERIFIED;

  const isSoldOut =
    !lead.isClaimedByMe &&
    (lead.status !== 'AVAILABLE' ||
      (lead.saleabilityStatus && lead.saleabilityStatus !== 'AVAILABLE') ||
      lead.currentPurchasers >= lead.maxPurchasers ||
      (lead.exclusive && lead.currentPurchasers >= 1));

  async function handleConfirmClaim() {
    setClaiming(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'تعذر اقتناص الفرصة.');
      } else {
        setConfirmOpen(false);
        if (onClaimSuccess) {
          onClaimSuccess(lead.id, data.remainingCredits);
        }
      }
    } catch {
      setErrorMsg('حدث خطأ في الاتصال بالخادم.');
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div>
        {/* Header Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold ${tempInfo.badgeClass}`}
              title="Opportunity Score (تقييم الفرصة البيعية)"
            >
              {tempInfo.labelEn} — {lead.score}/100
            </span>

            {typeof lead.qualityScore === 'number' && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${qualityBadge.cls}`}
                title="Data Quality Score (تقييم جودة وموثوقية البيانات)"
              >
                {qualityBadge.label} ({lead.qualityScore}/100)
              </span>
            )}

            {lead.matchEvaluation && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${
                  lead.matchEvaluation.isMatch
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                    : 'border-slate-200 bg-slate-100 text-slate-600'
                }`}
                title="Phase 4 Deterministic Match Strength (درجة التطابق مع ملفك)"
              >
                {lead.matchEvaluation.isMatch
                  ? `تطابق ${lead.matchEvaluation.matchStrength ?? lead.matchEvaluation.matchPercentage}%`
                  : 'غير متطابق'}
              </span>
            )}

            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${verificationBadge.cls}`}
            >
              {verificationBadge.label}
            </span>

            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                lead.exclusive
                  ? 'border-purple-200 bg-purple-50 text-purple-700'
                  : 'border-slate-200 bg-slate-100 text-slate-700'
              }`}
            >
              {lead.exclusive ? 'حصري (Exclusive 1/1)' : `مشترك (${lead.currentPurchasers}/${lead.maxPurchasers})`}
            </span>
          </div>

          {lead.freshness && (
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${lead.freshness.badgeClass}`}
            >
              <Clock className="h-3 w-3" />
              {lead.freshness.daysSinceVerified === 0
                ? 'تم التحقق اليوم (FRESH)'
                : `تم التحقق منذ ${lead.freshness.daysSinceVerified} يوم (${lead.freshnessStatus || lead.freshness.status})`}
            </span>
          )}
        </div>

        {/* Business Title & Category */}
        <div className="mt-3">
          <Link
            href={`/leads/${lead.id}`}
            className="text-lg font-extrabold text-slate-900 hover:text-emerald-600"
          >
            {lead.businessName}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
              {categoryAr} ({lead.category})
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              {lead.city}
              {lead.area ? ` — ${lead.area}` : ''}
            </span>
          </div>
          {lead.address && (
            <p className="mt-1 text-xs text-slate-500 truncate">{lead.address}</p>
          )}
        </div>

        {/* Website & Digital Presence Grid */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl bg-slate-50 p-3 text-xs">
          <div>
            <span className="block text-[11px] text-slate-400">حالة الموقع الإلكتروني:</span>
            {lead.websiteStatus === 'NO_WEBSITE' ? (
              <span className="mt-0.5 flex items-center gap-1 font-bold text-rose-600">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                لا يوجد موقع (No website)
              </span>
            ) : lead.websiteStatus === 'POOR_WEBSITE' ? (
              <span className="mt-0.5 flex items-center gap-1 font-bold text-amber-600">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                موقع قديم/ضعيف تقنيًا
              </span>
            ) : lead.websiteStatus === 'UNKNOWN' ? (
              <span className="mt-0.5 flex items-center gap-1 font-semibold text-slate-500">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                غير محدد (Unknown)
              </span>
            ) : (
              <span className="mt-0.5 flex items-center gap-1 font-semibold text-slate-700">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                يمتلك موقعًا
              </span>
            )}
          </div>

          <div>
            <span className="block text-[11px] text-slate-400">تقييمات ومراجعات جوجل:</span>
            <span className="mt-0.5 flex items-center gap-1 font-bold text-slate-800">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {lead.rating ? `${lead.rating} / 5` : 'غير متاح'} ({lead.reviewCount} تقييم)
            </span>
          </div>

          <div>
            <span className="block text-[11px] text-slate-400">الهاتف والبريد:</span>
            <div className="mt-0.5 flex items-center gap-2 font-semibold">
              <span
                className={`flex items-center gap-1 ${
                  lead.hasPhone ? 'text-emerald-700' : 'text-slate-400'
                }`}
              >
                <Phone className="h-3.5 w-3.5" />
                {lead.hasPhone ? (lead.isClaimedByMe ? lead.phone : '✓ متاح') : '✕'}
              </span>
              <span
                className={`flex items-center gap-1 ${
                  lead.hasEmail ? 'text-emerald-700' : 'text-slate-400'
                }`}
              >
                <Mail className="h-3.5 w-3.5" />
                {lead.hasEmail ? '✓ متاح' : '✕'}
              </span>
            </div>
          </div>

          <div>
            <span className="block text-[11px] text-slate-400">التواجد الاجتماعي:</span>
            <div className="mt-0.5 flex items-center gap-2 font-semibold">
              <span className={lead.hasFacebook ? 'text-blue-600' : 'text-slate-400'}>
                FB: {lead.hasFacebook ? '✓ متاح' : '✕'}
              </span>
              <span className={lead.hasInstagram ? 'text-pink-600' : 'text-slate-400'}>
                IG: {lead.hasInstagram ? '✓ متاح' : '✕'}
              </span>
            </div>
          </div>
        </div>

        {/* Why this lead qualifies (Rule-based breakdown) */}
        <div className="mt-3.5">
          <p className="text-xs font-bold text-slate-700">
            لماذا هذه الفرصة مؤهلة؟ (Why this lead qualifies):
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {Array.isArray(lead.qualificationRules) && lead.qualificationRules.length > 0 ? (
              lead.qualificationRules.slice(0, 5).map((r) => (
                <span
                  key={r.code}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                    r.weight >= 0
                      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
                      : 'border-amber-200 bg-amber-50/70 text-amber-800'
                  }`}
                >
                  <CheckCircle2
                    className={`h-3 w-3 ${r.weight >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}
                  />
                  {r.weight >= 0 ? `+${r.weight}` : r.weight} {r.name}
                </span>
              ))
            ) : (
              lead.qualificationReasons.slice(0, 4).map((reason, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50/70 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  {reason}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Phase 4: Why this lead matched you */}
        {lead.matchEvaluation &&
          (lead.matchEvaluation.matchedCriteria.length > 0 ||
            (lead.matchEvaluation.unmatchedCriteria &&
              lead.matchEvaluation.unmatchedCriteria.length > 0)) && (
            <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-2.5">
              <p className="text-[11px] font-bold text-indigo-900">
                {lead.matchEvaluation.isMatch
                  ? `لماذا يتطابق هذا العميل مع ملفك؟ (Match Strength: ${lead.matchEvaluation.matchStrength ?? lead.matchEvaluation.matchPercentage}%)`
                  : 'أسباب عدم التطابق مع تفضيلاتك الحالية:'}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {lead.matchEvaluation.isMatch
                  ? lead.matchEvaluation.matchedCriteria.slice(0, 4).map((crit, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-800"
                      >
                        ✓ {crit}
                      </span>
                    ))
                  : (lead.matchEvaluation.unmatchedCriteria || []).slice(0, 3).map((fail, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-800"
                      >
                        ✕ {fail}
                      </span>
                    ))}
              </div>
            </div>
          )}

        {/* Source & Estimated Budget */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
          <span className="flex items-center gap-1 truncate">
            <Layers className="h-3.5 w-3.5 text-slate-400" />
            المصدر:{' '}
            <strong className="text-slate-700">
              {lead.sourceList && lead.sourceList.length > 1
                ? `${lead.sourceList.join(' + ')}`
                : lead.source}
            </strong>
          </span>
          <span className="font-bold text-slate-700">
            الميزانية التقديرية: {lead.estimatedBudget.toLocaleString()} ج.م
          </span>
        </div>
      </div>

      {/* Actions Footer */}
      <div className="mt-4 flex items-center gap-2.5 border-t border-slate-100 pt-3.5">
        <Link
          href={`/leads/${lead.id}`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          تفاصيل التقييم والنشاط
        </Link>

        {lead.isClaimedByMe ? (
          <Link
            href={`/leads/${lead.id}`}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-100 px-3 py-2.5 text-xs font-bold text-emerald-800"
          >
            <Unlock className="h-3.5 w-3.5" />
            تم فتح بيانات العميل
          </Link>
        ) : isSoldOut ? (
          <button
            disabled
            className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-xl bg-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500"
          >
            <Lock className="h-3.5 w-3.5" />
            مكتمل العدد / مباع
          </button>
        ) : (
          <button
            onClick={() => setConfirmOpen(true)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            <Sparkles className="h-3.5 w-3.5" />
            اقتناص الفرصة (1 نقطة)
          </button>
        )}
      </div>

      {/* Confirmation Dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-extrabold text-slate-900">
              تأكيد الحصول على بيانات العميل
            </h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              هل ترغب في استخدام <strong>1 نقطة رصيد (Credit)</strong> لفتح بيانات التواصل الكاملة
              مع <strong>{lead.businessName}</strong> وإضافته إلى قائمة عملائك؟
            </p>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
              <p>• التقييم القياسي: {lead.score}/100 ({tempInfo.labelEn})</p>
              <p>• الحالة: {webInfo.labelAr}</p>
              <p>• الملكية: {lead.exclusive ? 'فرصة حصرية لك فقط' : 'فرصة مشتركة'}</p>
            </div>

            {errorMsg && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                {errorMsg}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  setErrorMsg(null);
                }}
                disabled={claiming}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmClaim}
                disabled={claiming}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {claiming ? 'جاري الخصم والفتح...' : 'تأكيد وفتح البيانات'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
