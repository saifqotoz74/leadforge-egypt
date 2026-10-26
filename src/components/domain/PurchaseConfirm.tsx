'use client';

import React, { useState } from 'react';
import { Check, Copy, AlertTriangle, AlertCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
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
  | 'error'
  | 'unverified';

export interface PurchaseConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  lead: PurchaseLeadSummary;
  userBalance: number;
  onConfirmPurchase: () => Promise<void>;
  onTopUpRedirect?: () => void;
  onGoToDeal?: (leadId: string) => void;
  onViewSimilar?: () => void;
  onVerifyEmailRedirect?: () => void;
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
  onVerifyEmailRedirect,
  state: controlledState,
  errorMessage,
}) => {
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [internalState, setInternalState] = useState<PurchaseState>('idle');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);

  const resolvedErrorMessage = customError || errorMessage || tCommon('purchaseErrorFallback');

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
    setCustomError(null);
    try {
      await onConfirmPurchase();
      setInternalState('success');
    } catch (err: any) {
      const code = err?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        setInternalState('unverified');
      } else if (code === 'INSUFFICIENT_CREDITS') {
        setInternalState('insufficient_balance');
      } else if (
        code === 'CONFLICT' ||
        code === 'ALREADY_CLAIMED' ||
        code === 'MAX_PURCHASERS'
      ) {
        setInternalState('lost_race');
      } else {
        setInternalState('error');
      }
      if (err?.message && typeof err.message === 'string') {
        setCustomError(err.message);
      }
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
        title={tCommon('purchasedTitle')}
        size="md"
        data-density="comfortable"
      >
        <div className="flex flex-col items-center text-center gap-4 py-4">
          {/* Check icon in 56px brand circle per Spec 7.10 */}
          <div className="h-14 w-14 rounded-full bg-brand-soft-strong flex items-center justify-center text-fg-brand">
            <Check className="h-7 w-7" aria-hidden="true" />
          </div>

          <h3 className="text-h3 font-semibold text-fg-primary">
            {tCommon('purchasedHeading')}
          </h3>

          <p className="text-body-sm text-fg-secondary">
            {tCommon('purchasedDesc', { name: lead.name })}
          </p>

          {/* Revealed contact details with Copy button */}
          <div className="w-full rounded-lg border border-line bg-subtle p-4 flex flex-col gap-3 text-start">
            {lead.phone && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption text-fg-secondary">{tCommon('mergeFieldPhone')}</span>
                <div className="flex items-center gap-2">
                  <span className="ltr-iso tabular-nums font-medium text-fg-primary">
                    {lead.phone}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(lead.phone!, 'phone')}
                    className="p-1 rounded text-fg-secondary hover:text-fg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    title={tCommon('copyPhone')}
                  >
                    <Copy className="h-4 w-4" />
                    <span className="sr-only">
                      {copiedField === 'phone' ? tCommon('copied') : tCommon('copy')}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {lead.email && (
              <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
                <span className="text-caption text-fg-secondary">{tCommon('mergeFieldEmail')}</span>
                <div className="flex items-center gap-2">
                  <span className="ltr-iso tabular-nums font-medium text-fg-primary">
                    {lead.email}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(lead.email!, 'email')}
                    className="p-1 rounded text-fg-secondary hover:text-fg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    title={tCommon('copyEmail')}
                  >
                    <Copy className="h-4 w-4" />
                    <span className="sr-only">
                      {copiedField === 'email' ? tCommon('copied') : tCommon('copy')}
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
              {tCommon('goToDeal')}
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
      title={tCommon('confirmPurchaseTitle')}
      size="md"
      data-density="comfortable"
    >
      <div className="flex flex-col gap-5 py-2">
        {/* Error banner if in error state */}
        {activeState === 'error' && (
          <Banner variant="danger">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{resolvedErrorMessage}</span>
            </div>
          </Banner>
        )}

        {/* Unverified email banner */}
        {activeState === 'unverified' && (
          <Banner variant="warning">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{tCommon('emailVerificationRequired')}</span>
            </div>
          </Banner>
        )}

        {/* Lost race banner if sold meanwhile per Spec 7.10 */}
        {activeState === 'lost_race' && (
          <Banner variant="info">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{tCommon('lostRaceBanner')}</span>
            </div>
          </Banner>
        )}

        {/* 2. Lead summary */}
        <div className="rounded-lg border border-line bg-surface p-4 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h4 className="text-h4 font-semibold text-fg-primary">
              <bdi dir="auto">{lead.name}</bdi>
            </h4>
            <OwnershipTag type={lead.ownershipType} maxSeats={lead.maxSeats} size="sm" />
          </div>
          <OpportunityBadge temperature={lead.temperature} score={lead.score} size="sm" />
        </div>

        {/* 3. Plain sentence explaining ownership type per Spec 7.10 */}
        <p className="text-body-sm text-fg-secondary">
          {lead.ownershipType === 'EXCLUSIVE'
            ? tCommon('exclusiveOwnershipSentence')
            : tCommon('sharedOwnershipSentence', { seats: fmtNumber(lead.maxSeats || 3, locale) })}
        </p>

        {/* 4. Insufficient balance state vs Summary table */}
        {activeState === 'insufficient_balance' ? (
          <Banner variant="warning">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                {tCommon('insufficientBalanceBanner', { points: fmtNumber(pointsNeeded, locale) })}
              </span>
            </div>
          </Banner>
        ) : (
          <div className="rounded-lg border border-line bg-subtle p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between text-body-sm h-11">
              <span className="text-fg-secondary">{tCommon('currentBalanceLabel')}</span>
              <span className="ltr-iso tabular-nums text-fg-primary">
                {tCommon('points', { count: userBalance })}
              </span>
            </div>
            <div className="flex items-center justify-between text-body-sm h-11">
              <span className="text-fg-secondary">{tCommon('leadPriceLabel')}</span>
              <span className="ltr-iso tabular-nums text-danger-text font-medium">
                −{tCommon('points', { count: lead.price })}
              </span>
            </div>
            <div className="border-t border-line pt-2 flex items-center justify-between text-body font-semibold h-11">
              <span className="text-fg-primary">{tCommon('balanceAfterLabel')}</span>
              <span className="ltr-iso tabular-nums text-fg-primary">
                {tCommon('points', { count: balanceAfter })}
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
              {tCommon('cancel')}
            </Button>

            {activeState === 'unverified' ? (
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  if (onVerifyEmailRedirect) {
                    onVerifyEmailRedirect();
                  } else if (typeof window !== 'undefined') {
                    window.location.href = '/verify-email';
                  }
                }}
              >
                {tCommon('verifyEmailCta')}
              </Button>
            ) : activeState === 'insufficient_balance' ? (
              <Button
                variant="primary"
                size="lg"
                onClick={onTopUpRedirect}
              >
                {tCommon('topUpBalanceCta')}
              </Button>
            ) : activeState === 'lost_race' ? (
              <Button
                variant="secondary"
                size="lg"
                onClick={onViewSimilar}
              >
                {tCommon('viewSimilarLeadsCta')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                isLoading={activeState === 'submitting'}
                onClick={handleConfirm}
              >
                {tCommon('confirmPurchaseTitle')}
              </Button>
            )}
          </div>

          <p className="text-caption text-fg-muted text-center">
            {tCommon('instantDeductionFootnote')}
          </p>
        </div>
      </div>
    </Dialog>
  );
};
