import React from 'react';
import { fmtNumber } from '@/lib/format';

export interface PipelineColumnProps {
  title: string;
  count: number;
  children: React.ReactNode;
  className?: string;
}

export const PipelineColumn: React.FC<PipelineColumnProps> = ({
  title,
  count,
  children,
  className = '',
}) => {
  return (
    <div
      className={`w-column shrink-0 rounded-xl bg-subtle p-3 flex flex-col gap-3 min-h-96 border border-line ${className}`}
    >
      {/* Column Header: stage name (label) + count pill per Spec 7.13 */}
      <div className="flex items-center justify-between px-1 py-0.5">
        <h3 className="text-label font-semibold text-fg-primary">{title}</h3>
        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-surface border border-line text-caption font-medium tabular-nums text-fg-secondary">
          {fmtNumber(count)}
        </span>
      </div>

      {/* Cards container */}
      <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto">
        {children}
      </div>
    </div>
  );
};
