import {
  DEFAULT_MINIMUM_SAMPLE_SIZE,
  MetricDataStatus,
  NumericSummaryStats,
  PaginationMetadata,
} from './types';

/**
 * Deterministic rounding helper to `decimals` decimal places.
 */
export function roundTo(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Computes a deterministic ratio (0..1) and percentage (0..100).
 * Returns null and INSUFFICIENT_DATA if denominator <= 0.
 * Never fabricates a percentage when denominator is 0.
 */
export function computeDeterministicRate(
  numerator: number,
  denominator: number,
  minimumSampleSize = 0
): {
  value: number | null;
  percentage: number | null;
  status: MetricDataStatus;
  displayValue: string;
} {
  const safeNum = Number.isFinite(numerator) ? Math.max(0, Math.round(numerator)) : 0;
  const safeDen = Number.isFinite(denominator) ? Math.max(0, Math.round(denominator)) : 0;

  if (safeDen <= 0) {
    return {
      value: null,
      percentage: null,
      status: 'INSUFFICIENT_DATA',
      displayValue: 'INSUFFICIENT_DATA',
    };
  }

  const ratio = roundTo(safeNum / safeDen, 4);
  const pct = roundTo((safeNum / safeDen) * 100, 2);

  if (minimumSampleSize > 0 && safeDen < minimumSampleSize) {
    return {
      value: ratio,
      percentage: pct,
      status: 'INSUFFICIENT_SAMPLE',
      displayValue: 'INSUFFICIENT_SAMPLE',
    };
  }

  return {
    value: ratio,
    percentage: pct,
    status: 'VALID',
    displayValue: `${pct}%`,
  };
}

/**
 * Pure deterministic summary statistics for a numeric array (no ML/black-box).
 * Computes count, sum, average, median, min, max, and population standard deviation.
 */
export function summarizeNumericValues(values: number[]): NumericSummaryStats {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  const count = valid.length;

  if (count === 0) {
    return {
      count: 0,
      sum: 0,
      average: null,
      median: null,
      min: null,
      max: null,
      stdDev: null,
      status: 'INSUFFICIENT_DATA',
    };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const sum = roundTo(
    sorted.reduce((acc, v) => acc + v, 0),
    2
  );
  const avg = roundTo(sum / count, 2);
  const min = sorted[0];
  const max = sorted[count - 1];

  const mid = Math.floor(count / 2);
  const median =
    count % 2 === 0
      ? roundTo((sorted[mid - 1] + sorted[mid]) / 2, 2)
      : roundTo(sorted[mid], 2);

  const variance =
    sorted.reduce((acc, v) => acc + Math.pow(v - sum / count, 2), 0) / count;
  const stdDev = roundTo(Math.sqrt(variance), 2);

  return {
    count,
    sum,
    average: avg,
    median,
    min,
    max,
    stdDev,
    status: 'VALID',
  };
}

/**
 * Deterministic comparison between an observed rate and a baseline rate,
 * enforcing minimum sample size discipline (Section 31 & 32).
 */
export function compareObservedVsBaseline(params: {
  observedNumerator: number;
  observedDenominator: number;
  baselineNumerator: number;
  baselineDenominator: number;
  minimumSampleSize?: number;
}): {
  observedValue: number | null;
  baselineValue: number | null;
  absoluteDifference: number | null;
  relativeDifference: number | null;
  sampleSize: number;
  minimumSampleSize: number;
  sampleStatus: 'SUFFICIENT' | 'INSUFFICIENT_SAMPLE';
  dataStatus: MetricDataStatus;
} {
  const minSample = params.minimumSampleSize ?? DEFAULT_MINIMUM_SAMPLE_SIZE;
  const sampleSize = Math.max(0, Math.round(params.observedDenominator));

  const obs = computeDeterministicRate(
    params.observedNumerator,
    params.observedDenominator
  );
  const base = computeDeterministicRate(
    params.baselineNumerator,
    params.baselineDenominator
  );

  const isSufficient = sampleSize >= minSample;

  if (obs.value === null || base.value === null) {
    return {
      observedValue: obs.value,
      baselineValue: base.value,
      absoluteDifference: null,
      relativeDifference: null,
      sampleSize,
      minimumSampleSize: minSample,
      sampleStatus: isSufficient ? 'SUFFICIENT' : 'INSUFFICIENT_SAMPLE',
      dataStatus: obs.value === null ? 'INSUFFICIENT_DATA' : isSufficient ? 'VALID' : 'INSUFFICIENT_SAMPLE',
    };
  }

  const absDiff = roundTo(obs.value - base.value, 4);
  const relDiff =
    base.value > 0 ? roundTo((obs.value - base.value) / base.value, 4) : null;

  return {
    observedValue: obs.value,
    baselineValue: base.value,
    absoluteDifference: absDiff,
    relativeDifference: relDiff,
    sampleSize,
    minimumSampleSize: minSample,
    sampleStatus: isSufficient ? 'SUFFICIENT' : 'INSUFFICIENT_SAMPLE',
    dataStatus: isSufficient ? 'VALID' : 'INSUFFICIENT_SAMPLE',
  };
}

/**
 * Deterministic pagination and sorting helper for analytical tables (Section 36).
 */
export function paginateAndSort<T extends Record<string, unknown>>(
  items: T[],
  options: {
    page: number;
    pageSize: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    allowedSortFields?: string[];
    defaultSortField?: string;
  }
): {
  items: T[];
  pagination: PaginationMetadata;
} {
  const page = Math.max(1, Math.floor(options.page || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(options.pageSize || 20)));
  const sortOrder: 'asc' | 'desc' = options.sortOrder === 'asc' ? 'asc' : 'desc';

  const defaultSort = options.defaultSortField || 'totalLeads';
  const sortBy =
    options.sortBy &&
    (!options.allowedSortFields || options.allowedSortFields.includes(options.sortBy))
      ? options.sortBy
      : defaultSort;

  const sorted = [...items].sort((a, b) => {
    const valA = a[sortBy];
    const valB = b[sortBy];

    if (valA === valB) return 0;
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }

    const strA = String(valA);
    const strB = String(valB);
    return sortOrder === 'asc'
      ? strA.localeCompare(strB)
      : strB.localeCompare(strA);
  });

  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIdx = (page - 1) * pageSize;
  const pagedItems = sorted.slice(startIdx, startIdx + pageSize);

  return {
    items: pagedItems,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      sortBy,
      sortOrder,
    },
  };
}
