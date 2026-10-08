import {
  AnalyticsEngineError,
  AnalyticsFilterInput,
  DateRangeWindow,
  DEFAULT_BUSINESS_TIMEZONE,
  DEFAULT_MINIMUM_SAMPLE_SIZE,
  DEFAULT_PAGE_SIZE,
  MAX_SAFE_PAGE_SIZE,
  NormalizedAnalyticsFilters,
  TimePreset,
} from './types';

const PRESET_ALIASES: Record<string, TimePreset> = {
  today: 'today',
  TODAY: 'today',
  yesterday: 'yesterday',
  YESTERDAY: 'yesterday',
  last_7_days: 'last_7_days',
  LAST_7_DAYS: 'last_7_days',
  '7d': 'last_7_days',
  last_30_days: 'last_30_days',
  LAST_30_DAYS: 'last_30_days',
  '30d': 'last_30_days',
  last_90_days: 'last_90_days',
  LAST_90_DAYS: 'last_90_days',
  '90d': 'last_90_days',
  month_to_date: 'month_to_date',
  MONTH_TO_DATE: 'month_to_date',
  mtd: 'month_to_date',
  previous_month: 'previous_month',
  PREVIOUS_MONTH: 'previous_month',
  prev_month: 'previous_month',
  custom: 'custom',
  CUSTOM: 'custom',
  all_time: 'all_time',
  ALL_TIME: 'all_time',
  all: 'all_time',
};

/**
 * Computes the local calendar year, month (1-12), and day (1-31) in the target business timezone.
 */
export function getLocalCalendarParts(
  date: Date,
  timezone = DEFAULT_BUSINESS_TIMEZONE
): { year: number; month: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const year = Number(parts.find((p) => p.type === 'year')?.value || date.getUTCFullYear());
    const month = Number(parts.find((p) => p.type === 'month')?.value || date.getUTCMonth() + 1);
    const day = Number(parts.find((p) => p.type === 'day')?.value || date.getUTCDate());

    return { year, month, day };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  }
}

/**
 * Formats a Date into `YYYY-MM-DD` in the business timezone.
 */
export function formatBusinessDateKey(
  date: Date,
  timezone = DEFAULT_BUSINESS_TIMEZONE
): string {
  const { year, month, day } = getLocalCalendarParts(date, timezone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Resolves a timezone-consistent date range window from preset or custom `from`/`to` bounds.
 */
export function resolveDateRangeWindow(
  input: {
    preset?: string | null;
    from?: string | Date | null;
    to?: string | Date | null;
    timezone?: string | null;
    referenceNow?: Date | string | null;
  } = {}
): DateRangeWindow {
  const timezone = (input.timezone || DEFAULT_BUSINESS_TIMEZONE).trim() || DEFAULT_BUSINESS_TIMEZONE;
  const now =
    input.referenceNow instanceof Date
      ? new Date(input.referenceNow.getTime())
      : typeof input.referenceNow === 'string' && input.referenceNow.trim()
        ? new Date(input.referenceNow)
        : new Date();

  if (Number.isNaN(now.getTime())) {
    throw new AnalyticsEngineError(
      'INVALID_DATE_RANGE',
      'Invalid referenceNow timestamp',
      422
    );
  }

  const rawPreset = input.preset?.trim();
  const hasCustomBounds = Boolean(input.from || input.to);

  let preset: TimePreset = 'all_time';
  if (rawPreset) {
    const mapped = PRESET_ALIASES[rawPreset];
    if (!mapped) {
      throw new AnalyticsEngineError(
        'INVALID_TIME_PRESET',
        `Unsupported time preset: ${rawPreset}`,
        422,
        { preset: rawPreset }
      );
    }
    preset = mapped;
  } else if (hasCustomBounds) {
    preset = 'custom';
  }

  if (preset === 'custom' || (hasCustomBounds && preset === 'all_time')) {
    preset = 'custom';
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (input.from) {
      const parsedFrom =
        input.from instanceof Date ? new Date(input.from.getTime()) : new Date(String(input.from));
      if (Number.isNaN(parsedFrom.getTime())) {
        throw new AnalyticsEngineError(
          'INVALID_DATE_RANGE',
          `Invalid 'from' date: ${String(input.from)}`,
          422
        );
      }
      // If a date-only string YYYY-MM-DD was passed, start at 00:00:00.000 UTC
      if (typeof input.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.from.trim())) {
        startDate = new Date(`${input.from.trim()}T00:00:00.000Z`);
      } else {
        startDate = parsedFrom;
      }
    }

    if (input.to) {
      const parsedTo =
        input.to instanceof Date ? new Date(input.to.getTime()) : new Date(String(input.to));
      if (Number.isNaN(parsedTo.getTime())) {
        throw new AnalyticsEngineError(
          'INVALID_DATE_RANGE',
          `Invalid 'to' date: ${String(input.to)}`,
          422
        );
      }
      if (typeof input.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.to.trim())) {
        endDate = new Date(`${input.to.trim()}T23:59:59.999Z`);
      } else {
        endDate = parsedTo;
      }
    }

    if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
      throw new AnalyticsEngineError(
        'INVALID_DATE_RANGE',
        "'from' date cannot be after 'to' date",
        422,
        { from: startDate.toISOString(), to: endDate.toISOString() }
      );
    }

    return {
      preset: 'custom',
      from: startDate ? startDate.toISOString() : null,
      to: endDate ? endDate.toISOString() : null,
      startDate,
      endDate,
      timezone,
    };
  }

  if (preset === 'all_time') {
    return {
      preset: 'all_time',
      from: null,
      to: null,
      startDate: null,
      endDate: null,
      timezone,
    };
  }

  const { year, month, day } = getLocalCalendarParts(now, timezone);
  const todayStartUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const todayEndUtc = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  let startDate: Date;
  let endDate: Date;

  switch (preset) {
    case 'today': {
      startDate = todayStartUtc;
      endDate = todayEndUtc;
      break;
    }
    case 'yesterday': {
      startDate = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
      endDate = new Date(todayEndUtc.getTime() - 24 * 60 * 60 * 1000);
      break;
    }
    case 'last_7_days': {
      startDate = new Date(todayStartUtc.getTime() - 6 * 24 * 60 * 60 * 1000);
      endDate = todayEndUtc;
      break;
    }
    case 'last_30_days': {
      startDate = new Date(todayStartUtc.getTime() - 29 * 24 * 60 * 60 * 1000);
      endDate = todayEndUtc;
      break;
    }
    case 'last_90_days': {
      startDate = new Date(todayStartUtc.getTime() - 89 * 24 * 60 * 60 * 1000);
      endDate = todayEndUtc;
      break;
    }
    case 'month_to_date': {
      startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      endDate = todayEndUtc;
      break;
    }
    case 'previous_month': {
      const prevMonthYear = month === 1 ? year - 1 : year;
      const prevMonthIdx = month === 1 ? 11 : month - 2; // 0-indexed
      startDate = new Date(Date.UTC(prevMonthYear, prevMonthIdx, 1, 0, 0, 0, 0));
      // Last millisecond of previous month: day 0 of current month
      endDate = new Date(Date.UTC(year, month - 1, 0, 23, 59, 59, 999));
      break;
    }
    default: {
      startDate = todayStartUtc;
      endDate = todayEndUtc;
      break;
    }
  }

  return {
    preset,
    from: startDate.toISOString(),
    to: endDate.toISOString(),
    startDate,
    endDate,
    timezone,
  };
}

/**
 * Checks whether a timestamp falls within a resolved `DateRangeWindow`.
 */
export function isWithinDateRange(
  timestamp: Date | string | null | undefined,
  dateRange: DateRangeWindow
): boolean {
  if (!dateRange.startDate && !dateRange.endDate) return true;
  if (!timestamp) return false;
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return false;
  if (dateRange.startDate && ms < dateRange.startDate.getTime()) return false;
  if (dateRange.endDate && ms > dateRange.endDate.getTime()) return false;
  return true;
}

const VALID_COHORT_DIMENSIONS = new Set([
  'created_date',
  'claimed_date',
  'source',
  'niche',
  'city',
  'service',
  'score_band',
  'quality_band',
]);

/**
 * Normalizes raw filter inputs or URL search params into a validated `NormalizedAnalyticsFilters`.
 */
export function normalizeAnalyticsFilters(
  input: AnalyticsFilterInput = {}
): NormalizedAnalyticsFilters {
  const referenceNow =
    input.referenceNow instanceof Date
      ? input.referenceNow
      : typeof input.referenceNow === 'string' && input.referenceNow.trim()
        ? new Date(input.referenceNow)
        : new Date();

  const dateRange = resolveDateRangeWindow({
    preset: input.preset,
    from: input.from,
    to: input.to,
    timezone: input.timezone,
    referenceNow,
  });

  const cleanStr = (v?: string | null): string | null => {
    if (!v || typeof v !== 'string') return null;
    const trimmed = v.trim();
    if (!trimmed || trimmed.toLowerCase() === 'all') return null;
    return trimmed;
  };

  const rawAccessType = cleanStr(input.accessType)?.toUpperCase();
  const accessType: 'SHARED' | 'EXCLUSIVE' | null =
    rawAccessType === 'SHARED' || rawAccessType === 'EXCLUSIVE'
      ? rawAccessType
      : null;

  const rawCohort = cleanStr(input.cohortBy)?.toLowerCase() || 'created_date';
  const cohortBy = (
    VALID_COHORT_DIMENSIONS.has(rawCohort) ? rawCohort : 'created_date'
  ) as NormalizedAnalyticsFilters['cohortBy'];

  const rawMinSample = Number(input.minimumSampleSize);
  const minimumSampleSize =
    Number.isFinite(rawMinSample) && rawMinSample >= 1
      ? Math.min(10000, Math.floor(rawMinSample))
      : DEFAULT_MINIMUM_SAMPLE_SIZE;

  const rawPage = Number(input.page);
  const page =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const rawPageSize = Number(input.pageSize);
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize >= 1
      ? Math.min(MAX_SAFE_PAGE_SIZE, Math.floor(rawPageSize))
      : DEFAULT_PAGE_SIZE;

  const sortOrder: 'asc' | 'desc' =
    typeof input.sortOrder === 'string' && input.sortOrder.toLowerCase() === 'asc'
      ? 'asc'
      : 'desc';

  return {
    dateRange,
    source: cleanStr(input.source),
    niche: cleanStr(input.niche || input.category),
    governorate: cleanStr(input.governorate),
    city: cleanStr(input.city),
    district: cleanStr(input.district),
    service: cleanStr(input.service),
    scoreBand: cleanStr(input.scoreBand)?.toUpperCase() || null,
    qualityBand: cleanStr(input.qualityBand)?.toUpperCase() || null,
    freshness: cleanStr(input.freshness)?.toUpperCase() || null,
    accessType,
    developerId: cleanStr(input.developerId),
    scoringVersion: cleanStr(input.scoringVersion),
    matchVersion: cleanStr(input.matchVersion),
    cohortBy,
    minimumSampleSize,
    page,
    pageSize,
    sortBy: cleanStr(input.sortBy) || 'totalLeads',
    sortOrder,
    referenceNow,
  };
}

/**
 * Extracts `AnalyticsFilterInput` from Next.js `URLSearchParams`.
 */
export function parseAnalyticsFiltersFromSearchParams(
  searchParams: URLSearchParams
): NormalizedAnalyticsFilters {
  return normalizeAnalyticsFilters({
    preset: searchParams.get('preset') || searchParams.get('dateRange'),
    from: searchParams.get('from') || searchParams.get('startDate'),
    to: searchParams.get('to') || searchParams.get('endDate'),
    timezone: searchParams.get('timezone'),
    source: searchParams.get('source'),
    niche: searchParams.get('niche') || searchParams.get('category'),
    governorate: searchParams.get('governorate'),
    city: searchParams.get('city'),
    district: searchParams.get('district') || searchParams.get('area'),
    service: searchParams.get('service') || searchParams.get('requiredService'),
    scoreBand: searchParams.get('scoreBand') || searchParams.get('temperature'),
    qualityBand: searchParams.get('qualityBand') || searchParams.get('qualityStatus'),
    freshness: searchParams.get('freshness') || searchParams.get('freshnessStatus'),
    accessType: searchParams.get('accessType') || searchParams.get('leadType'),
    developerId: searchParams.get('developerId'),
    scoringVersion: searchParams.get('scoringVersion'),
    matchVersion: searchParams.get('matchVersion'),
    cohortBy: searchParams.get('cohortBy'),
    minimumSampleSize: searchParams.get('minimumSampleSize')
      ? Number(searchParams.get('minimumSampleSize'))
      : undefined,
    page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
    pageSize: searchParams.get('pageSize')
      ? Number(searchParams.get('pageSize'))
      : undefined,
    sortBy: searchParams.get('sortBy'),
    sortOrder: searchParams.get('sortOrder'),
  });
}

/**
 * Serializes active filter values for inclusion in standardized API responses.
 */
export function serializeActiveFilters(
  filters: NormalizedAnalyticsFilters
): Record<string, unknown> {
  return {
    source: filters.source,
    niche: filters.niche,
    governorate: filters.governorate,
    city: filters.city,
    district: filters.district,
    service: filters.service,
    scoreBand: filters.scoreBand,
    qualityBand: filters.qualityBand,
    freshness: filters.freshness,
    accessType: filters.accessType,
    developerId: filters.developerId,
    scoringVersion: filters.scoringVersion,
    matchVersion: filters.matchVersion,
    cohortBy: filters.cohortBy,
    minimumSampleSize: filters.minimumSampleSize,
  };
}

export const resolveDateRange = resolveDateRangeWindow;
export const parseAnalyticsFilterFromSearchParams =
  parseAnalyticsFiltersFromSearchParams;

