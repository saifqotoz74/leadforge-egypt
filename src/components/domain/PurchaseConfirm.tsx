import React, { useState } from 'react';
import { Check, Copy, AlertTriangle, AlertCircle } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { OpportunityBadge, LeadTemperature } from './OpportunityBadge';
import { OwnershipTag, OwnershipType } from './OwnershipTag';
import { fmtNumber } from '@/lib/format';

export interface PurchaseLeadSummary {
  id: string;
  name: string;
  temperature: LeadTemperature;
  score: number;
  ownershipType: OwnershipType;
  price: number;
  maxSeats?: number;
  phone?: string;
  email?: string;
}

export type PurchaseState =
  | 'idle'
  | 'submitting'
  | 'insufficient_balance'
  | 'lost_race'
  | 'success'
  | 'error';

export interface PurchaseConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  lead: PurchaseLeadSummary;
  userBalance: number;
  onConfirmPurchase: () => Promise<void>;
  onTopUpRedirect?: () => void;
  onGoToDeal?: (leadId: string) => void;
  onViewSimilar?: () => void;
  state?: PurchaseState;
  errorMessage?: string;
}

export const PurchaseConfirm: React.FC<PurchaseConfirmProps> = ({
  isOpen,
  onClose,
  lead,
  userBalance,
  onConfirmPurchase,
  onTopUpRedirect,
  onGoToDeal,
  onViewSimilar,
  state: controlledState,
  errorMessage = 'تعذّر إكمال العملية. حاول مرة أخرى.',
}) => {
  const [internalState, setInternalState] = useState<PurchaseState>('idle');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Derive active state
  const isBalanceInsufficient = userBalance < lead.price;
  const activeState =
    controlledState ||
    (isBalanceInsufficient && internalState === 'idle'
      ? 'insufficient_balance'
      : internalState);

  const balanceAfter = userBalance - lead.price;
  const pointsNeeded = lead.price - userBalance;

  const handleConfirm = async () => {
    setInternalState('submitting');
    try {
      await onConfirmPurchase();
      setInternalState('success');
    } catch {
      setInternalState('error');
    }
  };

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // SUCCESS STATE VIEW
  if (activeState === 'success') {
    return (
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title="تم الشراء"
        size="md"
        data-density="comfortable"
      >
        <div className="flex flex-col items-center text-center gap-4 py-4">
          {/* Check icon in 56px brand circle per Spec 7.10 */}
          <div className="h-14 w-14 rounded-full bg-brand-soft-strong flex items-center justify-center text-fg-brand">
            <Check className="h-7 w-7" aria-hidden="true" />
          </div>

          <h3 className="text-h3 font-semibold text-fg-primary">
            تم شراء بيانات الفرصة
          </h3>

          <p className="text-body-sm text-fg-secondary">
            أصبحت بيانات الاتصال الخاصة بشركة «{lead.name}» متاحة لك الآن.
          </p>

          {/* Revealed contact details with Copy button */}
          <div className="w-full rounded-lg border border-line bg-subtle p-4 flex flex-col gap-3 text-start">
            {lead.phone && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption text-fg-secondary">رقم الهاتف</span>
                <div className="flex items-center gap-2">
                  <span className="ltr-iso font-mono font-medium text-fg-primary">
                    {lead.phone}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(lead.phone!, 'phone')}
                    className="p-1 rounded text-fg-secondary hover:text-fg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    title="نسخ الرقم"
                  >
                    <Copy className="h-4 w-4" />
                    <span className="sr-only">
                      {copiedField === 'phone' ? 'تم النسخ' : 'نسخ'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {lead.email && (
              <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2">
                <span className="text-caption text-fg-secondary">البريد الإلكتروني</span>
                <div className="flex items-center gap-2">
                  <span className="ltr-iso font-mono font-medium text-fg-primary">
                    {lead.email}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(lead.email!, 'email')}
                    className="p-1 rounded text-fg-secondary hover:text-fg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    title="نسخ البريد"
                  >
                    <Copy className="h-4 w-4" />
                    <span className="sr-only">
                      {copiedField === 'email' ? 'تم النسخ' : 'نسخ'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="w-full flex justify-end gap-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => {
                if (onGoToDeal) onGoToDeal(lead.id);
                onClose();
              }}
            >
              الذهاب إلى الصفقة
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  // STANDARD PURCHASE MODAL VIEW
  return (
    <Dialog
      isOpen={isOpen}
      onClose={activeState === 'submitting' ? () => {} : onClose}
      title="تأكيد الشراء"
      size="md"
      data-density="comfortable"
    >
      <div className="flex flex-col gap-5 py-2">
        {/* Error banner if in error state */}
        {activeState === 'error' && (
          <Banner variant="danger">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          </Banner>
        )}

        {/* Lost race banner if sold meanwhile per Spec 7.10 */}
        {activeState === 'lost_race' && (
          <Banner variant="info">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>اشترى مطور آخر هذه الفرصة قبل لحظات.</span>
            </div>
          </Banner>
        )}

        {/* 2. Lead summary */}
        <div className="rounded-lg border border-line bg-surface p-4 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h4 className="text-h4 font-semibold text-fg-primary">{lead.name}</h4>
            <OwnershipTag type={lead.ownershipType} maxSeats={lead.maxSeats} size="sm" />
          </div>
          <OpportunityBadge temperature={lead.temperature} score={lead.score} size="sm" />
        </div>

        {/* 3. Plain sentence explaining ownership type per Spec 7.10 */}
        <p className="text-body-sm text-fg-secondary">
          {lead.ownershipType === 'EXCLUSIVE'
            ? 'ستكون الجهة الوحيدة التي تحصل على بيانات هذه الفرصة.'
            : `يمكن لعدد أقصى من ${lead.maxSeats || 3} مطورين الحصول على هذه الفرصة.`}
        </p>

        {/* 4. Insufficient balance state vs Summary table */}
        {activeState === 'insufficient_balance' ? (
          <Banner variant="warning">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                رصيدك لا يكفي. تحتاج إلى {fmtNumber(pointsNeeded)} نقاط إضافية لإتمام الشراء.
              </span>
            </div>
          </Banner>
        ) : (
          <div className="rounded-lg border border-line bg-subtle p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between text-body-sm h-11">
              <span className="text-fg-secondary">رصيدك الحالي</span>
              <span className="ltr-iso font-mono tabular-nums text-fg-primary">
                {fmtNumber(userBalance)} نقطة
              </span>
            </div>
            <div className="flex items-center justify-between text-body-sm h-11">
              <span className="text-fg-secondary">سعر الفرصة</span>
              <span className="ltr-iso font-mono tabular-nums text-danger-text font-medium">
                −{fmtNumber(lead.price)} نقطة
              </span>
            </div>
            <div className="border-t border-line/60 pt-2 flex items-center justify-between text-body font-semibold h-11">
              <span className="text-fg-primary">رصيدك بعد الشراء</span>
              <span className="ltr-iso font-mono tabular-nums text-fg-primary">
                {fmtNumber(balanceAfter)} نقطة
              </span>
            </div>
          </div>
        )}

        {/* 5. Footer Buttons */}
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="lg"
              disabled={activeState === 'submitting'}
              onClick={onClose}
            >
              إلغاء
            </Button>

            {activeState === 'insufficient_balance' ? (
              <Button
                variant="primary"
                size="lg"
                onClick={onTopUpRedirect}
              >
                شحن الرصيد
              </Button>
            ) : activeState === 'lost_race' ? (
              <Button
                variant="secondary"
                size="lg"
                onClick={onViewSimilar}
              >
                عرض فرص مشابهة
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                isLoading={activeState === 'submitting'}
                onClick={handleConfirm}
              >
                تأكيد الشراء
              </Button>
            )}
          </div>

          <p className="text-caption text-fg-muted text-center">
            تُخصم النقاط فوراً عند إتمام التأكيد.
          </p>
        </div>
      </div>
    </Dialog>
  );
};
