'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ALL_CITIES, BUSINESS_CATEGORIES } from '@/lib/constants';
import {
  Plus,
  Upload,
  CheckCircle2,
  Trash2,
  Edit3,
  ShieldAlert,
  UserPlus,
  RefreshCw,
} from 'lucide-react';

interface AdminLeadRow {
  id: string;
  businessName: string;
  category: string;
  city: string;
  area?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  websiteStatus: string;
  facebook?: string | null;
  instagram?: string | null;
  rating?: number | null;
  reviewCount: number;
  score: number;
  temperature: string;
  status: string;
  leadType: 'SHARED' | 'EXCLUSIVE';
  exclusive: boolean;
  maxPurchasers: number;
  currentPurchasers: number;
  source: string;
  sourceList: string[];
  freshness?: {
    labelAr: string;
    badgeClass: string;
  };
}

interface ImportReportSummary {
  importJobId: string;
  imported: number;
  valid: number;
  duplicates: number;
  invalid: number;
}

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<AdminLeadRow[]>([]);
  const [developers, setDevelopers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<AdminLeadRow | null>(null);
  const [formData, setFormData] = useState({
    businessName: '',
    category: 'Dental',
    city: 'القاهرة',
    area: '',
    phone: '',
    email: '',
    website: '',
    facebook: '',
    instagram: '',
    rating: '4.7',
    reviewCount: '120',
    leadType: 'SHARED',
    maxPurchasers: '3',
  });

  // Assign Modal
  const [assignLead, setAssignLead] = useState<AdminLeadRow | null>(null);
  const [selectedDevId, setSelectedDevId] = useState('');

  // CSV Import Modal
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvSourceName, setCsvSourceName] = useState('CSV Import');
  const [importingCsv, setImportingCsv] = useState(false);
  const [importReport, setImportReport] = useState<ImportReportSummary | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      const [leadsRes, usersRes] = await Promise.all([
        fetch(`/api/admin/leads?${params.toString()}`),
        fetch('/api/admin/users?role=DEVELOPER'),
      ]);
      if (leadsRes.ok) {
        const d = await leadsRes.json();
        setLeads(d.leads || []);
      }
      if (usersRes.ok) {
        const u = await usersRes.json();
        setDevelopers(u.users || []);
        if (u.users?.[0]) setSelectedDevId(u.users[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openCreateModal() {
    setEditingLead(null);
    setFormData({
      businessName: '',
      category: 'Dental',
      city: 'القاهرة',
      area: 'مدينة نصر',
      phone: '01009998877',
      email: '',
      website: '',
      facebook: 'https://facebook.com/example.business',
      instagram: 'https://instagram.com/example.business',
      rating: '4.7',
      reviewCount: '150',
      leadType: 'SHARED',
      maxPurchasers: '3',
    });
    setModalOpen(true);
  }

  function openEditModal(lead: AdminLeadRow) {
    setEditingLead(lead);
    setFormData({
      businessName: lead.businessName,
      category: lead.category,
      city: lead.city,
      area: lead.area || '',
      phone: lead.phone || '',
      email: lead.email || '',
      website: lead.website || '',
      facebook: lead.facebook || '',
      instagram: lead.instagram || '',
      rating: String(lead.rating ?? 4.5),
      reviewCount: String(lead.reviewCount ?? 0),
      leadType: lead.leadType,
      maxPurchasers: String(lead.maxPurchasers),
    });
    setModalOpen(true);
  }

  async function handleSaveLead(e: React.FormEvent) {
    e.preventDefault();
    if (editingLead) {
      const res = await fetch(`/api/admin/leads/${editingLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          rating: Number(formData.rating),
          reviewCount: Number(formData.reviewCount),
          maxPurchasers: Number(formData.maxPurchasers),
        }),
      });
      if (res.ok) {
        setModalOpen(false);
        await loadData();
      }
    } else {
      const res = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          rating: Number(formData.rating),
          reviewCount: Number(formData.reviewCount),
          maxPurchasers: Number(formData.maxPurchasers),
        }),
      });
      if (res.ok) {
        setModalOpen(false);
        await loadData();
      }
    }
  }

  async function handleLeadAction(leadId: string, action: string, extra?: Record<string, unknown>) {
    const res = await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    if (res.ok) {
      setAssignLead(null);
      await loadData();
    }
  }

  async function handleDeleteLead(leadId: string) {
    const res = await fetch(`/api/admin/leads/${leadId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await loadData();
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(String(ev.target?.result || ''));
    };
    reader.readAsText(file);
  }

  function fillSampleCsv() {
    setCsvText(
      `name,category,city,area,address,phone,email,website,facebook,instagram,rating,reviewCount,source
عيادة النور للأسنان والتقويم,Dental,القاهرة,مصر الجديدة,شارع الحجاز,01091112233,info@alnoor-dental.eg,,https://facebook.com/alnoordental,https://instagram.com/alnoordental,4.8,240,CSV Upload Batch
مطعم مذاق الشرق للمشويات,Restaurant,الجيزة,الدقي,شارع التحرير,01192223344,,,https://facebook.com/mazaqorient,https://instagram.com/mazaqorient,4.6,310,CSV Upload Batch
شركة الصفوة للاستثمار العقاري,Real Estate,القاهرة الجديدة,التجمع الخامس,شارع التسعين,01293334455,sales@alsafwa-re.eg,http://old-alsafwa-re.com,https://facebook.com/alsafware,,4.7,125,CSV Upload Batch`
    );
  }

  async function handleRunCsvImport(e: React.FormEvent) {
    e.preventDefault();
    setImportingCsv(true);
    setImportReport(null);
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvContent: csvText,
          sourceName: csvSourceName,
          fileName: 'admin_import.csv',
        }),
      });
      const data = await res.json();
      if (res.ok && data.report) {
        setImportReport(data.report);
        await loadData();
      }
    } finally {
      setImportingCsv(false);
    }
  }

  return (
    <AppShell isAdminView>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">
              إدارة العملاء المحتملين والاستيراد (Admin Leads & CSV Import)
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              إضافة، تعديل، فحص المواقع، إعادة حساب التقييم، التخصيص لمطور، أو استيراد ملفات CSV مع
              منع التكرار التلقائي.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => {
                setCsvOpen(true);
                setImportReport(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2.5 text-xs font-extrabold text-emerald-800 hover:bg-emerald-100"
            >
              <Upload className="h-4 w-4" />
              استيراد CSV (CSV Import)
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              إضافة نشاط تجاري جديد
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم الشركة، المدينة، أو رقم الهاتف..."
            className="w-full rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold"
          />
        </div>

        {/* Leads Table */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto">
          {loading ? (
            <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-3 px-2">النشاط التجاري</th>
                  <th className="py-3 px-2">المدينة / التصنيف</th>
                  <th className="py-3 px-2">الموقع الإلكتروني</th>
                  <th className="py-3 px-2">التقييم (Score)</th>
                  <th className="py-3 px-2">الملكية والمبيعات</th>
                  <th className="py-3 px-2">المصادر المدمجة</th>
                  <th className="py-3 px-2">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold">
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td className="py-3 px-2">
                      <p className="font-extrabold text-slate-900">{lead.businessName}</p>
                      <p className="text-[11px] text-slate-500" dir="ltr">
                        {lead.phone || 'بدون هاتف'}
                      </p>
                    </td>
                    <td className="py-3 px-2">
                      <p>{lead.city}</p>
                      <p className="text-[11px] text-slate-500">{lead.category}</p>
                    </td>
                    <td className="py-3 px-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px]">
                        {lead.websiteStatus}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <span className="font-extrabold text-emerald-700">
                        {lead.score}/100 ({lead.temperature})
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <span className="block">
                        {lead.exclusive ? 'حصري (1/1)' : `مشترك (${lead.currentPurchasers}/${lead.maxPurchasers})`}
                      </span>
                      <span className="text-[10px] text-slate-500">{lead.status}</span>
                    </td>
                    <td className="py-3 px-2 text-[11px] text-slate-600">
                      {(lead.sourceList || [lead.source]).join(' + ')}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => openEditModal(lead)}
                          title="تعديل"
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleLeadAction(lead.id, 'VERIFY')}
                          title="فحص الموقع وتحديث التحقق"
                          className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setAssignLead(lead)}
                          title="تخصيص لمطور"
                          className="rounded-lg border border-blue-200 bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleLeadAction(lead.id, 'MARK_INVALID')}
                          title="تعليم كغير صالح"
                          className="rounded-lg border border-amber-200 bg-amber-50 p-1.5 text-amber-700 hover:bg-amber-100"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteLead(lead.id)}
                          title="حذف"
                          className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Create / Edit Lead Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-base font-extrabold text-slate-900">
                {editingLead ? 'تعديل بيانات النشاط التجاري' : 'إضافة نشاط تجاري جديد'}
              </h3>
              <form onSubmit={handleSaveLead} className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700">اسم النشاط التجاري *</label>
                  <input
                    type="text"
                    required
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">التصنيف</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold"
                  >
                    {BUSINESS_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.labelAr}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700">المدينة</label>
                  <select
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold"
                  >
                    {ALL_CITIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700">رقم الهاتف</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">الموقع الإلكتروني (إن وجد)</label>
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="اتركه فارغًا إذا لم يكن لديه موقع"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">نوع الملكية</label>
                  <select
                    value={formData.leadType}
                    onChange={(e) => setFormData({ ...formData, leadType: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold"
                  >
                    <option value="SHARED">مشترك (Shared)</option>
                    <option value="EXCLUSIVE">حصري (Exclusive)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700">تقييم جوجل (0-5)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={formData.rating}
                    onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">عدد المراجعات</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.reviewCount}
                    onChange={(e) => setFormData({ ...formData, reviewCount: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>

                <div className="sm:col-span-2 flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-5 py-2 font-bold text-white"
                  >
                    حفظ وتقييم تلقائي
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Assign Lead Modal */}
        {assignLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-base font-extrabold text-slate-900">
                تخصيص الفرصة لمطور: {assignLead.businessName}
              </h3>
              <div className="mt-4">
                <label className="block text-xs font-bold text-slate-700">اختر المطور:</label>
                <select
                  value={selectedDevId}
                  onChange={(e) => setSelectedDevId(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                >
                  {developers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setAssignLead(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  onClick={() =>
                    handleLeadAction(assignLead.id, 'ASSIGN', { developerId: selectedDevId })
                  }
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
                >
                  تأكيد التخصيص
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CSV Import Modal (Section 19) */}
        {csvOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-slate-900">
                  استيراد العملاء عبر ملف CSV (Validate → Normalize → Deduplicate → Score → Store)
                </h3>
                <button
                  type="button"
                  onClick={fillSampleCsv}
                  className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                >
                  تحميل بيانات CSV تجريبية
                </button>
              </div>

              <p className="mt-1 text-xs text-slate-500">
                الأعمدة المدعومة: name, category, city, area, address, phone, email, website,
                facebook, instagram, rating, reviewCount, source
              </p>

              <form onSubmit={handleRunCsvImport} className="mt-4 space-y-4 text-xs">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="font-bold text-slate-700">رفع ملف CSV من جهازك:</label>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileSelect}
                      className="mt-1 w-full rounded-xl border border-slate-300 p-1.5"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700">اسم المصدر (Source):</label>
                    <input
                      type="text"
                      value={csvSourceName}
                      onChange={(e) => setCsvSourceName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700">محتوى CSV:</label>
                  <textarea
                    rows={6}
                    dir="ltr"
                    required
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="name,category,city,area,address,phone,email,website,facebook,instagram,rating,reviewCount,source"
                    className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
                  />
                </div>

                {importReport && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="flex items-center gap-1.5 font-extrabold text-emerald-900">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      تقرير الاستيراد (Import Report):
                    </p>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                      <div className="rounded-lg bg-white p-2">
                        <span className="block text-[11px] text-slate-500">Imported</span>
                        <strong className="text-base text-slate-900">
                          {importReport.imported}
                        </strong>
                      </div>
                      <div className="rounded-lg bg-white p-2">
                        <span className="block text-[11px] text-emerald-600">Valid</span>
                        <strong className="text-base text-emerald-700">
                          {importReport.valid}
                        </strong>
                      </div>
                      <div className="rounded-lg bg-white p-2">
                        <span className="block text-[11px] text-amber-600">Duplicates</span>
                        <strong className="text-base text-amber-700">
                          {importReport.duplicates}
                        </strong>
                      </div>
                      <div className="rounded-lg bg-white p-2">
                        <span className="block text-[11px] text-rose-600">Invalid</span>
                        <strong className="text-base text-rose-700">
                          {importReport.invalid}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCsvOpen(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700"
                  >
                    إغلاق
                  </button>
                  <button
                    type="submit"
                    disabled={importingCsv}
                    className="rounded-xl bg-emerald-600 px-5 py-2 font-bold text-white"
                  >
                    {importingCsv ? 'جاري الفحص والاستيراد...' : 'بدء الاستيراد والتقييم'}
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
