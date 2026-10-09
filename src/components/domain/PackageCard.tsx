import React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fmtNumber, formatEGP } from '@/lib/format';

export interface PackageCardProps {
  id: string;
  name: string;
  points: number;
  priceEGP: number;
  features: string[];
  isRecommended?: boolean;
  recommendedReason?: string;
  onSelectPackage?: (id: string) => void;
  reassuranceText?: string;
  className?: string;
}

export const PackageCard: React.FC<PackageCardProps> = ({
  id,
  name,
  points,
  priceEGP,
  features,
  isRecommended = false,
  recommendedReason,
  onSelectPackage,
  reassuranceText = 'تُضاف النقاط فوراً إلى حسابك بعد الدفع',
  className = '',
}) => {
  const pricePerPoint = Math.round((priceEGP / points) * 100) / 100;

  return (
    <div
      className={`relative rounded-xl bg-surface p-8 transition-all flex flex-col justify-between ${
        isRecommended
          ? 'border-2 border-brand shadow-sm'
          : 'border border-line hover:border-line-strong'
      } ${className}`}
    >
      {/* Recommended Pill Badge straddling top edge per Spec 7.12 */}
      {isRecommended && (
        <div className="absolute -top-3.5 inset-x-0 flex justify-center z-10">
          <span className="inline-flex items-center h-7 px-4 rounded-full bg-brand text-fg-on-brand text-caption font-medium shadow-xs">
            الأكثر اختياراً
          </span>
        </div>
      )}

      {/* Header block: Name & Reason */}
      <div className="flex flex-col gap-1 mb-4">
        <h3 className="text-h3 font-semibold text-fg-primary">{name}</h3>
        {isRecommended && recommendedReason && (
          <p className="text-body-sm text-fg-secondary">{recommendedReason}</p>
        )}
      </div>

      {/* Points block (40px/700 tabular with unit secondary) */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className="ltr-iso font-mono text-[40px] font-bold leading-none tabular-nums text-fg-primary">
          {fmtNumber(points)}
        </span>
        <span className="text-body text-fg-secondary">نقطة</span>
      </div>

      {/* Price block with per-point caption */}
      <div className="flex flex-col gap-1 pb-6 mb-6 border-b border-line">
        <div className="text-h2 font-bold text-fg-primary">
          {formatEGP(priceEGP)}
        </div>
        <span className="text-caption text-fg-muted">
          (حوالي {fmtNumber(pricePerPoint)} ج.م لكل نقطة)
        </span>
      </div>

      {/* Feature list with check icons */}
      <div className="flex-1 flex flex-col gap-3 mb-8">
        {features.map((feature, idx) => (
          <div key={idx} className="flex items-start gap-2.5 text-body-sm text-fg-primary">
            <Check className="h-4 w-4 shrink-0 text-fg-brand mt-1" aria-hidden="true" />
            <span>{feature}</span>
          </div>
        ))}
      </div>

      {/* Footer CTA & Reassurance text */}
      <div className="flex flex-col gap-2">
        <Button
          variant={isRecommended ? 'primary' : 'secondary'}
          size="lg"
          className="w-full"
          onClick={() => {
            if (onSelectPackage) onSelectPackage(id);
          }}
        >
          اختيار الباقة
        </Button>

        {reassuranceText && (
          <p className="text-caption text-fg-muted text-center pt-1">
            {reassuranceText}
          </p>
        )}
      </div>
    </div>
  );
};
