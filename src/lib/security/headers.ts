import { NextResponse } from 'next/server';
import { AppSecurityError } from './error-taxonomy';

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data: https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-DNS-Prefetch-Control': 'off',
  'X-Permitted-Cross-Domain-Policies': 'none',
});

/**
 * Applies production security headers and optional correlation requestId to a NextResponse.
 */
export function applySecurityHeaders<T extends NextResponse | Response>(
  response: T,
  requestId?: string
): T {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(key)) {
      response.headers.set(key, value);
    }
  }
  if (requestId) {
    response.headers.set('X-Request-Id', requestId);
  }
  return response;
}

/**
 * Validates CORS Origin against approved origin list.
 * Never allows wildcard '*' with credentials.
 */
export function validateCorsOrigin(
  origin: string | null | undefined,
  expectedHost?: string | null
): { allowed: boolean; allowedOrigin: string | null } {
  if (!origin) {
    return { allowed: true, allowedOrigin: null };
  }

  const trimmedOrigin = origin.trim();
  if (trimmedOrigin === '*' || trimmedOrigin.toLowerCase() === 'null') {
    return { allowed: false, allowedOrigin: null };
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(trimmedOrigin);
  } catch {
    return { allowed: false, allowedOrigin: null };
  }

  const approvedSet = new Set<string>();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      const u = new URL(appUrl);
      approvedSet.add(u.origin.toLowerCase());
    } catch {
      // ignore invalid env URL
    }
  }

  const envOrigins = process.env.ALLOWED_CORS_ORIGINS;
  if (envOrigins) {
    for (const item of envOrigins.split(',')) {
      const clean = item.trim();
      if (clean && clean !== '*') {
        try {
          approvedSet.add(new URL(clean).origin.toLowerCase());
        } catch {
          // ignore invalid origin entry
        }
      }
    }
  }

  if (expectedHost) {
    const cleanHost = expectedHost.split(',')[0].trim().toLowerCase();
    if (parsedOrigin.host.toLowerCase() === cleanHost) {
      return { allowed: true, allowedOrigin: parsedOrigin.origin };
    }
  }

  if (approvedSet.has(parsedOrigin.origin.toLowerCase())) {
    return { allowed: true, allowedOrigin: parsedOrigin.origin };
  }

  return { allowed: false, allowedOrigin: null };
}

/**
 * Builds strict CORS headers for approved origins only (never wildcard with credentials).
 */
export function buildCorsHeaders(
  origin: string | null | undefined,
  expectedHost?: string | null
): Record<string, string> {
  const check = validateCorsOrigin(origin, expectedHost);
  if (!check.allowed || !check.allowedOrigin) {
    return { Vary: 'Origin' };
  }
  return {
    'Access-Control-Allow-Origin': check.allowedOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key, X-Request-Id, X-CSRF-Token',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

// ============================================================================
// FILE UPLOAD & CSV SECURITY (Section 16)
// ============================================================================
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 5000;
export const ALLOWED_UPLOAD_EXTENSIONS = ['.csv', '.json', '.txt'] as const;
export const BLOCKED_EXECUTABLE_EXTENSIONS = [
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.sh',
  '.bash',
  '.bat',
  '.cmd',
  '.ps1',
  '.vbs',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.php',
  '.py',
  '.rb',
  '.pl',
  '.jar',
  '.war',
  '.msi',
  '.com',
  '.scr',
  '.pif',
  '.html',
  '.htm',
  '.svg',
  '.xml',
] as const;

export const ALLOWED_UPLOAD_MIMES = [
  'text/csv',
  'application/csv',
  'application/json',
  'text/plain',
  'application/vnd.ms-excel',
] as const;

/**
 * Validates file upload metadata, extension, MIME type, payload size, and row count.
 */
export function validateImportUploadSafety(params: {
  fileName?: string | null;
  mimeType?: string | null;
  payloadBytes?: number;
  rowCount?: number;
  maxBytes?: number;
  maxRows?: number;
}): { valid: true } {
  const maxBytes = params.maxBytes ?? MAX_UPLOAD_BYTES;
  const maxRows = params.maxRows ?? MAX_IMPORT_ROWS;

  if (typeof params.payloadBytes === 'number' && params.payloadBytes > maxBytes) {
    throw new AppSecurityError(
      'VALIDATION_ERROR',
      `Import payload size (${params.payloadBytes} bytes) exceeds maximum allowed limit (${maxBytes} bytes).`,
      413,
      { payloadBytes: params.payloadBytes, maxBytes }
    );
  }

  if (typeof params.rowCount === 'number' && params.rowCount > maxRows) {
    throw new AppSecurityError(
      'VALIDATION_ERROR',
      `Import row count (${params.rowCount}) exceeds maximum allowed limit (${maxRows}).`,
      422,
      { rowCount: params.rowCount, maxRows }
    );
  }

  if (params.fileName) {
    const cleanName = params.fileName.trim();
    if (cleanName.includes('\0') || cleanName.includes('..') || /[\\/]/.test(cleanName)) {
      throw new AppSecurityError(
        'VALIDATION_ERROR',
        'Invalid file name: path traversal or control characters are not allowed.',
        400,
        { fileName: cleanName }
      );
    }

    const lower = cleanName.toLowerCase();
    for (const blockedExt of BLOCKED_EXECUTABLE_EXTENSIONS) {
      if (lower.endsWith(blockedExt) || lower.includes(`${blockedExt}.`)) {
        throw new AppSecurityError(
          'VALIDATION_ERROR',
          `Executable or active script file extension "${blockedExt}" is strictly prohibited.`,
          400,
          { fileName: cleanName, blockedExtension: blockedExt }
        );
      }
    }

    const hasDot = lower.includes('.');
    if (hasDot) {
      const matchesAllowed = ALLOWED_UPLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext));
      if (!matchesAllowed) {
        throw new AppSecurityError(
          'VALIDATION_ERROR',
          `Unsupported file extension in "${cleanName}". Allowed: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}`,
          400,
          { fileName: cleanName }
        );
      }
    }
  }

  if (params.mimeType) {
    const baseMime = params.mimeType.split(';')[0].trim().toLowerCase();
    if (
      baseMime &&
      !ALLOWED_UPLOAD_MIMES.includes(baseMime as (typeof ALLOWED_UPLOAD_MIMES)[number])
    ) {
      throw new AppSecurityError(
        'VALIDATION_ERROR',
        `Unsupported MIME type "${baseMime}".`,
        400,
        { mimeType: baseMime }
      );
    }
  }

  return { valid: true };
}

/**
 * Neutralizes CSV formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`, or leading whitespace before formula chars)
 * and properly quotes CSV cells for export.
 */
export function sanitizeCsvExportCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const sanitized = /^[\t\r=+\-@]|^\s+[=+\-@]/.test(str) ? `'${str}` : str;
  if (/[",\r\n]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

// ============================================================================
// MASS ASSIGNMENT & PRIVILEGED FIELD GUARD (Section 6)
// ============================================================================
export const PRIVILEGED_SYSTEM_FIELDS = [
  'id',
  'role',
  'passwordHash',
  'balance',
  'reservedBalance',
  'lifetimePurchased',
  'lifetimeBonus',
  'lifetimeSpent',
  'lifetimeRefunded',
  'totalGranted',
  'totalSpent',
  'totalRefunded',
  'creditsCharged',
  'creditsRefunded',
  'exclusiveClaimedById',
  'exclusiveClaimedAt',
  'currentPurchasers',
  'isCanonical',
  'canonicalLeadId',
] as const;

/**
 * Detects whether an untrusted request body attempts to set forbidden/privileged fields
 * not included in the endpoint's explicit allowlist.
 */
export function detectForbiddenFieldsInPayload(
  payload: unknown,
  allowedFields: readonly string[]
): { hasForbiddenFields: boolean; forbiddenFields: string[]; unknownFields: string[] } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { hasForbiddenFields: false, forbiddenFields: [], unknownFields: [] };
  }

  const allowedSet = new Set(allowedFields);
  const privilegedSet = new Set<string>(PRIVILEGED_SYSTEM_FIELDS);
  const forbiddenFields: string[] = [];
  const unknownFields: string[] = [];

  for (const key of Object.keys(payload as Record<string, unknown>)) {
    if (!allowedSet.has(key)) {
      unknownFields.push(key);
      if (privilegedSet.has(key)) {
        forbiddenFields.push(key);
      }
    }
  }

  return {
    hasForbiddenFields: forbiddenFields.length > 0,
    forbiddenFields,
    unknownFields,
  };
}
