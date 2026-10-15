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
  OutreachMode,
} from '@/lib/outreach/whatsapp';
import {
  Copy,
  Check,
  Send,
  MessageCircle,
  Phone,
  Building2,
  CalendarClock,
  ShieldCheck,
  Link2,
  Clock,
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
  developerName?: string;
  companyName?: string;
  nextFollowUpAt?: string | null;
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
  developerName,
  companyName,
  nextFollowUpAt,
  onContactLogged,
}: WhatsAppOutreachModalProps) {
  const normPhone = normalizeEgyptianPhone(phone);

  const [pitchStage, setPitchStage] = useState<'INITIAL' | 'FOLLOW_UP'>('INITIAL');
  const [outreachMode, setOutreachMode] = useState<OutreachMode>('PERMISSION_BASED');
  const [portfolioUrl, setPortfolioUrl] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('NEW_WEBSITE');
  const [pitchText, setPitchText] = useState<string>('');
  const [templates, setTemplates] = useState<PitchTemplate[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize or re-generate templates when settings change
  useEffect(() => {
    if (!isOpen) return;

    const res = generateEgyptianPitchTemplates({
      businessName,
      category,
      city,
      governorate,
      website,
      websiteStatus,
      developerName,
      companyName,
      portfolioUrl: portfolioUrl.trim() || undefined,
      mode: outreachMode,
    });

    setTemplates(res.templates);

    // If on Follow-up stage, pick the follow-up template
    if (pitchStage === 'FOLLOW_UP') {
      const followUp = res.templates.find((t) => t.isFollowUp) || res.templates[0];
      setSelectedTemplateId(followUp.id);
      setPitchText(followUp.text);
    } else {
      // If currently on follow-up, switch to recommended initial template
      const initialTemplate =
        selectedTemplateId !== 'FOLLOW_UP_48H'
          ? res.templates.find((t) => t.id === selectedTemplateId)
          : null;

      const target = initialTemplate || res.templates.find((t) => t.id === res.recommendedId) || res.templates[0];
      setSelectedTemplateId(target.id);
      setPitchText(target.text);
    }

    setCopied(false);
    setErrorMsg(null);
  }, [
    isOpen,
    businessName,
    category,
    city,
    governorate,
    website,
    websiteStatus,
    developerName,
    companyName,
    portfolioUrl,
    outreachMode,
    pitchStage,
  ]);

  // Handle stage tab change (Initial vs 48h Follow-up)
  const handleStageChange = (stage: 'INITIAL' | 'FOLLOW_UP') => {
    setPitchStage(stage);
    if (stage === 'FOLLOW_UP') {
      const followUpTmpl = templates.find((t) => t.isFollowUp);
      if (followUpTmpl) {
        setSelectedTemplateId(followUpTmpl.id);
        setPitchText(followUpTmpl.text);
      }
    } else {
      const initialTmpl = templates.find((t) => !t.isFollowUp) || templates[0];
      if (initialTmpl) {
        setSelectedTemplateId(initialTmpl.id);
        setPitchText(initialTmpl.text);
      }
    }
  };

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
      // Record contact attempt and schedule 48h follow-up in database
      await fetch(`/api/leads/${leadId}/outreach/whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          message: pitchText,
          mode: outreachMode,
          pitchType: pitchStage,
          followUpHours: 48,
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
      // Fallback: still open WhatsApp for developer
      const waUrl = buildWhatsAppDirectUrl(normPhone.waPhone, pitchText);
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      onClose();
    } finally {
      setSending(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const initialTemplates = templates.filter((t) => !t.isFollowUp);

  // Calculate 48h follow-up preview date
  const followUpDatePreview = new Date(Date.now() + 48 * 60 * 60 * 1000).toLocaleDateString('ar-EG-u-nu-latn', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-title font-semibold text-fg-primary">
              مركز التواصل عبر واتساب والمتابعة
            </h3>
            <p className="text-caption text-fg-secondary">
              إرسال عرض مبيعات احترافي لنشاط: <span className="font-medium text-fg-primary">{businessName}</span>
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyText}
            startIcon={copied ? <Check className="w-4 h-4 text-brand" /> : <Copy className="w-4 h-4" />}
          >
            {copied ? 'تم نسخ النص إلى الحافظة' : 'نسخ نص الرسالة'}
          </Button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
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
        {/* Contact info & follow-up status bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-surface-subtle border border-line">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-fg-secondary" />
            <span className="text-caption text-fg-secondary">رقم الهاتف:</span>
            <span className="ltr-iso font-semibold tabular-nums text-fg-primary">
              {normPhone.displayFormatted}
            </span>
          </div>

          <div className="flex items-center gap-4 text-caption text-fg-secondary">
            {city && (
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                <span>{city}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-brand font-medium">
              <CalendarClock className="w-3.5 h-3.5" />
              <span>متابعة مقترحة: <strong className="tabular-nums ltr-iso">{followUpDatePreview}</strong></span>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-danger/10 text-danger-text text-caption border border-danger/20">
            {errorMsg}
          </div>
        )}

        {/* Outreach Stage Selector Tabs (Initial vs 48h Follow-up) */}
        <div className="flex border-b border-line gap-2">
          <button
            type="button"
            onClick={() => handleStageChange('INITIAL')}
            className={`pb-2.5 px-3 text-caption font-semibold transition-colors border-b-2 ${
              pitchStage === 'INITIAL'
                ? 'border-brand text-brand'
                : 'border-transparent text-fg-muted hover:text-fg-secondary'
            }`}
          >
            الخطوة 1: عرض التواصل الأولي
          </button>
          <button
            type="button"
            onClick={() => handleStageChange('FOLLOW_UP')}
            className={`pb-2.5 px-3 text-caption font-semibold transition-colors border-b-2 flex items-center gap-1.5 ${
              pitchStage === 'FOLLOW_UP'
                ? 'border-brand text-brand'
                : 'border-transparent text-fg-muted hover:text-fg-secondary'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>الخطوة 2: متابعة مهذبة (بعد 48 ساعة)</span>
          </button>
        </div>

        {/* Anti-Spam Mode Options (Only in Initial stage) */}
        {pitchStage === 'INITIAL' && (
          <div className="p-3 rounded-lg border border-line bg-surface space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand" />
                <span className="text-caption font-semibold text-fg-primary">
                  أسلوب الإرسال وتفادي الحظر:
                </span>
              </div>

              <div className="inline-flex rounded-lg border border-line p-0.5 bg-surface-subtle">
                <button
                  type="button"
                  onClick={() => setOutreachMode('PERMISSION_BASED')}
                  className={`px-3 py-1 text-caption rounded-md transition-colors ${
                    outreachMode === 'PERMISSION_BASED'
                      ? 'bg-surface text-brand font-semibold shadow-xs'
                      : 'text-fg-secondary hover:text-fg-primary'
                  }`}
                >
                  استئذان ذكي (بدون روابط)
                </button>
                <button
                  type="button"
                  onClick={() => setOutreachMode('DIRECT_LINK')}
                  className={`px-3 py-1 text-caption rounded-md transition-colors ${
                    outreachMode === 'DIRECT_LINK'
                      ? 'bg-surface text-brand font-semibold shadow-xs'
                      : 'text-fg-secondary hover:text-fg-primary'
                  }`}
                >
                  عرض مباشر مع رابط
                </button>
              </div>
            </div>

            {outreachMode === 'PERMISSION_BASED' ? (
              <p className="text-caption text-fg-secondary leading-relaxed">
                🛡️ <strong>موصى به:</strong> الرسالة تنتهي بطلب الإذن بالاطلاع على التفاصيل وسابقة الأعمال دون إدراج روابط خارجية مجهولة للعميل لتفادي تصنيف رقمك كـ Spam أو حظره.
              </p>
            ) : (
              <div className="space-y-1.5 pt-1">
                <label className="block text-caption font-medium text-fg-secondary">
                  رابط سابقة الأعمال أو نموذج الـ Demo الذي سيُضاف للرسالة:
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Link2 className="w-4 h-4 text-fg-muted absolute start-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      dir="ltr"
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                      placeholder="https://yourportfolio.com"
                      className="w-full ps-9 pe-3 py-1.5 rounded-lg border border-line bg-surface text-caption text-fg-primary focus:outline-none focus:ring-1 focus:ring-brand font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sector Template Selector (Only in Initial stage) */}
        {pitchStage === 'INITIAL' && (
          <div>
            <label className="block text-caption font-medium text-fg-secondary mb-2">
              قوالب العروض المصرية المصممة حسب قطاع العميل:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {initialTemplates.map((tmpl) => {
                const isSelected = tmpl.id === selectedTemplateId;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tmpl)}
                    className={`p-2.5 rounded-lg border text-start transition-colors ${
                      isSelected
                        ? 'border-brand bg-brand/5 text-fg-primary font-semibold shadow-xs'
                        : 'border-line bg-surface hover:bg-surface-subtle text-fg-secondary'
                    }`}
                  >
                    <div className="text-caption font-medium line-clamp-1">{tmpl.title}</div>
                    <div className="text-xs text-fg-muted line-clamp-1 mt-0.5">{tmpl.sector}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Template Description */}
        {selectedTemplate && (
          <div className="p-2.5 rounded-md bg-surface-subtle border border-line text-caption text-fg-secondary leading-relaxed">
            {selectedTemplate.description}
          </div>
        )}

        {/* Editable Message Box */}
        <div>
          <Textarea
            label="نص الرسالة (يمكنك التعديل والإضافة بحرية قبل التحويل إلى واتساب):"
            value={pitchText}
            onChange={(e) => setPitchText(e.target.value)}
            rows={7}
            className="font-sans leading-relaxed text-body text-fg-primary"
          />
          <p className="mt-1 text-caption text-fg-muted">
            💡 سيتم نقل نص الرسالة مباشرة إلى نافذة المحادثة في واتساب عند الضغط على زر التحويل، وجدولة تنبيه بالمتابعة بعد 48 ساعة.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
