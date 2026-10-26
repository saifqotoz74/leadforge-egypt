'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/domain/AppShell';
import { PageHeader } from '@/components/domain/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
import { fmtNumber, formatEGP, fmtDate, formatRelativeTime } from '@/lib/format';
import { getCachedAdminData, setCachedAdminData, invalidateAdminCache } from '@/lib/admin-cache';
import {
  CheckCircle2,
  XCircle,
  Eye,
  CreditCard,
  Clock,
  ShieldCheck,
  Check,
  AlertCircle,
  Phone,
} from 'lucide-react';

interface PaymentItem {
  id: string;
  userId: string;
  planId: string;
  amountEgp: number;
  creditsGranted: number;
  provider: string;
  providerRef: string;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  metadata: {
    receiptImage?: string | null;
    paymentMethod?: string;
    transferredTo?: string;
    senderPhone?: string | null;
    submittedAt?: string;
    approvedAt?: string;
    approvedBy?: string;
    rejectedAt?: string;
    rejectionReason?: string;
    receiptPurged?: boolean;
  } | null;
  createdAt: string;
  plan: {
    id: string;
    name: string;
    nameEn: string;
    priceEgp: number;
    monthlyCredits: number;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export default function AdminPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [pendingPayments, setPendingPayments] = useState<PaymentItem[]>([]);
  const [recentPayments, setRecentPayments] = useState<PaymentItem[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<{ image: string; title: string } | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPayments = useCallback(async () => {
    const cacheKey = 'admin_payments';
    const cached = getCachedAdminData<{ pendingPayments: PaymentItem[]; recentPayments: PaymentItem[] }>(cacheKey);
    if (cached) {
      setPendingPayments(cached.pendingPayments);
      setRecentPayments(cached.recentPayments);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const requestStartedAt = Date.now();
    try {
      const res = await fetch('/api/admin/payments');
      if (res.ok) {
        const data = await res.json();
        const freshPending = data.pendingPayments || [];
        const freshRecent = data.recentPayments || [];
        setPendingPayments(freshPending);
        setRecentPayments(freshRecent);
        setCachedAdminData(cacheKey, { pendingPayments: freshPending, recentPayments: freshRecent }, { requestStartedAt });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const handleApprove = async (paymentId: string) => {
    setActionInProgress(paymentId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر تأكيد الدفع.');

      setActionMsg({ type: 'success', text: data.message || 'تمت الموافقة وتفعيل الباقة ومسح الإيصال بنجاح.' });
      invalidateAdminCache('admin_payments');
      loadPayments();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message || 'حدث خطأ أثناء الموافقة.' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (paymentId: string) => {
    setActionInProgress(paymentId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'إيصال التحويل غير صالح أو لم يصل إلى الحساب.' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر رفض المعاملة.');

      setActionMsg({ type: 'success', text: data.message || 'تم رفض المعاملة ومسح الإيصال بنجاح.' });
      invalidateAdminCache('admin_payments');
      loadPayments();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message || 'حدث خطأ أثناء الرفض.' });
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <AppShell isAdmin={true} density="compact" pageTitle="مراجعة المدفوعات والتحويلات">
      <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto text-start">
        <PageHeader
          title="مراجعة المدفوعات والتحويلات المالية"
          description="مراجعة إيصالات إنستاباي ومحافظ الهاتف (فودافون كاش) واعتماد الاشتراكات بضغطة واحدة."
          actions={
            <Button variant="secondary" size="sm" onClick={loadPayments} disabled={loading}>
              تحديث القائمة
            </Button>
          }
        />

        {/* Action feedback banner */}
        {actionMsg && (
          <div
            className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-body-sm font-medium ${
              actionMsg.type === 'success'
                ? 'bg-brand-soft border-line-brand text-brand'
                : 'bg-danger-bg border-danger-border text-danger-text'
            }`}
          >
            {actionMsg.type === 'success' ? (
              <Check className="w-4 h-4 text-brand shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-danger-text shrink-0" />
            )}
            <span>{actionMsg.text}</span>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 border border-line bg-surface">
            <span className="text-caption text-fg-secondary font-medium block">
              الطلبات المعلقة قيد المراجعة
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-h2 font-bold tabular-nums text-warning-text">
                {fmtNumber(pendingPayments.length)}
              </span>
              <span className="text-caption text-fg-muted">طلب تحويل</span>
            </div>
          </Card>

          <Card className="p-4 border border-line bg-surface">
            <span className="text-caption text-fg-secondary font-medium block">
              رقم استقبال التحويلات
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-h3 font-bold text-fg-brand ltr-iso tabular-nums">
                01229105279
              </span>
              <span className="text-caption text-fg-muted">(إنستاباي ومحافظ كاش)</span>
            </div>
          </Card>

          <Card className="p-4 border border-line bg-surface">
            <span className="text-caption text-fg-secondary font-medium block">
              سياسة الخصوصية والتخزين
            </span>
            <div className="mt-1 flex items-center gap-2 text-fg-brand text-body-sm font-semibold">
              <ShieldCheck className="w-5 h-5 text-fg-brand" />
              <span>مسح تلقائي فوري للإيصال فور البت في الطلب</span>
            </div>
          </Card>
        </div>

        {/* Pending Payments Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-h3 text-fg-primary">
                <Clock className="w-5 h-5 text-warning-text" />
                <span>طلبات التحويل المعلقة ({fmtNumber(pendingPayments.length)})</span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading && pendingPayments.length === 0 ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : pendingPayments.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  title="لا توجد طلبات تحويل معلقة حالياً"
                  description="جميع التحويلات الواردة تم مراجعتها واعتمادها بنجاح."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المطور</TableHead>
                    <TableHead>الباقة المطلوبة</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>وقت الإرسال</TableHead>
                    <TableHead>صورة الإيصال</TableHead>
                    <TableHead>المحول منه</TableHead>
                    <TableHead className="text-end">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPayments.map((p) => {
                    const hasReceipt = Boolean(p.metadata?.receiptImage);
                    const isProcessing = actionInProgress === p.id;

                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div>
                            <span className="font-semibold text-fg-primary block">{p.user.name}</span>
                            <span className="text-caption text-fg-secondary ltr-iso">{p.user.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-fg-primary">{p.plan.name}</span>
                          <span className="block text-caption text-fg-muted">
                            {fmtNumber(p.creditsGranted)} نقطة
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-fg-brand tabular-nums">
                            {formatEGP(p.amountEgp)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-caption text-fg-secondary block">
                            {formatRelativeTime(p.createdAt)}
                          </span>
                          <span className="text-caption text-fg-muted">
                            {fmtDate(p.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {hasReceipt ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setSelectedReceipt({
                                  image: p.metadata!.receiptImage!,
                                  title: `إيصال تحويل: ${p.user.name} (${formatEGP(p.amountEgp)})`,
                                })
                              }
                              startIcon={<Eye className="w-3.5 h-3.5" />}
                            >
                              معاينة الإيصال
                            </Button>
                          ) : (
                            <span className="text-caption text-fg-muted">تم مسح الإيصال</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-caption tabular-nums ltr-iso">
                            {p.metadata?.senderPhone || 'غير محدد'}
                          </span>
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={isProcessing}
                              onClick={() => handleApprove(p.id)}
                              startIcon={<CheckCircle2 className="w-4 h-4" />}
                            >
                              {isProcessing ? 'جاري...' : 'موافقة وتفعيل ✅'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isProcessing}
                              onClick={() => handleReject(p.id)}
                              className="text-danger-text hover:bg-danger-bg"
                              startIcon={<XCircle className="w-4 h-4" />}
                            >
                              رفض ❌
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Processed History Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-h3 text-fg-primary">
              سجل المعاملات السابقة ({fmtNumber(recentPayments.length)})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <div className="py-6 text-center text-caption text-fg-muted">
                لا توجد معاملات مكتملة سابقة بعد.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المطور</TableHead>
                    <TableHead>الباقة</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>حالة صورة الإيصال</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPayments.map((p) => {
                    const isSuccess = p.status === 'COMPLETED';
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <span className="font-medium text-fg-primary block">{p.user.name}</span>
                          <span className="text-caption text-fg-secondary ltr-iso">{p.user.email}</span>
                        </TableCell>
                        <TableCell>{p.plan.name}</TableCell>
                        <TableCell className="tabular-nums font-semibold">{formatEGP(p.amountEgp)}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-semibold ${
                              isSuccess
                                ? 'bg-brand-soft text-brand'
                                : 'bg-danger-bg text-danger-text'
                            }`}
                          >
                            {isSuccess ? 'تم التفعيل بنجاح' : 'مرفوض'}
                          </span>
                        </TableCell>
                        <TableCell className="text-caption text-fg-secondary">
                          {fmtDate(p.createdAt)}
                        </TableCell>
                        <TableCell>
                          <span className="text-caption text-fg-brand bg-brand-soft px-2 py-0.5 rounded border border-line-brand">
                            🔒 تم مسح الإيصال لحماية الخصوصية
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* View Full Receipt Modal */}
        <Dialog
          isOpen={selectedReceipt !== null}
          onClose={() => setSelectedReceipt(null)}
          size="lg"
          title={selectedReceipt?.title || 'معاينة إيصال التحويل'}
          footer={
            <Button variant="secondary" size="sm" onClick={() => setSelectedReceipt(null)}>
              إغلاق
            </Button>
          }
        >
          {selectedReceipt && (
            <div
              className="flex flex-col items-center justify-center p-2 bg-inverse rounded-xl overflow-hidden"
              style={{ maxHeight: '70vh' }} /* design-allow: clamp-display */
            >
              <img
                src={selectedReceipt.image}
                alt="إيصال التحويل الكامل"
                className="w-auto object-contain rounded-lg shadow-lg"
                style={{ maxHeight: '65vh' }} /* design-allow: clamp-display */
              />
            </div>
          )}
        </Dialog>
      </div>
    </AppShell>
  );
}
