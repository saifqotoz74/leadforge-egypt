'use client';

import React, { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import {
  generateEgyptianPitchTemplates,
  normalizeEgyptianPhone,
  buildWhatsAppDirectUrl,
  PitchTemplate,
} from '@/lib/outreach/whatsapp';
import {
  Copy,
  Check,
  Send,
  MessageCircle,
  Sparkles,
  Phone,
  Building2,
  ExternalLink,
} from 'lucide-react';

export interface WhatsAppOutreachModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  businessName: string;
  phone?: string | null;
  category?: string;
  city?: string | null;
  governorate?: string | null;
  website?: string | null;
  websiteStatus?: string | null;
  onContactLogged?: () => void;
}

export function WhatsAppOutreachModal({
  isOpen,
  onClose,
  leadId,
  businessName,
  phone,
  category = '',
  city,
  governorate,
  website,
  websiteStatus,
  onContactLogged,
}: WhatsAppOutreachModalProps) {
  const normPhone = normalizeEgyptianPhone(phone);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('NEW_WEBSITE');
  const [pitchText, setPitchText] = useState<string>('');
  const [templates, setTemplates] = useState<PitchTemplate[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize templates when opened or context changes
  useEffect(() => {
    if (!isOpen) return;

    const res = generateEgyptianPitchTemplates({
      businessName,
      category,
      city,
      governorate,
      website,
      websiteStatus,
    });

    setTemplates(res.templates);
    setSelectedTemplateId(res.recommendedId);

    const initialTemplate = res.templates.find((t) => t.id === res.recommendedId) || res.templates[0];
    if (initialTemplate) {
      setPitchText(initialTemplate.text);
    }
    setCopied(false);
    setErrorMsg(null);
  }, [isOpen, businessName, category, city, governorate, website, websiteStatus]);

  // Handle template selection tab change
  const handleSelectTemplate = (tmpl: PitchTemplate) => {
    setSelectedTemplateId(tmpl.id);
    setPitchText(tmpl.text);
  };

  // Copy text to clipboard
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(pitchText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Launch WhatsApp and record contact attempt
  const handleLaunchWhatsApp = async () => {
    if (!normPhone.waPhone) {
      setErrorMsg('رقم هاتف العميل غير متوفر أو غير صالح للتواصل عبر واتساب.');
      return;
    }

    setSending(true);
    setErrorMsg(null);

    try {
      // Record contact attempt in background
      await fetch(`/api/leads/${leadId}/outreach/whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          message: pitchText,
        }),
      }).catch((err) => {
        console.warn('Failed to log contact attempt:', err);
      });

      // Build WA direct URL and open
      const waUrl = buildWhatsAppDirectUrl(normPhone.waPhone, pitchText);
      window.open(waUrl, '_blank', 'noopener,noreferrer');

      onContactLogged?.();
      onClose();
    } catch (err: any) {
      console.error('Outreach error:', err);
      // Even if logging fails, still open WhatsApp for user
      const waUrl = buildWhatsAppDirectUrl(normPhone.waPhone, pitchText);
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      onClose();
    } finally {
      setSending(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-title font-semibold text-fg-primary">
              تواصل عبر واتساب
            </h3>
            <p className="text-caption text-fg-secondary">
              إرسال عرض مخصص لنشاط: <span className="font-medium text-fg-primary">{businessName}</span>
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyText}
            startIcon={copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          >
            {copied ? 'تم نسخ النص' : 'نسخ نص الرسالة'}
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={sending}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleLaunchWhatsApp}
              disabled={sending || !normPhone.waPhone}
              startIcon={<Send className="w-4 h-4 rtl:-scale-x-100" />}
            >
              {sending ? 'جاري التحويل...' : 'فتح محادثة واتساب الآن'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-1 text-start">
        {/* Contact info bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-surface-subtle border border-line">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-fg-secondary" />
            <span className="text-caption text-fg-secondary">رقم الهاتف:</span>
            <span className="ltr-iso font-semibold tabular-nums text-fg-brand">
              {normPhone.displayFormatted}
            </span>
          </div>

          {city && (
            <div className="flex items-center gap-1.5 text-caption text-fg-secondary">
              <Building2 className="w-3.5 h-3.5" />
              <span>{city}</span>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 text-rose-800 text-caption border border-rose-200">
            {errorMsg}
          </div>
        )}

        {/* Template Selector Tabs */}
        <div>
          <label className="block text-caption font-medium text-fg-secondary mb-2">
            اختر قالب العرض المناسب لحالة العميل:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {templates.map((tmpl) => {
              const isSelected = tmpl.id === selectedTemplateId;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tmpl)}
                  className={`p-2.5 rounded-lg border text-start transition-colors ${
                    isSelected
                      ? 'border-brand bg-brand/5 text-fg-primary font-medium shadow-sm'
                      : 'border-line bg-surface hover:bg-surface-subtle text-fg-secondary'
                  }`}
                >
                  <div className="text-caption font-medium line-clamp-1">{tmpl.title}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Template Description */}
        {selectedTemplate && (
          <div className="p-2.5 rounded-md bg-stone-50 border border-stone-200 text-caption text-stone-600">
            {selectedTemplate.description}
          </div>
        )}

        {/* Editable Message Box */}
        <div>
          <Textarea
            label="نص الرسالة المقترحة (يمكنك التعديل عليها بحرية قبل الإرسال):"
            value={pitchText}
            onChange={(e) => setPitchText(e.target.value)}
            rows={8}
            className="font-sans leading-relaxed text-body text-fg-primary"
          />
          <p className="mt-1 text-caption text-fg-muted">
            💡 سيتم نقل هذا النص تلقائياً إلى خانة الكتابة في واتساب عند الضغط على زر الإرسال.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
