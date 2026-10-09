/**
 * Central API error mapper per Spec Addendum 01 Section 3.4
 * Maps HTTP status codes and known backend error strings to catalog keys in errors.*
 * Raw error.message is NEVER shown to users.
 */

export type KnownErrorKey =
  | 'generic'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'insufficientCredits'
  | 'leadUnavailable'
  | 'duplicatePurchase'
  | 'network'
  | 'rateLimited';

const ERROR_CODE_MAP: Record<string, KnownErrorKey> = {
  // Auth & RBAC
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  DEVELOPER_SUSPENDED: 'forbidden',
  DEVELOPER_INACTIVE: 'forbidden',
  LEAD_ACCESS_DENIED: 'forbidden',

  // Not Found
  NOT_FOUND: 'notFound',
  PROFILE_NOT_FOUND: 'notFound',
  LEAD_NOT_FOUND: 'notFound',

  // Credits & Purchasing
  INSUFFICIENT_CREDITS: 'insufficientCredits',
  ZERO_BALANCE: 'insufficientCredits',
  LEAD_UNAVAILABLE: 'leadUnavailable',
  LEAD_SHARED_MAX_PURCHASERS_REACHED: 'leadUnavailable',
  LEAD_EXCLUSIVE_ALREADY_CLAIMED: 'leadUnavailable',
  LEAD_ALREADY_CLAIMED: 'duplicatePurchase',
  DUPLICATE_CLAIM: 'duplicatePurchase',

  // Rate Limiting
  RATE_LIMITED: 'rateLimited',
  TOO_MANY_REQUESTS: 'rateLimited',

  // Network
  NETWORK_ERROR: 'network',
  FAILED_TO_FETCH: 'network',
};

const HTTP_STATUS_MAP: Record<number, KnownErrorKey> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'notFound',
  402: 'insufficientCredits',
  409: 'leadUnavailable',
  429: 'rateLimited',
};

export function getApiErrorKey(statusOrCode?: number | string | null): KnownErrorKey {
  if (!statusOrCode) return 'generic';

  if (typeof statusOrCode === 'number') {
    return HTTP_STATUS_MAP[statusOrCode] || 'generic';
  }

  const normalized = statusOrCode.trim().toUpperCase();
  if (ERROR_CODE_MAP[normalized]) {
    return ERROR_CODE_MAP[normalized];
  }

  // Check if it's a numeric string HTTP status
  const numericStatus = parseInt(statusOrCode, 10);
  if (!isNaN(numericStatus) && HTTP_STATUS_MAP[numericStatus]) {
    return HTTP_STATUS_MAP[numericStatus];
  }

  return 'generic';
}

/**
 * Maps error to catalog key name for t(`errors.${key}`)
 */
export function mapApiError(error: unknown): KnownErrorKey {
  if (!error) return 'generic';

  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;

    if (typeof errObj.status === 'number') {
      return getApiErrorKey(errObj.status);
    }

    if (typeof errObj.statusCode === 'number') {
      return getApiErrorKey(errObj.statusCode);
    }

    if (typeof errObj.code === 'string') {
      return getApiErrorKey(errObj.code);
    }

    if (typeof errObj.errorCode === 'string') {
      return getApiErrorKey(errObj.errorCode);
    }
  }

  return 'generic';
}
