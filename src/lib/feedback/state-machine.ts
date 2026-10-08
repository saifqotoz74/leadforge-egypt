import { EngagementStatus } from '@prisma/client';
import {
  EngagementEngineError,
  INVALID_REASON_CODES,
  LOST_REASON_CODES,
} from './types';

export const ENGAGEMENT_STATUS_VALUES: readonly EngagementStatus[] = [
  'CLAIMED',
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'MEETING',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
  'NOT_INTERESTED',
  'INVALID',
];

export const TERMINAL_ENGAGEMENT_STATUSES: ReadonlySet<EngagementStatus> = new Set<EngagementStatus>([
  'WON',
  'LOST',
  'NOT_INTERESTED',
  'INVALID',
]);

export const ALLOWED_ENGAGEMENT_TRANSITIONS: Readonly<
  Record<EngagementStatus, readonly EngagementStatus[]>
> = {
  CLAIMED: ['CONTACTED', 'INVALID', 'NOT_INTERESTED'],
  CONTACTED: ['REPLIED', 'NOT_INTERESTED', 'LOST', 'INVALID'],
  REPLIED: ['INTERESTED', 'NOT_INTERESTED', 'LOST', 'INVALID'],
  INTERESTED: ['MEETING', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'NOT_INTERESTED', 'INVALID'],
  MEETING: ['PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'INVALID'],
  PROPOSAL_SENT: ['NEGOTIATION', 'WON', 'LOST', 'INVALID'],
  NEGOTIATION: ['WON', 'LOST', 'INVALID'],
  WON: [],
  LOST: [],
  NOT_INTERESTED: [],
  INVALID: [],
};

export function isValidEngagementStatus(value: unknown): value is EngagementStatus {
  return (
    typeof value === 'string' &&
    (ENGAGEMENT_STATUS_VALUES as readonly string[]).includes(value)
  );
}

export function isTerminalEngagementStatus(status: EngagementStatus): boolean {
  return TERMINAL_ENGAGEMENT_STATUSES.has(status);
}

export function getAllowedNextStatuses(currentStatus: EngagementStatus): readonly EngagementStatus[] {
  return ALLOWED_ENGAGEMENT_TRANSITIONS[currentStatus] ?? [];
}

export function isTransitionAllowed(
  fromStatus: EngagementStatus,
  toStatus: EngagementStatus
): boolean {
  const allowed = ALLOWED_ENGAGEMENT_TRANSITIONS[fromStatus];
  if (!allowed) return false;
  return allowed.includes(toStatus);
}

export function validateStateTransition(
  currentStatus: EngagementStatus,
  targetStatus: EngagementStatus
): void {
  if (!isValidEngagementStatus(targetStatus)) {
    throw new EngagementEngineError(
      'INVALID_STATUS_TRANSITION',
      `Invalid engagement status: ${String(targetStatus)}`,
      422,
      { currentStatus, targetStatus }
    );
  }

  if (currentStatus === targetStatus) {
    throw new EngagementEngineError(
      'DUPLICATE_EVENT',
      `Engagement is already in status ${targetStatus}`,
      409,
      { currentStatus, targetStatus }
    );
  }

  if (isTerminalEngagementStatus(currentStatus)) {
    throw new EngagementEngineError(
      'TERMINAL_STATUS',
      `Cannot transition from terminal status ${currentStatus} to ${targetStatus}. Admin correction is required.`,
      422,
      {
        currentStatus,
        targetStatus,
        isTerminal: true,
        allowedTransitions: [],
      }
    );
  }

  if (!isTransitionAllowed(currentStatus, targetStatus)) {
    throw new EngagementEngineError(
      'INVALID_STATUS_TRANSITION',
      `Invalid status transition from ${currentStatus} to ${targetStatus}`,
      422,
      {
        currentStatus,
        targetStatus,
        allowedTransitions: getAllowedNextStatuses(currentStatus),
      }
    );
  }
}

export interface ValidatedOutcomeFields {
  finalOutcome: EngagementStatus | null;
  outcomeReasonCode: string | null;
  outcomeReasonNote: string | null;
  estimatedProjectValue: number | null;
  currency: string;
  wonReason: string | null;
  lostReasonCode: string | null;
  lostReasonNote: string | null;
  invalidReasonCode: string | null;
  invalidReasonNote: string | null;
}

export function validateOutcomePayload(params: {
  targetStatus: EngagementStatus;
  reasonCode?: string | null;
  note?: string | null;
  estimatedProjectValue?: number | string | null;
  currency?: string | null;
  wonReason?: string | null;
}): ValidatedOutcomeFields {
  const { targetStatus, reasonCode, note, estimatedProjectValue, currency, wonReason } = params;
  const trimmedCode = reasonCode?.trim().toUpperCase() || null;
  const trimmedNote = note?.trim() || null;
  const normalizedCurrency = currency?.trim().toUpperCase() || 'EGP';

  let parsedProjectValue: number | null = null;
  if (
    estimatedProjectValue !== undefined &&
    estimatedProjectValue !== null &&
    String(estimatedProjectValue).trim() !== '' &&
    String(estimatedProjectValue).trim().toLowerCase() !== 'unknown'
  ) {
    const num = Number(estimatedProjectValue);
    if (!Number.isFinite(num) || num < 0) {
      throw new EngagementEngineError(
        'INVALID_FEEDBACK',
        'estimatedProjectValue must be a non-negative number, null, or "unknown"',
        422,
        { estimatedProjectValue }
      );
    }
    parsedProjectValue = Math.round(num);
  }

  if (targetStatus === 'WON') {
    return {
      finalOutcome: 'WON',
      outcomeReasonCode: trimmedCode ?? 'DEAL_CLOSED_WON',
      outcomeReasonNote: trimmedNote ?? wonReason?.trim() ?? null,
      estimatedProjectValue: parsedProjectValue,
      currency: normalizedCurrency,
      wonReason: wonReason?.trim() || trimmedNote || null,
      lostReasonCode: null,
      lostReasonNote: null,
      invalidReasonCode: null,
      invalidReasonNote: null,
    };
  }

  if (targetStatus === 'LOST') {
    if (!trimmedCode || !(LOST_REASON_CODES as readonly string[]).includes(trimmedCode)) {
      throw new EngagementEngineError(
        'INVALID_REASON',
        `A valid LOST reasonCode is required (${LOST_REASON_CODES.join(', ')})`,
        422,
        { reasonCode: trimmedCode, validReasonCodes: LOST_REASON_CODES }
      );
    }
    if (trimmedCode === 'OTHER' && (!trimmedNote || trimmedNote.length === 0)) {
      throw new EngagementEngineError(
        'INVALID_REASON',
        'A non-empty note is required when LOST reasonCode is OTHER',
        422,
        { reasonCode: 'OTHER' }
      );
    }
    return {
      finalOutcome: 'LOST',
      outcomeReasonCode: trimmedCode,
      outcomeReasonNote: trimmedNote,
      estimatedProjectValue: parsedProjectValue,
      currency: normalizedCurrency,
      wonReason: null,
      lostReasonCode: trimmedCode,
      lostReasonNote: trimmedNote,
      invalidReasonCode: null,
      invalidReasonNote: null,
    };
  }

  if (targetStatus === 'INVALID') {
    if (!trimmedCode || !(INVALID_REASON_CODES as readonly string[]).includes(trimmedCode)) {
      throw new EngagementEngineError(
        'INVALID_REASON',
        `A valid INVALID reasonCode is required (${INVALID_REASON_CODES.join(', ')})`,
        422,
        { reasonCode: trimmedCode, validReasonCodes: INVALID_REASON_CODES }
      );
    }
    if (trimmedCode === 'OTHER' && (!trimmedNote || trimmedNote.length === 0)) {
      throw new EngagementEngineError(
        'INVALID_REASON',
        'A non-empty note is required when INVALID reasonCode is OTHER',
        422,
        { reasonCode: 'OTHER' }
      );
    }
    return {
      finalOutcome: 'INVALID',
      outcomeReasonCode: trimmedCode,
      outcomeReasonNote: trimmedNote,
      estimatedProjectValue: null,
      currency: normalizedCurrency,
      wonReason: null,
      lostReasonCode: null,
      lostReasonNote: null,
      invalidReasonCode: trimmedCode,
      invalidReasonNote: trimmedNote,
    };
  }

  if (targetStatus === 'NOT_INTERESTED') {
    return {
      finalOutcome: 'NOT_INTERESTED',
      outcomeReasonCode: trimmedCode ?? 'NOT_INTERESTED',
      outcomeReasonNote: trimmedNote,
      estimatedProjectValue: null,
      currency: normalizedCurrency,
      wonReason: null,
      lostReasonCode: null,
      lostReasonNote: null,
      invalidReasonCode: null,
      invalidReasonNote: null,
    };
  }

  return {
    finalOutcome: null,
    outcomeReasonCode: trimmedCode,
    outcomeReasonNote: trimmedNote,
    estimatedProjectValue: parsedProjectValue,
    currency: normalizedCurrency,
    wonReason: null,
    lostReasonCode: null,
    lostReasonNote: null,
    invalidReasonCode: null,
    invalidReasonNote: null,
  };
}

export function parseAndValidateTimestamp(
  rawValue: string | Date | null | undefined,
  fieldName: string,
  now: Date = new Date()
): Date | null {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return null;
  }
  const parsed = rawValue instanceof Date ? rawValue : new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new EngagementEngineError(
      'INVALID_TIMESTAMP',
      `Invalid timestamp format for ${fieldName}`,
      422,
      { fieldName, rawValue }
    );
  }
  // Reject future timestamps (allow 2 seconds clock skew for test execution)
  if (parsed.getTime() > now.getTime() + 2000) {
    throw new EngagementEngineError(
      'INVALID_TIMESTAMP',
      `Future timestamp is not allowed for ${fieldName}`,
      422,
      { fieldName, timestamp: parsed.toISOString(), now: now.toISOString() }
    );
  }
  return parsed;
}

export interface EngagementTimestampsSnapshot {
  claimedAt: Date;
  firstContactedAt?: Date | null;
  lastContactedAt?: Date | null;
  firstRepliedAt?: Date | null;
  interestedAt?: Date | null;
  meetingAt?: Date | null;
  proposalSentAt?: Date | null;
  negotiationAt?: Date | null;
  wonAt?: Date | null;
  lostAt?: Date | null;
  invalidAt?: Date | null;
  notInterestedAt?: Date | null;
}

export function validateChronologicalTimestamps(
  snapshot: EngagementTimestampsSnapshot
): void {
  const {
    claimedAt,
    firstContactedAt,
    firstRepliedAt,
    interestedAt,
    meetingAt,
    proposalSentAt,
    negotiationAt,
    wonAt,
    lostAt,
    invalidAt,
    notInterestedAt,
  } = snapshot;

  const assertNotBefore = (
    laterDate: Date | null | undefined,
    laterName: string,
    earlierDate: Date | null | undefined,
    earlierName: string
  ) => {
    if (!laterDate || !earlierDate) return;
    if (laterDate.getTime() < earlierDate.getTime()) {
      throw new EngagementEngineError(
        'INVALID_TIMESTAMP',
        `Chronological order violation: ${laterName} (${laterDate.toISOString()}) cannot be earlier than ${earlierName} (${earlierDate.toISOString()})`,
        422,
        {
          laterField: laterName,
          laterValue: laterDate.toISOString(),
          earlierField: earlierName,
          earlierValue: earlierDate.toISOString(),
        }
      );
    }
  };

  assertNotBefore(firstContactedAt, 'contactedAt', claimedAt, 'claimedAt');
  assertNotBefore(firstRepliedAt, 'repliedAt', claimedAt, 'claimedAt');
  assertNotBefore(firstRepliedAt, 'repliedAt', firstContactedAt, 'contactedAt');
  assertNotBefore(interestedAt, 'interestedAt', claimedAt, 'claimedAt');
  assertNotBefore(interestedAt, 'interestedAt', firstContactedAt, 'contactedAt');
  assertNotBefore(interestedAt, 'interestedAt', firstRepliedAt, 'repliedAt');
  assertNotBefore(meetingAt, 'meetingAt', claimedAt, 'claimedAt');
  assertNotBefore(meetingAt, 'meetingAt', firstContactedAt, 'contactedAt');
  assertNotBefore(meetingAt, 'meetingAt', interestedAt, 'interestedAt');
  assertNotBefore(proposalSentAt, 'proposalSentAt', claimedAt, 'claimedAt');
  assertNotBefore(proposalSentAt, 'proposalSentAt', firstContactedAt, 'contactedAt');
  assertNotBefore(negotiationAt, 'negotiationAt', claimedAt, 'claimedAt');
  assertNotBefore(negotiationAt, 'negotiationAt', firstContactedAt, 'contactedAt');
  assertNotBefore(wonAt, 'wonAt', claimedAt, 'claimedAt');
  assertNotBefore(wonAt, 'wonAt', firstContactedAt, 'contactedAt');
  assertNotBefore(wonAt, 'wonAt', interestedAt, 'interestedAt');
  assertNotBefore(wonAt, 'wonAt', meetingAt, 'meetingAt');
  assertNotBefore(wonAt, 'wonAt', proposalSentAt, 'proposalSentAt');
  assertNotBefore(wonAt, 'wonAt', negotiationAt, 'negotiationAt');
  assertNotBefore(lostAt, 'lostAt', claimedAt, 'claimedAt');
  assertNotBefore(lostAt, 'lostAt', firstContactedAt, 'contactedAt');
  assertNotBefore(invalidAt, 'invalidAt', claimedAt, 'claimedAt');
  assertNotBefore(notInterestedAt, 'notInterestedAt', claimedAt, 'claimedAt');
}
