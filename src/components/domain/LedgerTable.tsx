'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { fmtDate, fmtNumber } from '@/lib/format';

export type CreditTransactionType =
  | 'PURCHASE'
  | 'CLAIM'
  | 'REFUND'
  | 'BONUS'
  | 'ADMIN_ADJUSTMENT'
  | 'EXPIRATION'
  | 'CORRECTION';

export interface LedgerEntry {
  id: string;
  createdAt: Date | string;
  type: CreditTransactionType;
  description: string;
  amount: number;
  balanceAfter: number;
}

export interface LedgerTableProps {
  entries: LedgerEntry[];
  showImmutabilityNotice?: boolean;
  className?: string;
}

export const LedgerTable: React.FC<LedgerTableProps> = ({
  entries,
  showImmutabilityNotice = true,
  className = '',
}) => {
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const typeLabels: Record<CreditTransactionType, string> = {
    PURCHASE: tCommon('ledgerTypePurchase'),
    CLAIM: tCommon('ledgerTypeClaim'),
    REFUND: tCommon('ledgerTypeRefund'),
    BONUS: tCommon('ledgerTypeBonus'),
    ADMIN_ADJUSTMENT: tCommon('ledgerTypeAdmin'),
    EXPIRATION: tCommon('ledgerTypeExpiration'),
    CORRECTION: tCommon('ledgerTypeCorrection'),
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
        <table className="w-full text-start border-collapse text-body-sm">
          <thead>
            <tr className="border-b border-line bg-subtle text-caption font-semibold text-fg-secondary h-11">
              <th className="py-2.5 px-4 text-start">{tCommon('ledgerDate')}</th>
              <th className="py-2.5 px-4 text-start">{tCommon('ledgerType')}</th>
              <th className="py-2.5 px-4 text-start">{tCommon('ledgerDescription')}</th>
              <th className="py-2.5 px-4 text-end">{tCommon('ledgerAmount')}</th>
              <th className="py-2.5 px-4 text-end">{tCommon('ledgerBalanceAfter')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-fg-muted">
                  {tCommon('ledgerEmpty')}
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const isPositive = entry.amount > 0;
                return (
                  <tr
                    key={entry.id}
                    className="hover:bg-brand-soft transition-colors h-[var(--row-h)]"
                  >
                    {/* Date */}
                    <td className="py-2.5 px-4 align-middle whitespace-nowrap text-fg-secondary tabular-nums">
                      {fmtDate(entry.createdAt, locale)}
                    </td>

                    {/* Type: neutral pill per Spec 7.11 */}
                    <td className="py-2.5 px-4 align-middle whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-subtle border border-line text-caption font-medium text-fg-secondary">
                        {typeLabels[entry.type] || entry.type}
                      </span>
                    </td>

                    {/* Description */}
                    <td className="py-2.5 px-4 align-middle text-fg-primary font-medium">
                      {entry.description}
                    </td>

                    {/* Amount (signed, tabular, .ltr-iso; positive in --text-brand, negative in --text-primary) */}
                    <td className="py-2.5 px-4 align-middle text-end whitespace-nowrap">
                      <span
                        className={`ltr-iso font-bold tabular-nums ${
                          isPositive ? 'text-fg-brand' : 'text-fg-primary'
                        }`}
                      >
                        {isPositive ? `+${fmtNumber(entry.amount, locale)}` : fmtNumber(entry.amount, locale)}
                      </span>
                    </td>

                    {/* Balance After */}
                    <td className="py-2.5 px-4 align-middle text-end whitespace-nowrap">
                      <span className="ltr-iso font-semibold tabular-nums text-fg-secondary">
                        {fmtNumber(entry.balanceAfter, locale)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Caption stating immutability per Spec 7.11 */}
      {showImmutabilityNotice && (
        <p className="text-caption text-fg-muted text-start">
          {tCommon('ledgerImmutableNotice')}
        </p>
      )}
    </div>
  );
};
