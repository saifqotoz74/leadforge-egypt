import React from 'react';
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

const TYPE_LABELS: Record<CreditTransactionType, string> = {
  PURCHASE: 'شحن رصيد',
  CLAIM: 'شراء فرصة',
  REFUND: 'استرداد رصيد',
  BONUS: 'مكافأة ترحيبية',
  ADMIN_ADJUSTMENT: 'تسوية إدارية',
  EXPIRATION: 'انتهاء صلاحية',
  CORRECTION: 'تصحيح رصيد',
};

export const LedgerTable: React.FC<LedgerTableProps> = ({
  entries,
  showImmutabilityNotice = true,
  className = '',
}) => {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
        <table className="w-full text-start border-collapse text-body-sm">
          <thead>
            <tr className="border-b border-line bg-subtle text-caption font-semibold text-fg-secondary h-11">
              <th className="py-2.5 px-4 text-start">التاريخ</th>
              <th className="py-2.5 px-4 text-start">نوع الحركة</th>
              <th className="py-2.5 px-4 text-start">البيان / الوصف</th>
              <th className="py-2.5 px-4 text-end">القيمة (نقطة)</th>
              <th className="py-2.5 px-4 text-end">الرصيد بعد الحركة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-fg-muted">
                  لا توجد حركات مسجلة في سجل الرصيد حتى الآن.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const isPositive = entry.amount > 0;
                return (
                  <tr
                    key={entry.id}
                    className="hover:bg-brand-soft/30 transition-colors h-[var(--row-h)]"
                  >
                    {/* Date (ar-EG-u-nu-latn) */}
                    <td className="py-2.5 px-4 align-middle whitespace-nowrap text-fg-secondary">
                      {fmtDate(entry.createdAt)}
                    </td>

                    {/* Type: neutral pill per Spec 7.11 */}
                    <td className="py-2.5 px-4 align-middle whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-subtle border border-line text-caption font-medium text-fg-secondary">
                        {TYPE_LABELS[entry.type] || entry.type}
                      </span>
                    </td>

                    {/* Description */}
                    <td className="py-2.5 px-4 align-middle text-fg-primary font-medium">
                      {entry.description}
                    </td>

                    {/* Amount (signed, tabular, .ltr-iso; positive in --text-brand, negative in --text-primary) */}
                    <td className="py-2.5 px-4 align-middle text-end whitespace-nowrap">
                      <span
                        className={`ltr-iso font-mono font-bold tabular-nums ${
                          isPositive ? 'text-fg-brand' : 'text-fg-primary'
                        }`}
                      >
                        {isPositive ? `+${fmtNumber(entry.amount)}` : fmtNumber(entry.amount)}
                      </span>
                    </td>

                    {/* Balance After */}
                    <td className="py-2.5 px-4 align-middle text-end whitespace-nowrap">
                      <span className="ltr-iso font-mono font-semibold tabular-nums text-fg-secondary">
                        {fmtNumber(entry.balanceAfter)}
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
          سجل الحركات المالية غير قابل للتعديل أو الحذف ويخضع للتدقيق الدوري.
        </p>
      )}
    </div>
  );
};
