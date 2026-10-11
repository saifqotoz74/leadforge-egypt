'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog } from '@/components/ui/Dialog';
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
import { ALL_CITIES, BUSINESS_CATEGORIES } from '@/lib/constants';
import { fmtNumber } from '@/lib/format';
import { localizeCategory, localizeCity, localizeWebsiteStatus } from '@/lib/taxonomy';
import {
  Plus,
  Upload,
  CheckCircle2,
  Trash2,
  Edit3,
  ShieldAlert,
  UserPlus,
  RefreshCw,
  Search,
  ArrowRight,
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
}

interface ImportReportSummary {
  importJobId: string;
  imported: number;
  valid: number;
  duplicates: number;
  invalid: number;
}

export default function AdminLeadsPage() {
  const t = useTranslations('adminLeads');
  const tNav = useTranslations('nav');
  const tGeo = useTranslations('geo');
  const tCat = useTranslations('categories');
  const tEnums = useTranslations('enums');
  const locale = useLocale();
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
    <AppShell isAdmin={true} density="compact" pageTitle={t('pageTitle')}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('title')}
          description={t('desc')}
          breadcrumbs={[
            { label: tNav('adminOverview'), href: '/admin' },
            { label: t('pageTitle') },
          ]}
          actions={
            <div className="flex flex-wrap items-center gap-2.5">
              <Link href="/admin">
                <Button
                  variant="ghost"
                  size="sm"
                  startIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
                >
                  {tNav('adminOverview')}
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCsvOpen(true);
                  setImportReport(null);
                }}
                className="gap-1.5"
              >
                <Upload className="h-4 w-4" />
                <span>{t('btnImportCsv')}</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={openCreateModal}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>{t('btnNewLead')}</span>
              </Button>
            </div>
          }
        />

        {/* Search Bar */}
        <Card>
          <CardContent className="p-4">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              startIcon={<Search className="h-4 w-4 text-fg-muted" />}
            />
          </CardContent>
        </Card>

        {/* Leads Table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="flex flex-col gap-3 p-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : leads.length === 0 ? (
              <div className="py-12">
                <EmptyState
                  title={t('noLeads')}
                  description={t('noLeadsDesc')}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('colBusiness')}</TableHead>
                    <TableHead>{t('colCityCategory')}</TableHead>
                    <TableHead>{t('colWebsite')}</TableHead>
                    <TableHead>{t('colScore')}</TableHead>
                    <TableHead>{t('colOwnership')}</TableHead>
                    <TableHead>{t('colSources')}</TableHead>
                    <TableHead className="text-end">{t('colActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <p className="font-semibold text-fg-primary">{lead.businessName}</p>
                        <p className="text-caption text-fg-muted ltr-iso">
                          {lead.phone || t('noPhone')}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-body-sm font-medium text-fg-primary">
                          {localizeCity(lead.city, tGeo)}
                        </p>
                        <p className="text-caption text-fg-muted">
                          {localizeCategory(lead.category, tCat)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-subtle text-caption font-medium text-fg-secondary">
                          {localizeWebsiteStatus(lead.websiteStatus, tEnums)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-fg-brand tabular-nums ltr-iso">
                          {lead.score}/100 ({lead.temperature})
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="block text-body-sm font-medium text-fg-primary">
                          {lead.exclusive
                            ? t('exclusiveTag', { claimed: lead.currentPurchasers })
                            : t('sharedTag', { claimed: lead.currentPurchasers, max: lead.maxPurchasers })}
                        </span>
                        <span className="text-caption text-fg-muted">{lead.status}</span>
                      </TableCell>
                      <TableCell className="text-caption text-fg-secondary">
                        {(lead.sourceList || [lead.source]).join(' + ')}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(lead)}
                            title={t('btnEdit')}
                            className="p-1.5 h-8 w-8"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleLeadAction(lead.id, 'VERIFY')}
                            title={t('btnVerify')}
                            className="p-1.5 h-8 w-8"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setAssignLead(lead)}
                            title={t('btnAssign')}
                            className="p-1.5 h-8 w-8"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLeadAction(lead.id, 'MARK_INVALID')}
                            title={t('btnInvalid')}
                            className="p-1.5 h-8 w-8 text-warning-text hover:bg-warning-bg"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeleteLead(lead.id)}
                            title={t('btnDelete')}
                            className="p-1.5 h-8 w-8"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create / Edit Lead Dialog */}
        <Dialog
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingLead ? t('modalEditTitle') : t('modalCreateTitle')}
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                {t('btnCancel')}
              </Button>
              <Button variant="primary" onClick={handleSaveLead}>
                {t('btnSave')}
              </Button>
            </div>
          }
        >
          <form onSubmit={handleSaveLead} className="grid gap-4 sm:grid-cols-2 text-body-sm py-2">
            <div className="sm:col-span-2">
              <Input
                label={t('fieldName')}
                required
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
              />
            </div>
            <div>
              <Select
                label={t('fieldCategory')}
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                options={BUSINESS_CATEGORIES.map((c) => ({
                  value: c.value,
                  label: localizeCategory(c.value, tCat),
                }))}
              />
            </div>
            <div>
              <Select
                label={t('fieldCity')}
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                options={ALL_CITIES.map((c) => ({
                  value: c,
                  label: localizeCity(c, tGeo),
                }))}
              />
            </div>
            <div>
              <Input
                label={t('fieldPhone')}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <Input
                label={t('fieldEmail')}
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <Input
                label={t('fieldWebsite')}
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder={t('fieldWebsitePlaceholder')}
              />
            </div>
            <div>
              <Select
                label={t('fieldOwnership')}
                value={formData.leadType}
                onChange={(e) => setFormData({ ...formData, leadType: e.target.value })}
                options={[
                  { value: 'SHARED', label: t('fieldShared') },
                  { value: 'EXCLUSIVE', label: t('fieldExclusive') },
                ]}
              />
            </div>
            <div>
              <Input
                label={t('fieldRating')}
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={formData.rating}
                onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
              />
            </div>
            <div>
              <Input
                label={t('fieldReviews')}
                type="number"
                min="0"
                value={formData.reviewCount}
                onChange={(e) => setFormData({ ...formData, reviewCount: e.target.value })}
              />
            </div>
          </form>
        </Dialog>

        {/* Assign Lead Dialog */}
        <Dialog
          isOpen={assignLead !== null}
          onClose={() => setAssignLead(null)}
          title={assignLead ? t('modalAssignTitle', { name: assignLead.businessName }) : ''}
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button variant="ghost" onClick={() => setAssignLead(null)}>
                {t('btnCancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  assignLead && handleLeadAction(assignLead.id, 'ASSIGN', { developerId: selectedDevId })
                }
              >
                {t('confirmAssign')}
              </Button>
            </div>
          }
        >
          <div className="py-2">
            <Select
              label={t('selectDeveloper')}
              value={selectedDevId}
              onChange={(e) => setSelectedDevId(e.target.value)}
              options={developers.map((d) => ({
                value: d.id,
                label: `${d.name} (${d.email})`,
              }))}
            />
          </div>
        </Dialog>

        {/* CSV Import Dialog */}
        <Dialog
          isOpen={csvOpen}
          onClose={() => setCsvOpen(false)}
          title={t('modalCsvTitle')}
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button variant="ghost" onClick={() => setCsvOpen(false)}>
                {t('btnClose')}
              </Button>
              <Button
                variant="primary"
                onClick={handleRunCsvImport}
                isLoading={importingCsv}
              >
                {t('btnStartImport')}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center justify-between">
              <p className="text-caption text-fg-muted">
                {t('csvColumnsHint')}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={fillSampleCsv}
              >
                {t('loadSampleCsv')}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-body-sm font-medium text-fg-secondary block mb-1">
                  {t('uploadFile')}
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileSelect}
                  className="w-full text-body-sm text-fg-primary file:me-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-subtle file:text-fg-primary file:font-semibold hover:file:bg-brand-soft"
                />
              </div>
              <div>
                <Input
                  label={t('sourceName')}
                  value={csvSourceName}
                  onChange={(e) => setCsvSourceName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-body-sm font-medium text-fg-secondary block mb-1">
                {t('csvContent')}
              </label>
              <textarea
                rows={6}
                dir="ltr"
                required
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="name,category,city,area,address,phone,email,website,facebook,instagram,rating,reviewCount,source"
                className="w-full rounded-xl border border-line bg-surface p-3 text-body-sm text-fg-primary focus:border-line-brand focus:outline-none ltr-iso"
              />
            </div>

            {importReport && (
              <div className="rounded-xl border border-line bg-subtle p-4">
                <div className="flex items-center gap-1.5 font-semibold text-fg-brand mb-3">
                  <CheckCircle2 className="h-4 w-4 text-fg-brand" />
                  <span>{t('importReportTitle')}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-surface border border-line p-2">
                    <span className="block text-caption text-fg-muted">{t('statImported')}</span>
                    <strong className="text-h3 tabular-nums text-fg-primary">
                      {fmtNumber(importReport.imported)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-surface border border-line p-2">
                    <span className="block text-caption text-fg-brand">{t('statValid')}</span>
                    <strong className="text-h3 tabular-nums text-fg-brand">
                      {fmtNumber(importReport.valid)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-surface border border-line p-2">
                    <span className="block text-caption text-warning-text">{t('statDuplicates')}</span>
                    <strong className="text-h3 tabular-nums text-warning-text">
                      {fmtNumber(importReport.duplicates)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-surface border border-line p-2">
                    <span className="block text-caption text-danger-text">{t('statInvalid')}</span>
                    <strong className="text-h3 tabular-nums text-danger-text">
                      {fmtNumber(importReport.invalid)}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Dialog>
      </div>
    </AppShell>
  );
}
