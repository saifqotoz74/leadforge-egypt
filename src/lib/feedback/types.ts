import {
  ContactAttemptResult,
  ContactChannel,
  EngagementStatus,
  FeedbackCategory,
} from '@prisma/client';

export type EngagementErrorCode =
  | 'ENGAGEMENT_NOT_FOUND'
  | 'CLAIM_REQUIRED'
  | 'CLAIM_NOT_ACTIVE'
  | 'INVALID_STATUS_TRANSITION'
  | 'INVALID_FEEDBACK'
  | 'INVALID_REASON'
  | 'DUPLICATE_EVENT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TERMINAL_STATUS'
  | 'INVALID_TIMESTAMP'
  | 'WAIT_PERIOD_REQUIRED'
  | 'TRIAL_REFUND_LIMIT_EXCEEDED'
  | 'RATE_LIMITED';

export class EngagementEngineError extends Error {
  public readonly code: EngagementErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: EngagementErrorCode,
    message: string,
    statusCode = 422,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'EngagementEngineError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export type FeedbackConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type FeedbackSourceType =
  | 'SINGLE_DEVELOPER_REPORT'
  | 'MULTIPLE_DEVELOPER_REPORTS'
  | 'OFFICIAL_VERIFICATION'
  | 'UNVERIFIED_USER_NOTE';

export type FeedbackAbuseFlag =
  | 'SUSPICIOUS_FEEDBACK_VOLUME'
  | 'DUPLICATE_FEEDBACK'
  | 'INVALID_SEQUENCE'
  | 'FREQUENT_INVALID_REPORTS'
  | 'RAPID_STATUS_CHANGES'
  | 'ADMIN_REVIEW_REQUIRED';

export type QualityReverificationSignal =
  | 'PHONE_REQUIRES_REVERIFICATION'
  | 'BUSINESS_STATUS_REQUIRES_VERIFICATION'
  | 'EMAIL_REQUIRES_REVERIFICATION'
  | 'WEBSITE_REQUIRES_REVERIFICATION'
  | 'CATEGORY_REQUIRES_REVERIFICATION'
  | 'LOCATION_REQUIRES_REVERIFICATION'
  | 'IDENTITY_REQUIRES_REVERIFICATION';

export const LOST_REASON_CODES = [
  'PRICE',
  'COMPETITOR',
  'NO_BUDGET',
  'NO_RESPONSE',
  'TIMING',
  'WRONG_CONTACT',
  'WRONG_BUSINESS',
  'DUPLICATE',
  'BUSINESS_CLOSED',
  'NOT_INTERESTED',
  'SERVICE_MISMATCH',
  'OTHER',
] as const;

export type LostReasonCode = (typeof LOST_REASON_CODES)[number];

export const INVALID_REASON_CODES = [
  'WRONG_PHONE',
  'WRONG_EMAIL',
  'BUSINESS_CLOSED',
  'BUSINESS_NOT_FOUND',
  'DUPLICATE',
  'WRONG_CATEGORY',
  'WRONG_LOCATION',
  'FAKE_BUSINESS',
  'ALREADY_CLIENT',
  'OTHER',
] as const;

export type InvalidReasonCode = (typeof INVALID_REASON_CODES)[number];

export const FEEDBACK_REASON_CODES_BY_CATEGORY: Record<FeedbackCategory, readonly string[]> = {
  CONTACT: [
    'PHONE_INVALID',
    'PHONE_UNREACHABLE',
    'PHONE_NO_ANSWER',
    'PHONE_ANSWERED',
    'WHATSAPP_ACTIVE',
    'WHATSAPP_INACTIVE',
    'EMAIL_INVALID',
    'EMAIL_UNRESPONSIVE',
    'EMAIL_BOUNCED',
    'EMAIL_VALID',
    'CONTACT_SUCCESSFUL',
    'WRONG_PHONE',
    'WRONG_EMAIL',
  ],
  BUSINESS: [
    'BUSINESS_OPEN',
    'BUSINESS_CLOSED',
    'BUSINESS_DUPLICATE',
    'BUSINESS_MOVED',
    'BUSINESS_WRONG_CATEGORY',
    'BUSINESS_WRONG_LOCATION',
    'WRONG_CATEGORY',
    'WRONG_LOCATION',
    'ALREADY_HAS_GOOD_WEBSITE',
    'NO_WEBSITE_CONFIRMED',
    'ALREADY_HAS_WEBSITE',
    'BUSINESS_NOT_FOUND',
    'FAKE_BUSINESS',
  ],
  SALES: [
    'INTERESTED',
    'HIGH_INTEREST',
    'NOT_INTERESTED',
    'ALREADY_WORKING_WITH_DEVELOPER',
    'BUDGET_TOO_LOW',
    'BUDGET_TOO_HIGH',
    'LOW_BUDGET',
    'PRICE_OBJECTION',
    'COMPETITOR_CHOSEN',
    'TIMING_NOT_RIGHT',
    'DECISION_DELAYED',
    'NOT_DECISION_MAKER',
    'NEED_FOLLOW_UP',
    'REQUESTED_QUOTE',
    'MEETING_BOOKED',
    'ALREADY_CLIENT',
  ],
  LEAD_QUALITY: [
    'GREAT_LEAD',
    'GOOD_LEAD',
    'POOR_LEAD',
    'INVALID_LEAD',
    'HIGH_QUALITY_LEAD',
    'LOW_QUALITY_LEAD',
    'INCOMPLETE_CONTACT_INFO',
    'MISLEADING_DESCRIPTION',
    'DUPLICATE_LEAD',
    'DUPLICATE',
    'OTHER',
  ],
};

export const ALL_STRUCTURED_FEEDBACK_REASON_CODES = new Set<string>([
  ...FEEDBACK_REASON_CODES_BY_CATEGORY.CONTACT,
  ...FEEDBACK_REASON_CODES_BY_CATEGORY.BUSINESS,
  ...FEEDBACK_REASON_CODES_BY_CATEGORY.SALES,
  ...FEEDBACK_REASON_CODES_BY_CATEGORY.LEAD_QUALITY,
  'OTHER',
]);

export const VALID_CONTACT_CHANNELS: readonly ContactChannel[] = [
  'PHONE',
  'WHATSAPP',
  'EMAIL',
  'SMS',
  'SOCIAL',
  'OTHER',
];

export const VALID_CONTACT_ATTEMPT_RESULTS: readonly ContactAttemptResult[] = [
  'NO_ANSWER',
  'ANSWERED',
  'INVALID_NUMBER',
  'MESSAGE_SENT',
  'REPLIED',
  'BOUNCED',
  'BLOCKED',
  'OTHER',
];

export interface UpdateEngagementStatusInput {
  leadId: string;
  developerId: string;
  status: EngagementStatus;
  reasonCode?: string | null;
  note?: string | null;
  notes?: string | null;
  estimatedProjectValue?: number | string | null;
  currency?: string | null;
  wonReason?: string | null;
  wonAt?: string | Date | null;
  contactedAt?: string | Date | null;
  repliedAt?: string | Date | null;
  interestedAt?: string | Date | null;
  meetingAt?: string | Date | null;
  proposalSentAt?: string | Date | null;
  negotiationAt?: string | Date | null;
  lostAt?: string | Date | null;
  invalidAt?: string | Date | null;
  notInterestedAt?: string | Date | null;
  nextFollowUpAt?: string | Date | null;
  idempotencyKey?: string | null;
  ipAddress?: string;
}

export interface SubmitStructuredFeedbackInput {
  leadId: string;
  developerId: string;
  category?: FeedbackCategory;
  reasonCode?: string;
  rating?: number | null;
  comment?: string | null;
  note?: string | null;
  useful?: boolean | null;
  sourceType?: FeedbackSourceType;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  ipAddress?: string;
}

export interface RecordContactAttemptInput {
  leadId: string;
  developerId: string;
  channel: ContactChannel;
  result: ContactAttemptResult;
  note?: string | null;
  attemptedAt?: string | Date | null;
  idempotencyKey?: string | null;
  ipAddress?: string;
}

export interface AdminCorrectEngagementStatusInput {
  engagementId: string;
  adminId: string;
  previousState?: EngagementStatus;
  previousStatus?: EngagementStatus;
  newState?: EngagementStatus;
  newStatus?: EngagementStatus;
  reason: string;
  estimatedProjectValue?: number | string | null;
  currency?: string | null;
  reasonCode?: string | null;
  ipAddress?: string;
}
