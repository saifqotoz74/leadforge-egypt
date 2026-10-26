import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth';
import { ClaimEngineError } from '@/lib/claims/types';
import { IngestionError } from '@/lib/collectors/types';
import { EngagementEngineError } from '@/lib/feedback/types';
import { AnalyticsEngineError } from '@/lib/analytics/types';
import { MergeServiceError } from '@/lib/deduplication';
import { applySecurityHeaders } from './headers';

/**
 * Standardized Phase 9 Error Taxonomy (Section 18).
 */
export type StandardErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INSUFFICIENT_CREDITS'
  | 'LEAD_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export class AppSecurityError extends Error {
  public readonly code: StandardErrorCode | string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: StandardErrorCode | string,
    message: string,
    statusCode = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppSecurityError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|apikey|api_key|authorization|cookie|session|private_?key|webhook_?secret|client_?secret|jwt|credit_?card|cvv|passhash|passwordhash|database_url|connection_string|phone|phones|mobile|telephone/i;

const SQL_LEAK_PATTERN =
  /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE|PrismaClientKnownRequestError|PrismaClientUnknownRequestError|PrismaClientValidationError|Invalid\s+`prisma\.)\b/i;

const STACK_TRACE_PATTERN = /(?:\r?\n\s*at\s+[^\r\n]+)+/g;
const WINDOWS_PATH_PATTERN = /[A-Za-z]:\\[\\\S]+/g;
const UNIX_PATH_PATTERN = /\/(?:Users|home|var|etc|opt|usr|tmp|app|workspace)\/[\S]+/g;
const CONNECTION_STRING_PATTERN = /\b(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s"']+/gi;
const JWT_TOKEN_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

export const EGYPTIAN_PHONE_PATTERN =
  /(?:\b|\+)(?:20|0020)?[\s.-]?(?:0?1[0125](?:[\s.-]?[0-9]){8}|0?[23](?:[\s.-]?[0-9]){8})\b/g;

export const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/**
 * Scrubs raw strings to remove stack traces, SQL fragments, file paths, connection strings, JWTs, phone numbers, and emails.
 */
export function sanitizeErrorMessageString(input: string): string {
  if (!input || typeof input !== 'string') return '';
  if (SQL_LEAK_PATTERN.test(input)) {
    return 'Internal database operation error';
  }
  return input
    .replace(STACK_TRACE_PATTERN, '')
    .replace(CONNECTION_STRING_PATTERN, '[REDACTED_URI]')
    .replace(JWT_TOKEN_PATTERN, '[REDACTED_TOKEN]')
    .replace(WINDOWS_PATH_PATTERN, '[REDACTED_PATH]')
    .replace(UNIX_PATH_PATTERN, '[REDACTED_PATH]')
    .replace(EGYPTIAN_PHONE_PATTERN, '[REDACTED_PHONE]')
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .trim();
}

/**
 * Extracts a safe client-facing error message from an unknown error,
 * falling back to `fallbackMessage` if the error is a Prisma/SQL internal error.
 */
export function getSafeClientErrorMessage(err: unknown, fallbackMessage: string): string {
  if (!(err instanceof Error)) {
    return fallbackMessage;
  }
  if (err.name.startsWith('PrismaClient') || SQL_LEAK_PATTERN.test(err.message)) {
    return fallbackMessage;
  }
  const sanitized = sanitizeErrorMessageString(err.message);
  return sanitized || fallbackMessage;
}

/**
 * Recursively redacts sensitive fields, secrets, tokens, stack traces, and paths from objects/logs.
 */
export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[MAX_DEPTH]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return sanitizeErrorMessageString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeErrorMessageString(value.message),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'stack' || k === 'stackTrace' || k === 'rawSql' || k === 'sql') {
        continue;
      }
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSensitiveData(v, depth + 1);
      }
    }
    return out;
  }

  return String(value);
}

/**
 * Maps domain-specific error codes and HTTP status codes to the standardized Phase 9 Error Taxonomy.
 */
export function mapToStandardErrorCode(
  rawCode?: string | null,
  statusCode = 500
): StandardErrorCode {
  const upper = (rawCode || '').toUpperCase();

  if (upper === 'UNAUTHORIZED' || upper === 'UNAUTHENTICATED' || statusCode === 401) {
    return 'UNAUTHORIZED';
  }
  if (
    upper === 'FORBIDDEN' ||
    upper === 'CSRF_ERROR' ||
    upper === 'SSRF_BLOCKED' ||
    upper === 'POLICY_RESTRICTION' ||
    statusCode === 403
  ) {
    return 'FORBIDDEN';
  }
  if (upper === 'NOT_FOUND' || upper.endsWith('_NOT_FOUND') || statusCode === 404) {
    return 'NOT_FOUND';
  }
  if (upper === 'RATE_LIMITED' || upper === 'SOURCE_RATE_LIMITED' || statusCode === 429) {
    return 'RATE_LIMITED';
  }
  if (upper === 'INSUFFICIENT_CREDITS' || statusCode === 402) {
    return 'INSUFFICIENT_CREDITS';
  }
  if (upper === 'IDEMPOTENCY_CONFLICT' || upper === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PARAMETERS') {
    return 'IDEMPOTENCY_CONFLICT';
  }
  if (
    upper === 'LEAD_UNAVAILABLE' ||
    upper === 'LEAD_NOT_AVAILABLE' ||
    upper === 'LEAD_ALREADY_CLAIMED_EXCLUSIVELY' ||
    upper === 'LEAD_MAX_PURCHASERS_REACHED' ||
    upper === 'LEAD_NOT_SALEABLE' ||
    upper === 'LEAD_STALE' ||
    upper === 'LEAD_REQUIRES_VERIFICATION' ||
    upper === 'CLAIM_WINDOW_EXPIRED'
  ) {
    return 'LEAD_UNAVAILABLE';
  }
  if (
    upper === 'CONFLICT' ||
    upper.includes('CONFLICT') ||
    upper === 'ALREADY_CLAIMED' ||
    upper === 'DUPLICATE_RECORD' ||
    upper === 'JOB_LOCKED' ||
    statusCode === 409
  ) {
    return 'CONFLICT';
  }
  if (
    upper === 'VALIDATION_ERROR' ||
    upper.startsWith('INVALID_') ||
    upper.startsWith('MISSING_') ||
    upper === 'MASS_ASSIGNMENT_BLOCKED' ||
    statusCode === 400 ||
    statusCode === 422
  ) {
    return 'VALIDATION_ERROR';
  }
  if (
    upper === 'SERVICE_UNAVAILABLE' ||
    upper === 'CIRCUIT_OPEN' ||
    upper === 'SOURCE_TIMEOUT' ||
    statusCode === 503 ||
    statusCode === 504
  ) {
    return 'SERVICE_UNAVAILABLE';
  }

  return 'INTERNAL_ERROR';
}

export interface FormattedSafeError {
  statusCode: number;
  body: {
    error: string;
    code: string;
    standardCode: StandardErrorCode;
    errorCode: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

/**
 * Converts any thrown error into a safe, sanitized API error payload without leaking internals.
 */
export function formatSafeApiError(
  err: unknown,
  options: {
    defaultMessage?: string;
    defaultCode?: StandardErrorCode | string;
    defaultStatus?: number;
    requestId?: string;
  } = {}
): FormattedSafeError {
  const defaultMessage = options.defaultMessage || 'حدث خطأ غير متوقع في النظام.';
  const requestId = options.requestId;

  if (err instanceof AppSecurityError) {
    const standardCode = mapToStandardErrorCode(err.code, err.statusCode);
    return {
      statusCode: err.statusCode,
      body: {
        error: sanitizeErrorMessageString(err.message) || defaultMessage,
        code: err.code,
        standardCode,
        errorCode: err.code,
        ...(err.details
          ? { details: redactSensitiveData(err.details) as Record<string, unknown> }
          : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  if (err instanceof AuthError) {
    const standardCode = err.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN';
    return {
      statusCode: err.statusCode,
      body: {
        error: sanitizeErrorMessageString(err.message),
        code: standardCode,
        standardCode,
        errorCode: standardCode,
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  if (err instanceof ClaimEngineError) {
    const standardCode = mapToStandardErrorCode(err.code, err.statusCode);
    return {
      statusCode: err.statusCode,
      body: {
        error: sanitizeErrorMessageString(err.message),
        code: err.code,
        standardCode,
        errorCode: err.code,
        ...(err.details
          ? { details: redactSensitiveData(err.details) as Record<string, unknown> }
          : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  if (err instanceof IngestionError) {
    const standardCode = mapToStandardErrorCode(err.code, err.statusCode);
    return {
      statusCode: err.statusCode,
      body: {
        error: sanitizeErrorMessageString(err.message),
        code: err.code,
        standardCode,
        errorCode: err.code,
        ...(err.details
          ? { details: redactSensitiveData(err.details) as Record<string, unknown> }
          : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  if (err instanceof EngagementEngineError) {
    const standardCode = mapToStandardErrorCode(err.code, err.statusCode);
    return {
      statusCode: err.statusCode,
      body: {
        error: sanitizeErrorMessageString(err.message),
        code: err.code,
        standardCode,
        errorCode: err.code,
        ...(err.details
          ? { details: redactSensitiveData(err.details) as Record<string, unknown> }
          : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  if (err instanceof AnalyticsEngineError) {
    const standardCode = mapToStandardErrorCode(err.code, err.statusCode);
    return {
      statusCode: err.statusCode,
      body: {
        error: sanitizeErrorMessageString(err.message),
        code: err.code,
        standardCode,
        errorCode: err.code,
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  if (err instanceof MergeServiceError) {
    const standardCode = mapToStandardErrorCode(err.code, err.statusCode);
    return {
      statusCode: err.statusCode,
      body: {
        error: sanitizeErrorMessageString(err.message),
        code: err.code,
        standardCode,
        errorCode: err.code,
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  if (err instanceof SyntaxError) {
    return {
      statusCode: 400,
      body: {
        error: 'صيغة البيانات المرسلة (JSON) غير صالحة.',
        code: 'VALIDATION_ERROR',
        standardCode: 'VALIDATION_ERROR',
        errorCode: 'VALIDATION_ERROR',
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  const statusCode = options.defaultStatus || 500;
  const fallbackCode = options.defaultCode || mapToStandardErrorCode(null, statusCode);
  const standardCode = mapToStandardErrorCode(fallbackCode, statusCode);

  return {
    statusCode,
    body: {
      error: defaultMessage,
      code: fallbackCode,
      standardCode,
      errorCode: fallbackCode,
      ...(requestId ? { requestId } : {}),
    },
  };
}

/**
 * Builds a NextResponse with standardized safe error structure and hardened security headers.
 */
export function createSafeErrorResponse(
  err: unknown,
  options: {
    defaultMessage?: string;
    defaultCode?: StandardErrorCode | string;
    defaultStatus?: number;
    requestId?: string;
    headers?: Record<string, string>;
  } = {}
): NextResponse {
  const formatted = formatSafeApiError(err, options);
  const res = NextResponse.json(formatted.body, {
    status: formatted.statusCode,
    headers: options.headers,
  });
  return applySecurityHeaders(res, options.requestId);
}
