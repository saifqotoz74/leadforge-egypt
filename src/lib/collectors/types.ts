import { SourceType } from '@prisma/client';
import { RawLeadInput } from '../validator';
import { ConflictResolutionPolicy } from '../deduplication';

export const INGESTION_CONTRACT_V1 = 'INGESTION_CONTRACT_V1' as const;
export type IngestionContractVersion = typeof INGESTION_CONTRACT_V1;

export type IngestionErrorCode =
  | 'SOURCE_TIMEOUT'
  | 'SOURCE_RATE_LIMITED'
  | 'SOURCE_UNAVAILABLE'
  | 'INVALID_SOURCE_CONFIGURATION'
  | 'INVALID_SOURCE_RECORD'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'NORMALIZATION_FAILED'
  | 'IDENTITY_CONFLICT'
  | 'DUPLICATE_RECORD'
  | 'DATABASE_ERROR'
  | 'RETRY_EXHAUSTED'
  | 'POLICY_RESTRICTION'
  | 'CIRCUIT_OPEN'
  | 'JOB_LOCKED'
  | 'JOB_CANCELLED'
  | 'QUOTA_EXCEEDED'
  | 'SSRF_BLOCKED';

export class IngestionError extends Error {
  readonly code: IngestionErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: IngestionErrorCode,
    options?: {
      statusCode?: number;
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = 'IngestionError';
    this.code = code;
    this.statusCode = options?.statusCode ?? resolveDefaultStatusCode(code);
    this.retryable = options?.retryable ?? isDefaultRetryableCode(code);
    this.details = options?.details;
  }
}

export function isDefaultRetryableCode(code: IngestionErrorCode): boolean {
  switch (code) {
    case 'SOURCE_TIMEOUT':
    case 'SOURCE_RATE_LIMITED':
    case 'SOURCE_UNAVAILABLE':
    case 'DATABASE_ERROR':
      return true;
    default:
      return false;
  }
}

function resolveDefaultStatusCode(code: IngestionErrorCode): number {
  switch (code) {
    case 'INVALID_SOURCE_CONFIGURATION':
    case 'INVALID_SOURCE_RECORD':
    case 'SCHEMA_VALIDATION_FAILED':
    case 'NORMALIZATION_FAILED':
      return 400;
    case 'POLICY_RESTRICTION':
    case 'SSRF_BLOCKED':
      return 403;
    case 'IDENTITY_CONFLICT':
    case 'DUPLICATE_RECORD':
    case 'JOB_LOCKED':
      return 409;
    case 'SOURCE_RATE_LIMITED':
    case 'QUOTA_EXCEEDED':
      return 429;
    case 'CIRCUIT_OPEN':
    case 'SOURCE_UNAVAILABLE':
      return 503;
    case 'SOURCE_TIMEOUT':
      return 504;
    default:
      return 500;
  }
}

export type IngestionJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ImportRecordLifecycleStage =
  | 'DISCOVERED'
  | 'FETCHED'
  | 'VALIDATED'
  | 'NORMALIZED'
  | 'PROCESSED'
  | 'DUPLICATE'
  | 'INVALID'
  | 'FAILED'
  | 'SKIPPED'
  | 'DEAD_LETTER';

export type SourceHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'FAILING'
  | 'DISABLED'
  | 'NOT_CONFIGURED';

export type SourceConfigurationStatus =
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'INVALID';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CollectorCapabilities {
  supportsDiscovery: boolean;
  supportsIncrementalFetch: boolean;
  supportsCheckpointing: boolean;
  supportsHealthCheck: boolean;
  supportsBackfill: boolean;
  supportsBatching: boolean;
  requiresExternalCredentials: boolean;
  requiresManualInput: boolean;
}

export interface CollectorMetadata {
  collectorKey: string;
  displayName: string;
  displayNameAr: string;
  description: string;
  sourceType: SourceType;
  version: string;
  contractVersion: IngestionContractVersion;
  requireExternalId: boolean;
  requiredEnvVars?: string[];
  defaultScheduleCron?: string | null;
  defaultScheduleIntervalMinutes?: number | null;
  defaultPriority: number;
}

export interface CollectorConfigValidationResult {
  valid: boolean;
  status: SourceConfigurationStatus;
  errors: string[];
  warnings: string[];
  configuredCredentials: Record<string, 'CONFIGURED' | 'NOT_CONFIGURED'>;
}

export interface IngestionCheckpoint {
  cursor?: string | null;
  pageToken?: string | null;
  offset: number;
  lastProcessedExternalId?: string | null;
  batchIndex: number;
  processedCount: number;
  updatedAt: string;
  continuationState?: Record<string, unknown>;
}

export interface RetryPolicyConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

export interface SourceQuotaConfig {
  maxRecordsPerRun: number;
  batchSize: number;
  requestsPerMinute: number;
  maxConcurrentRequests: number;
  timeoutMs: number;
  maxRuntimeMs: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

export interface CollectorExecutionContext<TConfig = Record<string, unknown>> {
  jobId?: string;
  sourceId?: string | null;
  sourceName: string;
  config?: TConfig;
  checkpoint?: Partial<IngestionCheckpoint> | null;
  quota?: Partial<SourceQuotaConfig>;
  retryPolicy?: Partial<RetryPolicyConfig>;
  backfillRange?: {
    startDate: Date;
    endDate: Date;
  } | null;
  inputPayload?: unknown;
  signal?: AbortSignal;
}

export interface CollectorDiscoveryItem<TRaw = unknown> {
  externalId?: string | null;
  cursor?: string | null;
  observedAt?: string;
  rawItem: TRaw;
}

export interface CollectorDiscoveryResult<TRaw = unknown> {
  items: CollectorDiscoveryItem<TRaw>[];
  nextCursor?: string | null;
  nextPageToken?: string | null;
  hasMore: boolean;
  totalDiscovered: number;
}

export interface CollectorFetchResult<TRaw = unknown> {
  records: TRaw[];
  fetchedCount: number;
  nextCursor?: string | null;
  nextPageToken?: string | null;
  checkpoint?: Partial<IngestionCheckpoint>;
}

export interface CollectorHealthCheckResult {
  healthy: boolean;
  status: SourceHealthStatus;
  configurationStatus: SourceConfigurationStatus;
  latencyMs: number;
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
}

export interface IngestionContractRecordV1 {
  contractVersion: IngestionContractVersion;
  sourceType: SourceType;
  sourceName: string;
  collectorVersion: string;
  externalId: string | null;
  fetchedAt: string;
  checksum: string;
  rawPayload: Record<string, unknown>;
  leadInput: RawLeadInput;
  metadata?: Record<string, unknown>;
}

export interface Collector<TConfig = Record<string, unknown>, TRaw = unknown> {
  readonly name: string;
  readonly collectorKey: string;
  readonly sourceType: SourceType;
  readonly version: string;
  readonly contractVersion: IngestionContractVersion;
  readonly capabilities: CollectorCapabilities;
  readonly metadata: CollectorMetadata;

  validateConfiguration(config?: TConfig): CollectorConfigValidationResult;
  discover(context: CollectorExecutionContext<TConfig>): Promise<CollectorDiscoveryResult<TRaw>>;
  fetch(
    context: CollectorExecutionContext<TConfig>,
    discovered?: CollectorDiscoveryItem<TRaw>[]
  ): Promise<CollectorFetchResult<TRaw>>;
  normalize(rawRecord: TRaw, context?: CollectorExecutionContext<TConfig>): IngestionContractRecordV1;
  healthCheck(config?: TConfig): Promise<CollectorHealthCheckResult>;
  collect(input?: unknown): Promise<RawLeadInput[]>;
}

export type RetentionCategory =
  | 'RAW_SOURCE_PAYLOAD'
  | 'NORMALIZED_SOURCE_RECORD'
  | 'INGESTION_METADATA'
  | 'DEAD_LETTER_RECORD'
  | 'AUDIT_LOG';

export interface RetentionPolicyConfig {
  RAW_SOURCE_PAYLOAD: number; // days
  NORMALIZED_SOURCE_RECORD: number; // days
  INGESTION_METADATA: number; // days
  DEAD_LETTER_RECORD: number; // days
  AUDIT_LOG: number; // days
}

export interface OperationalAlert {
  code:
    | 'REPEATED_COLLECTOR_FAILURES'
    | 'SOURCE_UNAVAILABLE'
    | 'HIGH_INVALID_RATE'
    | 'HIGH_DUPLICATE_RATE'
    | 'ZERO_RECORDS_FROM_ACTIVE_SOURCE'
    | 'EXCESSIVE_RUNTIME'
    | 'RETRY_EXHAUSTION'
    | 'DEAD_LETTER_SPIKE';
  severity: 'WARNING' | 'CRITICAL';
  sourceId?: string | null;
  sourceName: string;
  message: string;
  observedValue: number | string;
  thresholdValue: number | string;
  detectedAt: string;
}

export interface InventoryReplenishmentRule {
  id: string;
  category: string;
  city?: string | null;
  governorate?: string | null;
  requiredService?: string | null;
  minAvailableSaleableLeads: number;
  enabled: boolean;
}

export interface InventoryReplenishmentDecision {
  ruleId: string;
  category: string;
  city: string | null;
  governorate: string | null;
  requiredService: string | null;
  minRequired: number;
  currentAvailable: number;
  deficit: number;
  needsReplenishment: boolean;
  selectedSources: {
    sourceId: string;
    sourceName: string;
    sourceType: SourceType;
    priority: number;
    healthStatus: SourceHealthStatus;
    selectionReason: string;
  }[];
  triggeredJobIds: string[];
}

export interface PipelineImportReport {
  importJobId: string;
  status?: IngestionJobStatus;
  collectorVersion?: string;
  contractVersion?: string;
  discovered?: number;
  fetched?: number;
  normalized?: number;
  imported: number;
  valid: number;
  inserted?: number;
  updated?: number;
  duplicates: number;
  possibleDuplicates: number;
  conflicts: number;
  invalid: number;
  failed?: number;
  skipped?: number;
  saleable?: number;
  retries?: number;
  deadLetters?: number;
  durationMs?: number;
  checkpoint?: IngestionCheckpoint | null;
  errorCode?: IngestionErrorCode | null;
  errorSummary?: string | null;
  records: {
    rowNumber: number;
    businessName: string;
    externalId?: string | null;
    checksum?: string | null;
    lifecycleStage?: ImportRecordLifecycleStage;
    status:
      | 'VALID'
      | 'DUPLICATE'
      | 'POSSIBLE_DUPLICATE'
      | 'CONFLICT'
      | 'INVALID'
      | 'FAILED'
      | 'SKIPPED'
      | 'DEAD_LETTER';
    decision?: 'UNIQUE' | 'DUPLICATE_CONFIRMED' | 'POSSIBLE_DUPLICATE' | 'CONFLICT';
    leadId?: string;
    sourceRecordId?: string;
    duplicateCandidateId?: string;
    mergeId?: string;
    deadLetterId?: string;
    errorCode?: IngestionErrorCode;
    errors?: string[];
    matchReason?: string;
    signals?: unknown[];
    conflicts?: unknown[];
  }[];
}

export interface IngestionRunOptions {
  prisma: import('@prisma/client').PrismaClient;
  userId: string;
  sourceName: string;
  sourceType?: SourceType;
  sourceId?: string | null;
  fileName?: string | null;
  conflictPolicy?: ConflictResolutionPolicy;
  rawRecords?: RawLeadInput[];
  inputPayload?: unknown;
  triggerType?: 'MANUAL' | 'SCHEDULED' | 'REPLENISHMENT' | 'BACKFILL' | 'REPROCESS' | 'CSV_UPLOAD';
  batchSize?: number;
  maxRecords?: number;
  timeoutMs?: number;
  retryPolicy?: Partial<RetryPolicyConfig>;
  checkpoint?: Partial<IngestionCheckpoint> | null;
  resumeJobId?: string | null;
  idempotencyKey?: string | null;
  forceReprocess?: boolean;
  requireExternalId?: boolean;
  backfillRange?: {
    startDate: Date;
    endDate: Date;
  } | null;
  simulateCrashAfterCount?: number;
  recordFailureSimulator?: (rowNumber: number, raw: RawLeadInput) => Error | null;
  isMock?: boolean;
}
