'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import {
  CATEGORY_LABELS_AR,
  FEEDBACK_REASON_LABELS,
  PIPELINE_STATUS_LABELS,
  TEMPERATURE_LABELS,
} from '@/lib/constants';
import {
  Phone,
  Mail,
  ExternalLink,
  MessageSquare,
  Calendar,
  CheckCircle2,
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

export default function MyLeadsPage() {
  const [leads, setLeads] = useState<ClaimedLeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [feedbackModalLead, setFeedbackModalLead] = useState<ClaimedLeadItem | null>(null);
  const [fbUseful, setFbUseful] = useState<boolean>(true);
  const [fbReason, setFbReason] = useState('WRONG_PHONE');
  const [fbComment, setFbComment] = useState('');

  const loadMyLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads?claimedOnly=true');
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMyLeads();
  }, [loadMyLeads]);

  async function handleQuickStatusChange(leadId: string, newStatus: string) {
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
  }

  const filteredLeads =
    statusFilter === 'ALL'
      ? leads
      : leads.filter((l) => l.myClaim?.pipelineStatus === statusFilter);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
              عملائي ومتابعة الصفقات (My Claimed Leads CRM)
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              تتبع مراحل التفاوض مع العملاء الذين قمت بفتح بياناتهم وسجل ملاحظاتك وتقييمك لكل فرصة.
            </p>
          </div>
          <Link
            href="/leads"
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700"
          >
            + اقتناص عملاء جدد
          </Link>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            الكل ({leads.length})
          </button>
          {Object.entries(PIPELINE_STATUS_LABELS).map(([key, info]) => {
            const count = leads.filter((l) => l.myClaim?.pipelineStatus === key).length;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`rounded-xl px-3 py-2 text-xs font-bold ${
                  statusFilter === key
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {info.labelAr} ({count})
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white p-6" />
        ) : filteredLeads.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-base font-extrabold text-slate-800">
              لا توجد صفقات في هذه المرحلة حاليًا
            </p>
            <Link
              href="/leads"
              className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white"
            >
              تصفح العملاء المحتملين
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLeads.map((lead) => {
              const pStatus = lead.myClaim?.pipelineStatus || 'NEW';
              const pInfo =
                PIPELINE_STATUS_LABELS[pStatus] || PIPELINE_STATUS_LABELS.NEW;
              const tempInfo =
                TEMPERATURE_LABELS[lead.temperature] || TEMPERATURE_LABELS.HOT;

              return (
                <div
                  key={lead.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="text-lg font-extrabold text-slate-900 hover:text-emerald-600"
                        >
                          {lead.businessName}
                        </Link>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${tempInfo.badgeClass}`}
                        >
                          {lead.score}/100
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${pInfo.badgeClass}`}
                        >
                          {pInfo.labelAr}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-slate-500">
                        {lead.city} • {CATEGORY_LABELS_AR[lead.category] || lead.category}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-bold text-slate-800">
                        {lead.phone && (
                          <span className="flex items-center gap-1 text-emerald-700">
                            <Phone className="h-3.5 w-3.5" />
                            <span dir="ltr">{lead.phone}</span>
                          </span>
                        )}
                        {lead.email && (
                          <span className="flex items-center gap-1 text-blue-700">
                            <Mail className="h-3.5 w-3.5" />
                            <span dir="ltr">{lead.email}</span>
                          </span>
                        )}
                        {lead.myClaim?.nextFollowUpAt && (
                          <span className="flex items-center gap-1 text-purple-700">
                            <Calendar className="h-3.5 w-3.5" />
                            متابعة قادمة:{' '}
                            {new Date(lead.myClaim.nextFollowUpAt).toLocaleDateString('ar-EG')}
                          </span>
                        )}
                      </div>

                      {lead.myClaim?.notes && (
                        <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                          <strong>ملاحظاتك:</strong> {lead.myClaim.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <select
                        value={pStatus}
                        disabled={updatingId === lead.id}
                        onChange={(e) => handleQuickStatusChange(lead.id, e.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                      >
                        {Object.entries(PIPELINE_STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            تغيير الحالة: {v.labelAr}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => {
                          setFeedbackModalLead(lead);
                          setFbUseful(lead.myFeedback ? lead.myFeedback.useful : true);
                          setFbReason(lead.myFeedback?.reason || 'WRONG_PHONE');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        {lead.myFeedback ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            تم التقييم
                          </>
                        ) : (
                          <>
                            <MessageSquare className="h-3.5 w-3.5 text-amber-600" />
                            هل كانت مفيدة؟
                          </>
                        )}
                      </button>

                      <Link
                        href={`/leads/${lead.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        التفاصيل والملاحظات
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Feedback Modal */}
        {feedbackModalLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-base font-extrabold text-slate-900">
                هل كانت فرصة &quot;{feedbackModalLead.businessName}&quot; مفيدة؟
              </h3>
              <form onSubmit={handleSubmitFeedback} className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFbUseful(true)}
                    className={`rounded-xl border py-2.5 text-xs font-bold ${
                      fbUseful
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    نعم (Yes)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFbUseful(false)}
                    className={`rounded-xl border py-2.5 text-xs font-bold ${
                      !fbUseful
                        ? 'border-rose-600 bg-rose-50 text-rose-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    لا (No)
                  </button>
                </div>

                {!fbUseful && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700">
                      سبب عدم الفائدة:
                    </label>
                    <select
                      value={fbReason}
                      onChange={(e) => setFbReason(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                    >
                      {Object.entries(FEEDBACK_REASON_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    ملاحظات إضافية:
                  </label>
                  <input
                    type="text"
                    value={fbComment}
                    onChange={(e) => setFbComment(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setFeedbackModalLead(null)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
                  >
                    حفظ التقييم
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
