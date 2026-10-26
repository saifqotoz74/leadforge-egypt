'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Copy,
  Check,
  UploadCloud,
  FileCheck,
  ShieldCheck,
  CreditCard,
  AlertCircle,
  X,
} from 'lucide-react';
import { formatEGP, fmtNumber } from '@/lib/format';

export interface TransferPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: {
    id: string;
    slug: string;
    name: string;
    priceEgp: number;
    monthlyCredits: number;
  } | null;
  onSuccess?: () => void;
}

export function TransferPaymentModal({
  isOpen,
  onClose,
  plan,
  onSuccess,
}: TransferPaymentModalProps) {
  const [copied, setCopied] = useState(false);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [senderPhone, setSenderPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const transferNumber = '01229105279';

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(transferNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('يرجى اختيار ملف صورة صالح (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('حجم الصورة كبير جداً. الحد الأقصى 5 ميجابايت.');
      return;
    }

    setErrorMsg(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      setReceiptImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setReceiptImage(null);
    setFileName(null);
  };

  const handleSubmit = async () => {
    if (!plan) return;
    if (!receiptImage) {
      setErrorMsg('يرجى إرفاق صورة إيصال التحويل لإتمام الطلب.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/subscription/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          receiptImage,
          senderPhone: senderPhone.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'تعذر إرسال الإيصال.');
      }

      setSuccessMsg(data.message || 'تم استلام الإيصال بنجاح!');
      setTimeout(() => {
        setSuccessMsg(null);
        setReceiptImage(null);
        setFileName(null);
        setSenderPhone('');
        onSuccess?.();
        onClose();
      }, 2500);
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء إرسال الإيصال.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!plan) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-h3 font-semibold text-fg-primary">
              تفعيل الاشتراك والدفع
            </h3>
            <p className="text-caption text-fg-secondary">
              تحويل بنكي / إنستاباي ومحافظ الهاتف الذكية
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !receiptImage || Boolean(successMsg)}
          >
            {submitting ? 'جاري الإرسال...' : 'تأكيد وإرسال الإيصال'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1 text-start">
        {/* Plan summary badge */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-subtle border border-line">
          <div>
            <span className="text-caption text-fg-secondary font-medium">الباقة المختارة:</span>
            <h4 className="text-body font-bold text-fg-primary">{plan.name}</h4>
            <span className="text-caption text-fg-muted">
              تتضمن {fmtNumber(plan.monthlyCredits)} نقطة رصيد شهرياً
            </span>
          </div>
          <div className="text-end">
            <span className="text-caption text-fg-secondary">المبلغ المطلوب:</span>
            <div className="text-h3 font-bold text-fg-brand tabular-nums">
              {formatEGP(plan.priceEgp)}
            </div>
          </div>
        </div>

        {/* Transfer Destination Card */}
        <div className="p-4 rounded-xl border border-line-brand bg-brand-soft">
          <div className="flex items-center justify-between mb-2">
            <span className="text-caption font-bold text-fg-primary">
              بيانات التحويل المعتمدة:
            </span>
            <div className="flex items-center gap-1.5 text-caption font-medium text-fg-secondary">
              <span className="px-2 py-0.5 rounded bg-surface text-brand text-caption font-semibold border border-line-brand">
                إنستاباي (InstaPay)
              </span>
              <span className="px-2 py-0.5 rounded bg-surface text-brand text-caption font-semibold border border-line-brand">
                محافظ كاش
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface border border-line-brand">
            <div>
              <span className="block text-caption text-fg-secondary">رقم التحويل:</span>
              <span className="ltr-iso tabular-nums text-body font-bold text-fg-primary tracking-wide">
                {transferNumber}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyNumber}
              startIcon={copied ? <Check className="w-3.5 h-3.5 text-brand" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copied ? 'تم النسخ' : 'نسخ الرقم'}
            </Button>
          </div>

          <p className="mt-2.5 text-caption text-fg-secondary leading-relaxed">
            يرجى تحويل مبلغ <strong className="tabular-nums font-bold text-fg-brand">{formatEGP(plan.priceEgp)}</strong> إلى الرقم أعلاه عبر تطبيق <strong>إنستاباي</strong> أو أي <strong>محفظة هاتف ذكية</strong> (فودافون كاش / أورنج / اتصالات / وي كاش)، ثم إرفاق صورة الإيصال أدناه.
          </p>
        </div>

        {/* Success or Error Banners */}
        {successMsg && (
          <div className="p-3 rounded-lg bg-brand-soft text-brand text-caption font-medium border border-line-brand flex items-center gap-2">
            <Check className="w-4 h-4 text-brand shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-lg bg-danger-bg text-danger-text text-caption border border-danger-border flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-danger-text shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Upload Receipt Area */}
        <div>
          <label className="block text-caption font-semibold text-fg-primary mb-1.5">
            صورة إيصال التحويل (مطلوب):
          </label>

          {!receiptImage ? (
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-line rounded-xl hover:bg-subtle cursor-pointer transition-colors text-center">
              <UploadCloud className="w-8 h-8 text-fg-muted mb-2" />
              <span className="text-body-sm font-semibold text-fg-primary">
                اضغط هنا لاختيار صورة الإيصال
              </span>
              <span className="text-caption text-fg-secondary mt-1">
                صيغ JPG, PNG, WebP (بحد أقصى 5 ميجابايت)
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          ) : (
            <div className="relative p-3 rounded-xl border border-line bg-subtle flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-line bg-surface shrink-0">
                  <img
                    src={receiptImage}
                    alt="معاينة الإيصال"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <span
                    title={fileName || 'إيصال التحويل'}
                    className="text-body-sm font-semibold text-fg-primary block truncate max-w-xs" /* design-allow: truncate */
                  >
                    {fileName || 'إيصال التحويل'}
                  </span>
                  <span className="text-caption text-brand flex items-center gap-1 font-medium">
                    <FileCheck className="w-3.5 h-3.5" />
                    جاهز للإرسال
                  </span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveImage}
                startIcon={<X className="w-4 h-4 text-danger-text" />}
                className="text-danger-text hover:bg-danger-bg"
              >
                حذف وتغيير
              </Button>
            </div>
          )}
        </div>

        {/* Optional Sender phone */}
        <div>
          <Input
            label="رقم الهاتف أو الحساب المحول منه (اختياري لتسريع المراجعة):"
            placeholder="مثال: 01012345678 أو اسم حساب إنستاباي"
            value={senderPhone}
            onChange={(e) => setSenderPhone(e.target.value)}
          />
        </div>

        {/* Privacy Note */}
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-subtle text-caption text-fg-secondary">
          <ShieldCheck className="w-4 h-4 text-brand shrink-0 mt-0.5" />
          <span>
            <strong>خصوصية تامة:</strong> سيتم حذف صورة الإيصال نهائياً وتلقائياً من النظام فور مراجعة العملية والموافقة عليها أو رفضها.
          </span>
        </div>
      </div>
    </Dialog>
  );
}
