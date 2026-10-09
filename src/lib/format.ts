/**
 * LeadForge Egypt — Unified Formatting Utilities (RTL & Western Arabic Numerals)
 * Spec: docs/design/LEADFORGE_DESIGN_SYSTEM.md (Section 9)
 */

export const fmtNumber = (n: number): string =>
  new Intl.NumberFormat('ar-EG-u-nu-latn').format(n);

export const fmtDate = (d: Date | string | number): string => {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dateObj);
};

export const fmtDateTime = (d: Date | string | number): string => {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateObj);
};

export const fmtRelative = (
  value: number,
  unit: Intl.RelativeTimeFormatUnit
): string =>
  new Intl.RelativeTimeFormat('ar-EG-u-nu-latn', { numeric: 'auto' }).format(
    value,
    unit
  );

export const fmtTimeAgo = (d: Date | string | number): string => {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffSec < 60) {
    return 'الآن';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return fmtRelative(-diffMin, 'minute');
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return fmtRelative(-diffHours, 'hour');
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return fmtRelative(-diffDays, 'day');
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return fmtRelative(-diffMonths, 'month');
  }
  const diffYears = Math.floor(diffDays / 365);
  return fmtRelative(-diffYears, 'year');
};
