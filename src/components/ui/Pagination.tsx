'use client';

import React from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { fmtNumber } from '@/lib/format';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className = '',
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);

  return (
    <div
      role="navigation"
      aria-label="التنقل بين الصفحات"
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 select-none ${className}`}
    >
      <div className="text-caption text-fg-secondary">
        عرض <span className="tabular font-medium text-fg-primary">{fmtNumber(from)}</span> إلى{' '}
        <span className="tabular font-medium text-fg-primary">{fmtNumber(to)}</span> من{' '}
        <span className="tabular font-medium text-fg-primary">{fmtNumber(totalItems)}</span>
      </div>

      <div className="flex items-center gap-1">
        {/* Previous page button - mirrored in RTL */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="الصفحة السابقة"
          className="h-8 w-8 rounded-md flex items-center justify-center text-fg-secondary hover:text-fg-primary hover:bg-subtle disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
        </button>

        {/* Page buttons */}
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((page) => {
            if (totalPages <= 5) return true;
            if (page === 1 || page === totalPages) return true;
            return Math.abs(page - currentPage) <= 1;
          })
          .map((page, idx, arr) => {
            const isCurrent = page === currentPage;
            const prev = arr[idx - 1];

            return (
              <React.Fragment key={page}>
                {prev && page - prev > 1 && (
                  <span className="px-1 text-fg-muted text-caption">...</span>
                )}
                <button
                  type="button"
                  onClick={() => onPageChange(page)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`h-8 min-w-8 px-2 rounded-md text-caption font-medium tabular transition-colors ${
                    isCurrent
                      ? 'bg-brand-soft-strong text-brand font-semibold'
                      : 'text-fg-secondary hover:text-fg-primary hover:bg-subtle'
                  }`}
                >
                  {fmtNumber(page)}
                </button>
              </React.Fragment>
            );
          })}

        {/* Next page button - mirrored in RTL */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="الصفحة التالية"
          className="h-8 w-8 rounded-md flex items-center justify-center text-fg-secondary hover:text-fg-primary hover:bg-subtle disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
