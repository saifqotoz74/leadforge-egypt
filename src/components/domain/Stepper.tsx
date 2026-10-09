import React from 'react';
import { Button } from '@/components/ui/Button';
import { fmtNumber } from '@/lib/format';

export interface StepItem {
  title: string;
  helper?: string;
  content: React.ReactNode;
}

export interface StepperProps {
  steps: StepItem[];
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  isSubmitting?: boolean;
  finalStepLabel?: string;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStep,
  onNext,
  onPrev,
  isSubmitting = false,
  finalStepLabel = 'عرض الفرص المطابقة',
  className = '',
}) => {
  const totalSteps = steps.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  const currentStepData = steps[currentStep] || steps[0];
  const progressPercentage = Math.round(((currentStep + 1) / totalSteps) * 100);

  return (
    <div
      className={`w-full max-w-onboarding mx-auto flex flex-col gap-6 ${className}`}
      role="region"
      aria-label="خطوات الإعداد"
    >
      {/* Progress header per Spec 7.15 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-caption text-fg-secondary">
          <span>
            خطوة{' '}
            <span className="ltr-iso font-mono font-medium text-fg-primary">
              {fmtNumber(currentStep + 1)}
            </span>{' '}
            من{' '}
            <span className="ltr-iso font-mono font-medium text-fg-primary">
              {fmtNumber(totalSteps)}
            </span>
          </span>
          <span className="ltr-iso font-mono text-caption text-fg-muted">
            {fmtNumber(progressPercentage)}%
          </span>
        </div>

        {/* 4px Progress Bar: track --border-default, fill --brand-accent */}
        <div
          className="h-1 w-full rounded-full bg-line overflow-hidden"
          role="progressbar"
          aria-valuenow={progressPercentage}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-brand-accent transition-all duration-300"
            style={{ width: `${progressPercentage}%` /* design-allow: dynamic progress bar width */ }}
          />
        </div>
      </div>

      {/* Title & Helper */}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-h2 font-bold text-fg-primary">
          {currentStepData.title}
        </h2>
        {currentStepData.helper && (
          <p className="text-body text-fg-secondary max-w-[60ch]">
            {currentStepData.helper}
          </p>
        )}
      </div>

      {/* Step Content */}
      <div className="py-2">
        {currentStepData.content}
      </div>

      {/* Stepper Footer actions per Spec 7.15 */}
      <div className="flex items-center justify-between pt-4 border-t border-line">
        {!isFirstStep ? (
          <Button
            variant="ghost"
            size="md"
            onClick={onPrev}
            disabled={isSubmitting}
          >
            رجوع
          </Button>
        ) : (
          <div />
        )}

        <Button
          variant="primary"
          size="md"
          isLoading={isSubmitting}
          onClick={onNext}
        >
          {isLastStep ? finalStepLabel : 'التالي'}
        </Button>
      </div>
    </div>
  );
};
