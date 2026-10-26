import { Prisma, PrismaClient, SourceType } from '@prisma/client';
import { RawLeadInput, validateAndNormalizeLead } from '../validator';
import {
  buildInitialFieldProvenance,
  evaluateLeadDeduplication,
  generateCanonicalIdentityKeys,
  mergeSourceIntoCanonicalLead,
  withIdentityConcurrencyLock,
} from '../deduplication';
import { analyzeWebsiteUrl } from '../website-analyzer';
import {
  calculateLeadScore,
  loadScoringContext,
  logScoringOperation,
} from '../scoring-engine';
import {
  computeVerificationExpiryDate,
  evaluateLeadQuality,
  logVerificationEvent,
} from '../quality';
import { createAuditLog } from '../audit';
import {
  CircuitBreakerState,
  INGESTION_CONTRACT_V1,
  IngestionCheckpoint,
  IngestionContractRecordV1,
  IngestionError,
  IngestionErrorCode,
  IngestionJobStatus,
  IngestionRunOptions,
  PipelineImportReport,
  RetentionPolicyConfig,
} from './types';
import { collectorRegistry } from './registry';
import {
  calculateIngestionChecksum,
  validateCollectorContractRecord,
} from './contract';
import {
  acquireSourceJobLock,
  classifyIngestionError,
  clearJobCancellationState,
  evaluateCircuitBreakerBeforeRun,
  executeWithRetry,
  isJobCancelledInMemory,
  recordCircuitBreakerOutcome,
  releaseSourceJobLock,
  requestJobCancellationInMemory,
  SourceRateLimiter,
} from './resilience';
import {
  maskSourceConfigSecrets,
  sanitizeRawPayloadForStorage,
} from './security';
import { logIngestionEvent } from './logger';
import { notifyDevelopersOfNewLead } from '../lead-matching-notifier';

export const DEFAULT_RETENTION_POLICY: RetentionPolicyConfig = {
  RAW_SOURCE_PAYLOAD: 30,
  NORMALIZED_SOURCE_RECORD: 180,
  INGESTION_METADATA: 365,
  DEAD_LETTER_RECORD: 90,
  AUDIT_LOG: 730,
};

let activeRetentionPolicy: RetentionPolicyConfig = { ...DEFAULT_RETENTION_POLICY };

export function getRetentionPolicyConfig(): RetentionPolicyConfig {
  return { ...activeRetentionPolicy };
}

export function updateRetentionPolicyConfig(
  updates: Partial<RetentionPolicyConfig>
): RetentionPolicyConfig {
  activeRetentionPolicy = {
    ...activeRetentionPolicy,
    ...updates,
  };
  return getRetentionPolicyConfig();
}

function computeRetentionExpiryDate(days: number, now = new Date()): Date {
  return new Date(now.getTime() + Math.max(1, days) * 24 * 60 * 60 * 1000);
}

/**
 * Central Production-Grade Ingestion Pipeline & Orchestrator (Phase 8).
 * Integrates:
 * Collector -> Raw Ingestion -> Schema Validation -> Field Normalization ->
 * Canonical Identity -> Phase 2 Deduplication -> SourceRecord Provenance ->
 * Phase 3 Quality & Verification -> Phase 1 Opportunity Scoring ->
 * Phase 4 Matching Invalidation -> Phase 7 Analytics Metrics.
 */
export async function runIngestionPipeline(
  params: IngestionRunOptions
): Promise<PipelineImportReport> {
  const {
    prisma,
    userId,
    sourceName,
    sourceType,
    sourceId,
    fileName,
    conflictPolicy = 'SAFE_PHONE_PRIORITY',
    triggerType = 'MANUAL',
    batchSize: explicitBatchSize,
    maxRecords: explicitMaxRecords,
    timeoutMs: explicitTimeoutMs,
    retryPolicy: explicitRetryPolicy,
    checkpoint: initialCheckpointInput,
    resumeJobId,
    idempotencyKey,
    forceReprocess = false,
    requireExternalId: explicitRequireExternalId,
    backfillRange,
    simulateCrashAfterCount,
    recordFailureSimulator,
    isMock: explicitIsMock,
  } = params;

  const jobStartMs = Date.now();
  const now = new Date();

  // 1. Check idempotencyKey on ImportJob if provided (Section 55)
  if (idempotencyKey && !resumeJobId) {
    const existingJob = await prisma.importJob.findFirst({
      where: { idempotencyKey },
      include: { records: { orderBy: { rowNumber: 'asc' } } },
    });
    if (existingJob && (existingJob.status === 'COMPLETED' || existingJob.status === 'RUNNING')) {
      const summaryObj = (existingJob.summary as Record<string, unknown>) || {};
      return {
        importJobId: existingJob.id,
        status: existingJob.status as IngestionJobStatus,
        collectorVersion: existingJob.collectorVersion,
        contractVersion: existingJob.contractVersion,
        discovered: existingJob.discoveredCount,
        fetched: existingJob.fetchedCount,
        normalized: existingJob.normalizedCount,
        imported: existingJob.totalRows,
        valid: existingJob.validCount,
        inserted: existingJob.insertedCount,
        updated: existingJob.updatedCount,
        duplicates: existingJob.duplicateCount,
        possibleDuplicates: existingJob.possibleDuplicateCount,
        conflicts: existingJob.conflictCount,
        invalid: existingJob.invalidCount,
        failed: existingJob.failedCount,
        skipped: existingJob.skippedCount,
        saleable: existingJob.saleableCount,
        retries: existingJob.retryCount,
        deadLetters: existingJob.deadLetterCount,
        durationMs: existingJob.durationMs,
        checkpoint: (existingJob.checkpoint as unknown as IngestionCheckpoint) || null,
        records: existingJob.records.map((r) => ({
          rowNumber: r.rowNumber,
          businessName:
            ((r.rawData as Record<string, unknown>)?.businessName as string) ||
            ((r.rawData as Record<string, unknown>)?.name as string) ||
            `Row #${r.rowNumber}`,
          externalId: r.externalId,
          checksum: r.checksum,
          status: r.status as PipelineImportReport['records'][number]['status'],
          leadId: r.leadId || undefined,
          sourceRecordId: r.sourceRecordId || undefined,
          errors: r.errorMessage ? [r.errorMessage] : undefined,
        })),
        ...summaryObj,
      };
    }
  }

  // 2. Load LeadSource configuration if sourceId is provided
  const dbSource = sourceId
    ? await prisma.leadSource.findUnique({ where: { id: sourceId } })
    : await prisma.leadSource.findUnique({ where: { name: sourceName } }).catch(() => null);

  if (dbSource && (!dbSource.isActive || !dbSource.enabled) && triggerType !== 'MANUAL') {
    throw new IngestionError(
      `Source "${dbSource.name}" is administratively disabled.`,
      'POLICY_RESTRICTION',
      { statusCode: 403, retryable: false }
    );
  }

  // 3. Resolve Collector from Central CollectorRegistry (Section 7)
  const collectorLookupKey =
    sourceType || dbSource?.type || dbSource?.collectorKey || sourceName || 'MANUAL';
  const collector = collectorRegistry.get(collectorLookupKey);
  const collectorVersion = collector.version;
  const effectiveSourceType: SourceType = sourceType || dbSource?.type || collector.sourceType;
  const sourceConfigObj =
    dbSource?.config && typeof dbSource.config === 'object' && !Array.isArray(dbSource.config)
      ? (dbSource.config as Record<string, unknown>)
      : {};
  const requireExternalId =
    explicitRequireExternalId ??
    Boolean(sourceConfigObj.requireExternalId ?? collector.metadata.requireExternalId);

  // 4. Evaluate Circuit Breaker if dbSource exists (Section 20)
  if (dbSource) {
    const cbEval = evaluateCircuitBreakerBeforeRun(
      {
        state: (dbSource.circuitState as CircuitBreakerState) || 'CLOSED',
        consecutiveFailures: dbSource.consecutiveFailures ?? 0,
        circuitOpenedAt: dbSource.circuitOpenedAt ?? null,
      },
      {
        failureThreshold: Number(sourceConfigObj.circuitFailureThreshold) || 3,
        cooldownMs: Number(sourceConfigObj.circuitCooldownMs) || 60_000,
      },
      now
    );

    if (!cbEval.allowed) {
      logIngestionEvent({
        event: 'CIRCUIT_BREAKER_OPEN_BLOCKED',
        source: sourceName,
        sourceId: dbSource.id,
        collectorVersion,
        stage: 'CIRCUIT_BREAKER',
        status: 'FAILED',
        errorCode: 'CIRCUIT_OPEN',
        message: cbEval.reason,
      });
      throw new IngestionError(cbEval.reason || 'Source circuit breaker is OPEN', 'CIRCUIT_OPEN', {
        statusCode: 503,
        retryable: false,
      });
    }

    if (cbEval.nextState !== dbSource.circuitState) {
      await prisma.leadSource.update({
        where: { id: dbSource.id },
        data: { circuitState: cbEval.nextState },
      });
    }
  }

  // 5. Resolve Quotas, Timeouts, Batch Size & Retry Policy (Sections 17-19, 41, 58, 59, 82)
  const batchSize = Math.max(
    1,
    Math.min(500, explicitBatchSize ?? dbSource?.batchSize ?? 50)
  );
  const maxRecords = Math.max(
    1,
    explicitMaxRecords ?? dbSource?.maxRecordsPerRun ?? 10000
  );
  const timeoutMs = Math.max(
    500,
    explicitTimeoutMs ?? dbSource?.timeoutMs ?? 60_000
  );
  const retryPolicy = {
    maxRetries: explicitRetryPolicy?.maxRetries ?? dbSource?.maxRetries ?? 3,
    baseDelayMs: explicitRetryPolicy?.baseDelayMs ?? dbSource?.baseRetryDelayMs ?? 10,
    maxDelayMs: explicitRetryPolicy?.maxDelayMs ?? dbSource?.maxRetryDelayMs ?? 1000,
    jitterFactor: explicitRetryPolicy?.jitterFactor ?? 0,
  };

  // 6. Create or Resume ImportJob (Sections 12, 16, 43)
  let importJob = resumeJobId
    ? await prisma.importJob.findUnique({ where: { id: resumeJobId } })
    : null;

  const existingCheckpoint =
    (importJob?.checkpoint as unknown as IngestionCheckpoint | null) ||
    (initialCheckpointInput as IngestionCheckpoint | null) ||
    null;

  const resumeOffset = existingCheckpoint?.offset ?? 0;

  // Acquire job lock when running a job on a registered source (Sections 55, 56)
  const lockKey = dbSource ? `source:${dbSource.id}` : null;
  const tempLockOwner = resumeJobId || `pending-${Date.now()}-${Math.random()}`;
  if (lockKey) {
    const acquired = acquireSourceJobLock(lockKey, tempLockOwner);
    if (!acquired) {
      throw new IngestionError(
        `Another ingestion job is already RUNNING for source "${sourceName}".`,
        'JOB_LOCKED',
        { statusCode: 409, retryable: false }
      );
    }
  }

  try {
    // 7. Discover & Fetch Records if rawRecords not directly passed
    let rawRecordsToProcess: RawLeadInput[] = [];
    let discoveryRetryCount = 0;

    if (Array.isArray(params.rawRecords)) {
      rawRecordsToProcess = params.rawRecords;
    } else {
      const rateCheck = SourceRateLimiter.acquireSlot(dbSource?.id || sourceName, {
        requestsPerMinute: dbSource?.requestsPerMinute ?? 60,
        maxConcurrentRequests: dbSource?.maxConcurrentRequests ?? 2,
      });
      if (!rateCheck.allowed) {
        throw new IngestionError(
          rateCheck.reason || 'Source rate limit exceeded',
          'SOURCE_RATE_LIMITED',
          { statusCode: 429, retryable: true }
        );
      }

      try {
        const execCtx = {
          jobId: importJob?.id,
          sourceId: dbSource?.id || sourceId || null,
          sourceName,
          config: sourceConfigObj,
          checkpoint: { offset: 0 },
          quota: {
            maxRecordsPerRun: maxRecords,
            batchSize,
            requestsPerMinute: dbSource?.requestsPerMinute ?? 60,
            maxConcurrentRequests: dbSource?.maxConcurrentRequests ?? 2,
            timeoutMs,
            maxRuntimeMs: timeoutMs,
          },
          retryPolicy,
          backfillRange,
          inputPayload: params.inputPayload,
        };

        const fetchRetryOutcome = await executeWithRetry(
          async () => {
            const discovered = await collector.discover(execCtx);
            const fetched = await collector.fetch(execCtx, discovered.items);
            return fetched.records.map(
              (r) => collector.normalize(r, execCtx).leadInput
            );
          },
          {
            policy: retryPolicy,
            sourceName,
            collectorVersion,
            jobId: importJob?.id,
          }
        );

        rawRecordsToProcess = fetchRetryOutcome.result;
        discoveryRetryCount = fetchRetryOutcome.retryCount;
      } finally {
        SourceRateLimiter.releaseSlot(dbSource?.id || sourceName);
      }
    }

    // Apply maxRecordsPerRun quota cap (Section 59, 82)
    const boundedRecords = rawRecordsToProcess.slice(0, maxRecords);
    const totalDiscoveredCount = boundedRecords.length;

    const sanitizedConfigSnapshot = maskSourceConfigSecrets({
      collectorKey: collector.collectorKey,
      collectorVersion,
      contractVersion: INGESTION_CONTRACT_V1,
      batchSize,
      maxRecords,
      timeoutMs,
      retryPolicy,
      conflictPolicy,
      requireExternalId,
      backfillRange: backfillRange
        ? {
            startDate: backfillRange.startDate.toISOString(),
            endDate: backfillRange.endDate.toISOString(),
          }
        : null,
      sourceConfig: sourceConfigObj,
    });

    if (!importJob) {
      importJob = await prisma.importJob.create({
        data: {
          userId,
          sourceId: dbSource?.id || sourceId || null,
          sourceName,
          fileName: fileName || null,
          collectorVersion,
          contractVersion: INGESTION_CONTRACT_V1,
          triggerType,
          status: 'RUNNING',
          startedAt: now,
          totalRows: totalDiscoveredCount,
          discoveredCount: totalDiscoveredCount,
          fetchedCount: totalDiscoveredCount,
          retryCount: discoveryRetryCount,
          configurationSnapshot: sanitizedConfigSnapshot as Prisma.InputJsonValue,
          idempotencyKey: idempotencyKey || null,
          backfillStartDate: backfillRange?.startDate || null,
          backfillEndDate: backfillRange?.endDate || null,
          acquisitionCostEgp: dbSource?.acquisitionCostPerRunEgp ?? null,
        },
      });
    } else {
      importJob = await prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          status: 'RUNNING',
          cancelRequested: false,
          errorCode: null,
          errorSummary: null,
          totalRows: Math.max(importJob.totalRows, totalDiscoveredCount),
          discoveredCount: Math.max(importJob.discoveredCount, totalDiscoveredCount),
          fetchedCount: Math.max(importJob.fetchedCount, totalDiscoveredCount),
        },
      });
    }

    if (lockKey) {
      releaseSourceJobLock(lockKey, tempLockOwner);
      acquireSourceJobLock(lockKey, importJob.id);
    }

    if (dbSource) {
      await prisma.leadSource
        .update({
          where: { id: dbSource.id },
          data: { activeJobId: importJob.id },
        })
        .catch(() => null);
    }

    logIngestionEvent({
      event: resumeJobId ? 'INGESTION_JOB_RESUMED' : 'INGESTION_JOB_STARTED',
      jobId: importJob.id,
      source: sourceName,
      sourceId: dbSource?.id || sourceId,
      collectorVersion,
      stage: 'JOB_INIT',
      status: 'STARTED',
      message: `Processing ${totalDiscoveredCount} records starting from offset ${resumeOffset} (batchSize=${batchSize})`,
    });

    const scoringContext = await loadScoringContext(prisma);
    const scoringRules = scoringContext.rules;

    // Cumulative counters (initialized from existing job if resuming!)
    let normalizedCount = resumeJobId ? importJob.normalizedCount : 0;
    let validCount = resumeJobId ? importJob.validCount : 0;
    let insertedCount = resumeJobId ? importJob.insertedCount : 0;
    let updatedCount = resumeJobId ? importJob.updatedCount : 0;
    let duplicateCount = resumeJobId ? importJob.duplicateCount : 0;
    let possibleDuplicateCount = resumeJobId ? importJob.possibleDuplicateCount : 0;
    let conflictCount = resumeJobId ? importJob.conflictCount : 0;
    let invalidCount = resumeJobId ? importJob.invalidCount : 0;
    let failedCount = resumeJobId ? importJob.failedCount : 0;
    let skippedCount = resumeJobId ? importJob.skippedCount : 0;
    let saleableCount = resumeJobId ? importJob.saleableCount : 0;
    let retryCount = (resumeJobId ? importJob.retryCount : 0) + discoveryRetryCount;
    let deadLetterCount = resumeJobId ? importJob.deadLetterCount : 0;

    let currentCheckpoint: IngestionCheckpoint = existingCheckpoint || {
      cursor: String(resumeOffset),
      pageToken: null,
      offset: resumeOffset,
      lastProcessedExternalId: null,
      batchIndex: 0,
      processedCount: resumeOffset,
      updatedAt: now.toISOString(),
    };

    const reportRecords: PipelineImportReport['records'] = [];
    let wasCancelled = false;
    const rawRetentionDays =
      dbSource?.retentionDaysRaw ?? activeRetentionPolicy.RAW_SOURCE_PAYLOAD;
    const retentionExpiresAt = computeRetentionExpiryDate(rawRetentionDays, now);

    // 8. Process in Bounded Batches (Sections 41, 42)
    for (
      let batchStart = resumeOffset;
      batchStart < boundedRecords.length;
      batchStart += batchSize
    ) {
      // Cooperative Cancellation Check (Section 57)
      if (isJobCancelledInMemory(importJob.id)) {
        wasCancelled = true;
        break;
      }
      const freshJobState = await prisma.importJob
        .findUnique({
          where: { id: importJob.id },
          select: { cancelRequested: true },
        })
        .catch(() => null);
      if (freshJobState?.cancelRequested) {
        wasCancelled = true;
        break;
      }

      // Runtime Timeout Check (Section 58)
      if (Date.now() - jobStartMs > timeoutMs) {
        throw new IngestionError(
          `Ingestion job exceeded maximum runtime timeout of ${timeoutMs}ms`,
          'SOURCE_TIMEOUT',
          { statusCode: 504, retryable: true }
        );
      }

      const batchEnd = Math.min(boundedRecords.length, batchStart + batchSize);
      const batchIndex = Math.floor(batchStart / batchSize);

      for (let i = batchStart; i < batchEnd; i++) {
        // Check cooperative cancellation inside batch as well
        if (isJobCancelledInMemory(importJob.id)) {
          wasCancelled = true;
          break;
        }

        // Crash simulation hook for deterministic checkpoint testing (Section 72)
        if (
          typeof simulateCrashAfterCount === 'number' &&
          i - resumeOffset >= simulateCrashAfterCount
        ) {
          await prisma.importJob.update({
            where: { id: importJob.id },
            data: {
              status: 'FAILED',
              normalizedCount,
              validCount,
              insertedCount,
              updatedCount,
              duplicateCount,
              possibleDuplicateCount,
              conflictCount,
              invalidCount,
              failedCount,
              skippedCount,
              saleableCount,
              retryCount,
              deadLetterCount,
              errorCode: 'SOURCE_UNAVAILABLE',
              errorSummary: `Simulated crash after processing ${i} records`,
              checkpoint: currentCheckpoint as unknown as Prisma.InputJsonValue,
            },
          });
          throw new IngestionError(
            `Simulated crash after processing ${i} records`,
            'SOURCE_UNAVAILABLE',
            { retryable: true }
          );
        }

        const rowNumber = i + 1;
        const rawInputItem = boundedRecords[i];

        // Guard against null / primitive non-object items (Section 25)
        if (!rawInputItem || typeof rawInputItem !== 'object' || Array.isArray(rawInputItem)) {
          invalidCount += 1;
          await prisma.importRecord.create({
            data: {
              importJobId: importJob.id,
              rowNumber,
              sourceId: dbSource?.id || sourceId || null,
              sourceType: effectiveSourceType,
              collectorVersion,
              rawData: { invalidRawItem: String(rawInputItem) },
              status: 'INVALID',
              lifecycleStage: 'INVALID',
              errorCode: 'SCHEMA_VALIDATION_FAILED',
              errorMessage: 'Record must be a valid non-null object.',
              retentionExpiresAt,
            },
          });
          reportRecords.push({
            rowNumber,
            businessName: `صف #${rowNumber}`,
            lifecycleStage: 'INVALID',
            status: 'INVALID',
            errorCode: 'SCHEMA_VALIDATION_FAILED',
            errors: ['Record must be a valid non-null object.'],
          });
          currentCheckpoint = {
            ...currentCheckpoint,
            cursor: String(i + 1),
            offset: i + 1,
            batchIndex,
            processedCount: i + 1,
            updatedAt: new Date().toISOString(),
          };
          continue;
        }

        const raw: RawLeadInput = {
          ...rawInputItem,
          source: rawInputItem.source || sourceName,
          sourceType: rawInputItem.sourceType || effectiveSourceType,
        };

        const sanitizedRawPayload = sanitizeRawPayloadForStorage(raw);

        // Step A: Collector Contract Normalization & Schema Validation (Section 25)
        let contractRecord: IngestionContractRecordV1;
        try {
          contractRecord = collector.normalize(raw, {
            jobId: importJob.id,
            sourceId: dbSource?.id || sourceId || null,
            sourceName: raw.source || sourceName,
            config: sourceConfigObj,
          });
        } catch (normErr) {
          const classified = classifyIngestionError(normErr);
          invalidCount += 1;
          await prisma.importRecord.create({
            data: {
              importJobId: importJob.id,
              rowNumber,
              sourceId: dbSource?.id || sourceId || null,
              sourceType: effectiveSourceType,
              collectorVersion,
              rawData: sanitizedRawPayload as Prisma.InputJsonValue,
              status: 'INVALID',
              lifecycleStage: 'INVALID',
              errorCode: classified.code,
              errorMessage: classified.message,
              retentionExpiresAt,
            },
          });
          reportRecords.push({
            rowNumber,
            businessName: raw.businessName || raw.name || `صف #${rowNumber}`,
            lifecycleStage: 'INVALID',
            status: 'INVALID',
            errorCode: classified.code,
            errors: [classified.message],
          });
          currentCheckpoint = {
            ...currentCheckpoint,
            cursor: String(i + 1),
            offset: i + 1,
            batchIndex,
            processedCount: i + 1,
            updatedAt: new Date().toISOString(),
          };
          continue;
        }

        const contractCheck = validateCollectorContractRecord(contractRecord, {
          requireExternalId,
        });
        if (!contractCheck.valid) {
          invalidCount += 1;
          const errMsg = contractCheck.errors.join(' | ');
          await prisma.importRecord.create({
            data: {
              importJobId: importJob.id,
              rowNumber,
              sourceId: dbSource?.id || sourceId || null,
              sourceType: effectiveSourceType,
              externalId: contractRecord.externalId,
              collectorVersion,
              rawData: sanitizedRawPayload as Prisma.InputJsonValue,
              checksum: contractRecord.checksum,
              status: 'INVALID',
              lifecycleStage: 'INVALID',
              errorCode: 'SCHEMA_VALIDATION_FAILED',
              errorMessage: errMsg,
              retentionExpiresAt,
            },
          });
          reportRecords.push({
            rowNumber,
            businessName: raw.businessName || raw.name || `صف #${rowNumber}`,
            externalId: contractRecord.externalId,
            checksum: contractRecord.checksum,
            lifecycleStage: 'INVALID',
            status: 'INVALID',
            errorCode: 'SCHEMA_VALIDATION_FAILED',
            errors: contractCheck.errors,
          });
          currentCheckpoint = {
            ...currentCheckpoint,
            cursor: String(i + 1),
            offset: i + 1,
            lastProcessedExternalId: contractRecord.externalId,
            batchIndex,
            processedCount: i + 1,
            updatedAt: new Date().toISOString(),
          };
          continue;
        }

        // Step B: Phase 2 Field Validation & Normalization (Sections 23, 24)
        const validation = validateAndNormalizeLead(contractRecord.leadInput);

        if (!validation.valid || !validation.data) {
          invalidCount += 1;
          deadLetterCount += 1;
          const errJoined = validation.errors.join(' | ');
          const invalidImportRec = await prisma.importRecord.create({
            data: {
              importJobId: importJob.id,
              rowNumber,
              sourceId: dbSource?.id || sourceId || null,
              sourceType: effectiveSourceType,
              externalId: contractRecord.externalId,
              collectorVersion,
              rawData: sanitizedRawPayload as Prisma.InputJsonValue,
              checksum: contractRecord.checksum,
              status: 'INVALID',
              lifecycleStage: 'INVALID',
              errorCode: 'INVALID_SOURCE_RECORD',
              errorMessage: errJoined,
              retentionExpiresAt,
            },
          });
          const invalidDlq = await prisma.deadLetterRecord.create({
            data: {
              sourceId: dbSource?.id || sourceId || null,
              sourceName: contractRecord.sourceName || sourceName,
              sourceType: effectiveSourceType,
              externalId: contractRecord.externalId,
              importJobId: importJob.id,
              importRecordId: invalidImportRec.id,
              collectorVersion,
              failureReason: errJoined,
              errorCode: 'INVALID_SOURCE_RECORD',
              lastError: errJoined,
              retryCount: 0,
              maxRetries: retryPolicy.maxRetries,
              status: 'DEAD_LETTER',
              rawPayload: sanitizedRawPayload as Prisma.InputJsonValue,
              checksum: contractRecord.checksum,
              retentionExpiresAt: computeRetentionExpiryDate(
                activeRetentionPolicy.DEAD_LETTER_RECORD,
                now
              ),
            },
          });
          reportRecords.push({
            rowNumber,
            businessName: raw.businessName || raw.name || `صف #${rowNumber}`,
            externalId: contractRecord.externalId,
            checksum: contractRecord.checksum,
            lifecycleStage: 'INVALID',
            status: 'INVALID',
            deadLetterId: invalidDlq.id,
            errorCode: 'INVALID_SOURCE_RECORD',
            errors: validation.errors,
          });
          currentCheckpoint = {
            ...currentCheckpoint,
            cursor: String(i + 1),
            offset: i + 1,
            lastProcessedExternalId: contractRecord.externalId,
            batchIndex,
            processedCount: i + 1,
            updatedAt: new Date().toISOString(),
          };
          continue;
        }

        const normalized = validation.data;
        const recordChecksum = calculateIngestionChecksum(normalized);
        normalizedCount += 1;

        // Step C: Execute canonical record processing with controlled retry & Dead-Letter handling (Sections 17, 22, 73)
        let recordRetries = 0;
        try {
          const retryOutcome = await executeWithRetry(
            async (attempt) => {
              recordRetries = attempt - 1;
              if (recordFailureSimulator) {
                const simulatedErr = recordFailureSimulator(rowNumber, raw);
                if (simulatedErr) {
                  throw simulatedErr;
                }
              }

              // Website Checker (Rule-Based)
              const websiteAnalysis = await analyzeWebsiteUrl(normalized.website, {
                allowNetwork: false,
              });
              if (!normalized.website) {
                normalized.websiteStatus =
                  raw.websiteStatus === 'UNKNOWN' ? 'UNKNOWN' : 'NO_WEBSITE';
              } else if (
                raw.websiteStatus &&
                ['POOR_WEBSITE', 'HAS_WEBSITE', 'UNKNOWN'].includes(raw.websiteStatus)
              ) {
                normalized.websiteStatus = raw.websiteStatus;
              } else {
                normalized.websiteStatus = websiteAnalysis.recommendedWebsiteStatus;
              }

              const identityKeys = generateCanonicalIdentityKeys(normalized);

              // Concurrency Lock per Canonical Identity Keys (Section 28)
              return withIdentityConcurrencyLock(identityKeys.allKeys, async () => {
                const recordNow = new Date();

                // Check existing SourceRecord by (sourceName, externalId) for checksum idempotency (Sections 14, 15)
                const existingSourceRecord = normalized.externalId
                  ? await prisma.sourceRecord.findUnique({
                      where: {
                        sourceName_externalId: {
                          sourceName: normalized.source,
                          externalId: normalized.externalId,
                        },
                      },
                    })
                  : null;

                // 1. Run Phase 2 Deterministic Deduplication Engine
                const dedup = await evaluateLeadDeduplication(prisma, normalized, {
                  conflictPolicy,
                });

                // 2. Always persist/upsert a SourceRecord for provenance (Section 26)
                const sourceRecordData = {
                  sourceId: dbSource?.id || sourceId || null,
                  importJobId: importJob!.id,
                  sourceName: normalized.source,
                  sourceType: normalized.sourceType || effectiveSourceType || 'MANUAL',
                  externalId: normalized.externalId || null,
                  collectorVersion,
                  contractVersion: INGESTION_CONTRACT_V1,
                  checksum: recordChecksum,
                  rawData: sanitizedRawPayload as Prisma.InputJsonValue,
                  normalizedData: normalized as unknown as Prisma.InputJsonValue,
                  identityKeys: identityKeys.allKeys,
                  decision: dedup.decision,
                  matchedSignals: dedup.signals as unknown as Prisma.InputJsonValue,
                  status: 'ACTIVE' as const,
                  rawPayloadRetained: true,
                  retentionExpiresAt,
                  fetchedAt: recordNow,
                  lastVerifiedAt: recordNow,
                  firstSeenAt: recordNow,
                  lastSeenAt: recordNow,
                };

                const sourceRecord = normalized.externalId
                  ? await prisma.sourceRecord.upsert({
                      where: {
                        sourceName_externalId: {
                          sourceName: normalized.source,
                          externalId: normalized.externalId,
                        },
                      },
                      update: {
                        importJobId: importJob!.id,
                        collectorVersion,
                        contractVersion: INGESTION_CONTRACT_V1,
                        checksum: recordChecksum,
                        rawData: sanitizedRawPayload as Prisma.InputJsonValue,
                        normalizedData: normalized as unknown as Prisma.InputJsonValue,
                        identityKeys: identityKeys.allKeys,
                        decision: dedup.decision,
                        matchedSignals: dedup.signals as unknown as Prisma.InputJsonValue,
                        rawPayloadRetained: true,
                        retentionExpiresAt,
                        fetchedAt: recordNow,
                        lastSeenAt: recordNow,
                      },
                      create: sourceRecordData,
                    })
                  : await prisma.sourceRecord.create({
                      data: sourceRecordData,
                    });

                // Fast-path Checksum Idempotency: if exact same source record checksum & linked canonical lead exists
                if (
                  !forceReprocess &&
                  existingSourceRecord &&
                  existingSourceRecord.checksum === recordChecksum &&
                  existingSourceRecord.leadId &&
                  dedup.decision === 'DUPLICATE_CONFIRMED' &&
                  dedup.matchedLead &&
                  dedup.matchedLead.id === existingSourceRecord.leadId
                ) {
                  duplicateCount += 1;
                  skippedCount += 1;

                  await prisma.importRecord.create({
                    data: {
                      importJobId: importJob!.id,
                      rowNumber,
                      sourceId: dbSource?.id || sourceId || null,
                      sourceType: effectiveSourceType,
                      externalId: normalized.externalId,
                      collectorVersion,
                      rawData: sanitizedRawPayload as Prisma.InputJsonValue,
                      normalizedData: normalized as unknown as Prisma.InputJsonValue,
                      checksum: recordChecksum,
                      status: 'DUPLICATE',
                      lifecycleStage: 'DUPLICATE',
                      leadId: dedup.matchedLead.id,
                      sourceRecordId: sourceRecord.id,
                      errorMessage: `تطابق بصمة البيانات (Idempotent Checksum Match — ${dedup.matchReason})`,
                      retentionExpiresAt,
                    },
                  });

                  return {
                    rowNumber,
                    businessName: normalized.businessName,
                    externalId: normalized.externalId,
                    checksum: recordChecksum,
                    lifecycleStage: 'DUPLICATE' as const,
                    status: 'DUPLICATE' as const,
                    decision: 'DUPLICATE_CONFIRMED' as const,
                    leadId: dedup.matchedLead.id,
                    sourceRecordId: sourceRecord.id,
                    matchReason: dedup.matchReason,
                    signals: dedup.signals,
                    conflicts: [],
                  };
                }

                // Case A: DUPLICATE_CONFIRMED -> Merge into existing Canonical Lead (Section 27, 29)
                if (dedup.decision === 'DUPLICATE_CONFIRMED' && dedup.matchedLead) {
                  duplicateCount += 1;
                  if (dedup.hasConflicts) {
                    conflictCount += 1;
                  }

                  const mergeOutcome = await mergeSourceIntoCanonicalLead(
                    prisma,
                    dedup.matchedLead,
                    normalized,
                    {
                      sourceRecordId: sourceRecord.id,
                      reason: dedup.matchReason || 'DUPLICATE_CONFIRMED',
                      decision: 'DUPLICATE_CONFIRMED',
                      matchedSignals: dedup.signals,
                      performedBy: 'SYSTEM',
                      mergeType: 'AUTOMATIC',
                      conflictPolicy,
                      rules: scoringRules,
                      scoringVersion: scoringContext.scoringVersion,
                      thresholds: scoringContext.thresholds,
                    }
                  );

                  if (mergeOutcome.fieldChanges.enrichedFields.length > 0) {
                    updatedCount += 1;
                    // Phase 4 Matching Integration: mark existing match snapshots stale when lead is enriched
                    await prisma.matchSnapshot
                      .updateMany({
                        where: { leadId: mergeOutcome.lead.id },
                        data: { isStale: true },
                      })
                      .catch(() => null);
                  }

                  await prisma.importRecord.create({
                    data: {
                      importJobId: importJob!.id,
                      rowNumber,
                      sourceId: dbSource?.id || sourceId || null,
                      sourceType: effectiveSourceType,
                      externalId: normalized.externalId,
                      collectorVersion,
                      rawData: sanitizedRawPayload as Prisma.InputJsonValue,
                      normalizedData: normalized as unknown as Prisma.InputJsonValue,
                      checksum: recordChecksum,
                      status: 'DUPLICATE',
                      lifecycleStage: 'DUPLICATE',
                      leadId: mergeOutcome.lead.id,
                      sourceRecordId: sourceRecord.id,
                      errorMessage: `تم الدمج مع سجل موجود (${dedup.matchReason})`,
                      retentionExpiresAt,
                    },
                  });

                  return {
                    rowNumber,
                    businessName: normalized.businessName,
                    externalId: normalized.externalId,
                    checksum: recordChecksum,
                    lifecycleStage: 'DUPLICATE' as const,
                    status: 'DUPLICATE' as const,
                    decision: 'DUPLICATE_CONFIRMED' as const,
                    leadId: mergeOutcome.lead.id,
                    sourceRecordId: sourceRecord.id,
                    mergeId: mergeOutcome.mergeId,
                    matchReason: dedup.matchReason,
                    signals: dedup.signals,
                    conflicts: mergeOutcome.fieldChanges.conflictedFields,
                  };
                }

                // Case B: POSSIBLE_DUPLICATE or CONFLICT -> Flag for Admin Review (Do NOT auto-merge)
                if (
                  (dedup.decision === 'POSSIBLE_DUPLICATE' || dedup.decision === 'CONFLICT') &&
                  dedup.matchedLead
                ) {
                  if (dedup.decision === 'CONFLICT') {
                    conflictCount += 1;
                    await prisma.sourceRecord.update({
                      where: { id: sourceRecord.id },
                      data: { status: 'CONFLICT' },
                    });
                  } else {
                    possibleDuplicateCount += 1;
                  }

                  const candidate = await prisma.duplicateCandidate.create({
                    data: {
                      sourceRecordId: sourceRecord.id,
                      matchedLeadId: dedup.matchedLead.id,
                      decision: dedup.decision,
                      status: 'PENDING',
                      signals: dedup.signals as unknown as Prisma.InputJsonValue,
                      conflicts: dedup.conflicts as unknown as Prisma.InputJsonValue,
                      confidenceLevel: dedup.decision === 'CONFLICT' ? 'HIGH' : 'MEDIUM',
                    },
                  });

                  await prisma.importRecord.create({
                    data: {
                      importJobId: importJob!.id,
                      rowNumber,
                      sourceId: dbSource?.id || sourceId || null,
                      sourceType: effectiveSourceType,
                      externalId: normalized.externalId,
                      collectorVersion,
                      rawData: sanitizedRawPayload as Prisma.InputJsonValue,
                      normalizedData: normalized as unknown as Prisma.InputJsonValue,
                      checksum: recordChecksum,
                      status: dedup.decision === 'CONFLICT' ? 'CONFLICT' : 'POSSIBLE_DUPLICATE',
                      lifecycleStage: 'PROCESSED',
                      leadId: dedup.matchedLead.id,
                      sourceRecordId: sourceRecord.id,
                      errorCode: dedup.decision === 'CONFLICT' ? 'IDENTITY_CONFLICT' : undefined,
                      errorMessage:
                        dedup.decision === 'CONFLICT'
                          ? `تعارض في البيانات مع سجل موجود (${dedup.matchReason}) — بانتظار مراجعة الإدارة`
                          : `تشابه محتمل مع سجل موجود (${dedup.matchReason}) — بانتظار مراجعة الإدارة`,
                      retentionExpiresAt,
                    },
                  });

                  return {
                    rowNumber,
                    businessName: normalized.businessName,
                    externalId: normalized.externalId,
                    checksum: recordChecksum,
                    lifecycleStage: 'PROCESSED' as const,
                    status: (dedup.decision === 'CONFLICT'
                      ? 'CONFLICT'
                      : 'POSSIBLE_DUPLICATE') as 'CONFLICT' | 'POSSIBLE_DUPLICATE',
                    decision: dedup.decision,
                    leadId: dedup.matchedLead.id,
                    sourceRecordId: sourceRecord.id,
                    duplicateCandidateId: candidate.id,
                    matchReason: dedup.matchReason,
                    signals: dedup.signals,
                    conflicts: dedup.conflicts,
                  };
                }

                // Case C: UNIQUE -> Phase 1 Score + Phase 3 Quality/Verification + Canonical Lead Creation
                const scoreStartMs = Date.now();
                const scoreResult = calculateLeadScore(
                  {
                    isVerified: normalized.isVerified,
                    websiteStatus: normalized.websiteStatus,
                    website: normalized.website,
                    normalizedDomain: normalized.normalizedDomain,
                    websiteAnalysis: websiteAnalysis as unknown as Record<string, unknown>,
                    hasFacebook: normalized.hasFacebook,
                    facebook: normalized.facebook,
                    hasInstagram: normalized.hasInstagram,
                    instagram: normalized.instagram,
                    hasPhone: normalized.hasPhone,
                    phone: normalized.phone,
                    normalizedPhone: normalized.normalizedPhone,
                    hasEmail: normalized.hasEmail,
                    email: normalized.email,
                    normalizedEmail: normalized.normalizedEmail,
                    branchCount: normalized.branchCount,
                    reviewCount: normalized.reviewCount,
                    rating: normalized.rating,
                    isRecentlyActive: normalized.isRecentlyActive,
                    category: normalized.category,
                    city: normalized.city,
                    governorate: normalized.governorate,
                    area: normalized.area,
                    estimatedBudget: normalized.estimatedBudget,
                    source: normalized.source,
                    sourceList: [normalized.source],
                    lastVerifiedAt: recordNow,
                  },
                  scoringRules,
                  {
                    scoringVersion: scoringContext.scoringVersion,
                    thresholds: scoringContext.thresholds,
                    calculatedAt: recordNow,
                  }
                );

                const initialProvenance = buildInitialFieldProvenance(
                  normalized,
                  sourceRecord.id,
                  recordNow
                );

                const qualityEval = evaluateLeadQuality(
                  {
                    businessName: normalized.businessName,
                    normalizedName: normalized.normalizedName,
                    category: normalized.category,
                    governorate: normalized.governorate,
                    city: normalized.city,
                    area: normalized.area,
                    address: normalized.address,
                    normalizedAddress: normalized.normalizedAddress,
                    phone: normalized.phone,
                    normalizedPhone: normalized.normalizedPhone,
                    phones:
                      normalized.normalizedPhones.length > 0
                        ? normalized.normalizedPhones
                        : normalized.normalizedPhone
                          ? [normalized.normalizedPhone]
                          : [],
                    hasPhone: normalized.hasPhone,
                    email: normalized.email,
                    normalizedEmail: normalized.normalizedEmail,
                    hasEmail: normalized.hasEmail,
                    website: normalized.website,
                    normalizedDomain: normalized.normalizedDomain,
                    websiteStatus: normalized.websiteStatus,
                    websiteAnalysis: websiteAnalysis as unknown as Record<string, unknown>,
                    facebook: normalized.facebook,
                    normalizedFacebook: normalized.normalizedFacebook,
                    hasFacebook: normalized.hasFacebook,
                    instagram: normalized.instagram,
                    normalizedInstagram: normalized.normalizedInstagram,
                    hasInstagram: normalized.hasInstagram,
                    rating: normalized.rating,
                    reviewCount: normalized.reviewCount,
                    branchCount: normalized.branchCount,
                    score: scoreResult.normalizedScore,
                    isVerified: normalized.isVerified,
                    isCanonical: true,
                    source: normalized.source,
                    sourceList: [normalized.source],
                    lastVerifiedAt: recordNow,
                  },
                  { now: recordNow }
                );

                const isSaleable = qualityEval.saleabilityStatus === 'AVAILABLE';

                const createdLead = await prisma.$transaction(async (tx) => {
                  const lead = await tx.lead.create({
                    data: {
                      businessName: normalized.businessName,
                      normalizedName: normalized.normalizedName,
                      category: normalized.category,
                      governorate: normalized.governorate,
                      city: normalized.city,
                      area: normalized.area,
                      address: normalized.address,
                      normalizedAddress: normalized.normalizedAddress,
                      phone: normalized.phone,
                      normalizedPhone: normalized.normalizedPhone,
                      phones:
                        normalized.normalizedPhones.length > 0
                          ? normalized.normalizedPhones
                          : normalized.normalizedPhone
                            ? [normalized.normalizedPhone]
                            : [],
                      hasPhone: normalized.hasPhone,
                      email: normalized.email,
                      normalizedEmail: normalized.normalizedEmail,
                      hasEmail: normalized.hasEmail,
                      website: normalized.website,
                      normalizedDomain: normalized.normalizedDomain,
                      websiteStatus: normalized.websiteStatus,
                      facebook: normalized.facebook,
                      normalizedFacebook: normalized.normalizedFacebook,
                      hasFacebook: normalized.hasFacebook,
                      instagram: normalized.instagram,
                      normalizedInstagram: normalized.normalizedInstagram,
                      hasInstagram: normalized.hasInstagram,
                      rating: normalized.rating,
                      reviewCount: normalized.reviewCount,
                      branchCount: normalized.branchCount,
                      estimatedBudget: normalized.estimatedBudget,
                      isVerified: normalized.isVerified,
                      isRecentlyActive: normalized.isRecentlyActive,
                      score: scoreResult.normalizedScore,
                      temperature: scoreResult.temperature,
                      scoringVersion: scoreResult.scoringVersion,
                      scoreExplanation: scoreResult.explanation as unknown as Prisma.InputJsonValue,
                      lastScoredAt: recordNow,
                      status: qualityEval.saleabilityStatus,
                      confidence: scoreResult.confidence,
                      qualificationReasons: scoreResult.qualificationReasons,
                      qualificationRules:
                        scoreResult.qualificationRules as unknown as Prisma.InputJsonValue,
                      websiteAnalysis: websiteAnalysis as unknown as Prisma.InputJsonValue,
                      leadType: normalized.leadType,
                      accessType: normalized.leadType,
                      exclusive: normalized.exclusive,
                      creditCost:
                        normalized.creditCost ??
                        (normalized.hasPhone ? (normalized.exclusive ? 25 : 5) : 1),
                      creditCostReason:
                        normalized.creditCostReason ??
                        (normalized.hasPhone
                          ? (normalized.exclusive ? 'EXCLUSIVE_LEAD' : 'SHARED_LEAD')
                          : 'FIELD_VISIT_DISCOUNT'),
                      maxPurchasers: normalized.maxPurchasers,
                      currentPurchasers: 0,
                      availableForClaim: isSaleable,
                      source: normalized.source,
                      sourceList: [normalized.source],
                      sourceId: dbSource?.id || sourceId || null,
                      canonicalIdentityKeys: identityKeys.allKeys,
                      fieldProvenance: initialProvenance as unknown as Prisma.InputJsonValue,
                      fieldConflicts: [],
                      isCanonical: true,
                      qualityScore: qualityEval.qualityScore,
                      qualityStatus: qualityEval.qualityStatus,
                      freshnessStatus: qualityEval.freshness.freshnessStatus,
                      verificationStatus: qualityEval.verificationStatus,
                      saleabilityStatus: qualityEval.saleabilityStatus,
                      completenessScore: qualityEval.completeness.completenessScore,
                      completenessBreakdown:
                        qualityEval.completeness as unknown as Prisma.InputJsonValue,
                      qualityFlags: qualityEval.qualityFlags,
                      qualitySummary: qualityEval.summary as unknown as Prisma.InputJsonValue,
                      businessStatus: qualityEval.businessStatus,
                      phoneValidationStatus: qualityEval.phoneValidationStatus,
                      emailValidationStatus: qualityEval.emailValidationStatus,
                      websiteVerificationState: qualityEval.websiteVerificationState,
                      lastVerifiedAt: recordNow,
                      nextVerificationAt: qualityEval.nextVerificationAt,
                      isMock: Boolean(explicitIsMock ?? normalized.isMock ?? false),
                    },
                  });

                  await tx.sourceRecord.update({
                    where: { id: sourceRecord.id },
                    data: {
                      leadId: lead.id,
                      status: 'ACTIVE',
                    },
                  });

                  for (const keyRec of identityKeys.records) {
                    await tx.leadIdentity
                      .create({
                        data: {
                          leadId: lead.id,
                          keyType: keyRec.keyType,
                          keyValue: keyRec.keyValue,
                          canonicalKey: keyRec.canonicalKey,
                          source: normalized.source,
                          sourceRecordId: sourceRecord.id,
                          isPrimary: keyRec.isPrimary,
                        },
                      })
                      .catch(() => null);
                  }

                  await tx.leadScore.create({
                    data: {
                      leadId: lead.id,
                      previousScore: null,
                      rawScore: scoreResult.rawScore,
                      normalizedScore: scoreResult.normalizedScore,
                      newScore: scoreResult.normalizedScore,
                      previousClassification: null,
                      temperature: scoreResult.temperature,
                      newClassification: scoreResult.classification,
                      scoringVersion: scoreResult.scoringVersion,
                      trigger: 'LEAD_CREATED',
                      appliedRules: scoreResult.appliedRules as unknown as Prisma.InputJsonValue,
                      evaluatedRules:
                        scoreResult.evaluatedRules as unknown as Prisma.InputJsonValue,
                      explanation: scoreResult.explanation as unknown as Prisma.InputJsonValue,
                      qualificationReasons: scoreResult.qualificationReasons,
                      calculatedAt: recordNow,
                      evaluatedAt: recordNow,
                    },
                  });

                  await tx.leadVerification.createMany({
                    data: [
                      {
                        leadId: lead.id,
                        verificationType: 'PHONE',
                        status:
                          qualityEval.phoneValidationStatus === 'VALID'
                            ? 'VERIFIED'
                            : qualityEval.phoneValidationStatus === 'INVALID'
                              ? 'FAILED'
                              : 'UNKNOWN',
                        previousStatus: 'UNKNOWN',
                        checkedAt: recordNow,
                        expiresAt: computeVerificationExpiryDate('PHONE', recordNow),
                        source: 'INGESTION_PIPELINE',
                        resultSummary: `Phone validation: ${qualityEval.phoneValidationStatus}`,
                        evidence: {
                          phoneValidationStatus: qualityEval.phoneValidationStatus,
                          phone: normalized.phone,
                          normalizedPhone: normalized.normalizedPhone,
                        } as unknown as Prisma.InputJsonValue,
                      },
                      {
                        leadId: lead.id,
                        verificationType: 'WEBSITE',
                        status:
                          qualityEval.websiteVerificationState === 'WEBSITE_UNREACHABLE' ||
                          qualityEval.websiteVerificationState === 'DOMAIN_INVALID'
                            ? 'FAILED'
                            : 'VERIFIED',
                        previousStatus: 'UNKNOWN',
                        checkedAt: recordNow,
                        expiresAt: computeVerificationExpiryDate('WEBSITE', recordNow),
                        source: 'INGESTION_PIPELINE',
                        resultSummary: `Website verification: ${qualityEval.websiteVerificationState}`,
                        evidence: {
                          websiteVerificationState: qualityEval.websiteVerificationState,
                          website: normalized.website,
                          normalizedDomain: normalized.normalizedDomain,
                        } as unknown as Prisma.InputJsonValue,
                      },
                      {
                        leadId: lead.id,
                        verificationType: 'ADDRESS',
                        status:
                          Boolean(normalized.governorate) &&
                          Boolean(normalized.city) &&
                          !qualityEval.qualityFlags.includes('LOCATION_MISMATCH')
                            ? 'VERIFIED'
                            : 'FAILED',
                        previousStatus: 'UNKNOWN',
                        checkedAt: recordNow,
                        expiresAt: computeVerificationExpiryDate('ADDRESS', recordNow),
                        source: 'INGESTION_PIPELINE',
                        resultSummary: `Address/location check for ${normalized.governorate} - ${normalized.city}`,
                        evidence: {
                          governorate: normalized.governorate,
                          city: normalized.city,
                          address: normalized.address,
                        } as unknown as Prisma.InputJsonValue,
                      },
                      {
                        leadId: lead.id,
                        verificationType: 'IDENTITY',
                        status:
                          Boolean(normalized.businessName) &&
                          !qualityEval.qualityFlags.includes('CATEGORY_MISMATCH')
                            ? 'VERIFIED'
                            : 'FAILED',
                        previousStatus: 'UNKNOWN',
                        checkedAt: recordNow,
                        expiresAt: computeVerificationExpiryDate('IDENTITY', recordNow),
                        source: 'INGESTION_PIPELINE',
                        resultSummary: `Identity/category check for ${normalized.businessName} (${normalized.category})`,
                        evidence: {
                          businessName: normalized.businessName,
                          category: normalized.category,
                        } as unknown as Prisma.InputJsonValue,
                      },
                      {
                        leadId: lead.id,
                        verificationType: 'BUSINESS_STATUS',
                        status:
                          qualityEval.businessStatus === 'OPEN'
                            ? 'VERIFIED'
                            : qualityEval.businessStatus === 'CLOSED'
                              ? 'FAILED'
                              : 'NEEDS_REVERIFICATION',
                        previousStatus: 'UNKNOWN',
                        checkedAt: recordNow,
                        expiresAt: computeVerificationExpiryDate('BUSINESS_STATUS', recordNow),
                        source: 'INGESTION_PIPELINE',
                        resultSummary: `Business operational status: ${qualityEval.businessStatus}`,
                        evidence: {
                          businessStatus: qualityEval.businessStatus,
                        } as unknown as Prisma.InputJsonValue,
                      },
                      {
                        leadId: lead.id,
                        verificationType: 'FULL',
                        status:
                          qualityEval.verificationStatus === 'VERIFIED' ||
                          qualityEval.verificationStatus === 'PARTIALLY_VERIFIED'
                            ? 'VERIFIED'
                            : qualityEval.verificationStatus === 'FAILED_VERIFICATION'
                              ? 'FAILED'
                              : 'NEEDS_REVERIFICATION',
                        previousStatus: 'UNKNOWN',
                        checkedAt: recordNow,
                        expiresAt: computeVerificationExpiryDate('FULL', recordNow),
                        source: 'INGESTION_PIPELINE',
                        resultSummary: `Initial quality evaluation: ${qualityEval.qualityStatus} (${qualityEval.qualityScore}/100)`,
                        evidence: {
                          qualityScore: qualityEval.qualityScore,
                          qualityStatus: qualityEval.qualityStatus,
                          completenessScore: qualityEval.completeness.completenessScore,
                          freshnessStatus: qualityEval.freshness.freshnessStatus,
                          saleabilityStatus: qualityEval.saleabilityStatus,
                          qualityFlags: qualityEval.qualityFlags,
                        } as unknown as Prisma.InputJsonValue,
                      },
                    ],
                  });

                  return lead;
                });

                logScoringOperation({
                  event: 'LEAD_SCORE_EVALUATED',
                  leadId: createdLead.id,
                  scoringVersion: scoreResult.scoringVersion,
                  previousScore: null,
                  newScore: scoreResult.normalizedScore,
                  previousClassification: null,
                  classification: scoreResult.classification,
                  trigger: 'LEAD_CREATED',
                  durationMs: Date.now() - scoreStartMs,
                  rulesApplied: scoreResult.appliedRules.map((r) => r.ruleKey),
                });

                logVerificationEvent({
                  leadId: createdLead.id,
                  verificationType: 'FULL',
                  source: 'INGESTION_PIPELINE',
                  previousStatus: 'UNKNOWN',
                  newStatus: qualityEval.verificationStatus,
                  durationMs: Date.now() - scoreStartMs,
                  result: qualityEval.qualityStatus,
                  qualityScore: qualityEval.qualityScore,
                  saleabilityStatus: qualityEval.saleabilityStatus,
                });

                validCount += 1;
                insertedCount += 1;
                if (isSaleable) {
                  saleableCount += 1;
                  notifyDevelopersOfNewLead(createdLead).catch((err) => {
                    console.error('[notifyDevelopersOfNewLead Error]:', err);
                  });
                }

                await prisma.importRecord.create({
                  data: {
                    importJobId: importJob!.id,
                    rowNumber,
                    sourceId: dbSource?.id || sourceId || null,
                    sourceType: effectiveSourceType,
                    externalId: normalized.externalId,
                    collectorVersion,
                    rawData: sanitizedRawPayload as Prisma.InputJsonValue,
                    normalizedData: normalized as unknown as Prisma.InputJsonValue,
                    checksum: recordChecksum,
                    status: 'VALID',
                    lifecycleStage: 'PROCESSED',
                    leadId: createdLead.id,
                    sourceRecordId: sourceRecord.id,
                    retentionExpiresAt,
                  },
                });

                return {
                  rowNumber,
                  businessName: createdLead.businessName,
                  externalId: normalized.externalId,
                  checksum: recordChecksum,
                  lifecycleStage: 'PROCESSED' as const,
                  status: 'VALID' as const,
                  decision: 'UNIQUE' as const,
                  leadId: createdLead.id,
                  sourceRecordId: sourceRecord.id,
                };
              });
            },
            {
              policy: retryPolicy,
              sourceName,
              collectorVersion,
              jobId: importJob.id,
              externalId: normalized.externalId,
            }
          );

          retryCount += retryOutcome.retryCount;
          reportRecords.push(retryOutcome.result);
        } catch (recErr) {
          // Record exhausted retries or failed -> send to Dead-Letter Queue (Section 22, 73)
          const classified = classifyIngestionError(recErr);
          const attemptsUsed =
            (classified.details?.attempts as number | undefined) ?? recordRetries + 1;
          retryCount += Math.max(0, attemptsUsed - 1);
          failedCount += 1;
          deadLetterCount += 1;

          const importRec = await prisma.importRecord.create({
            data: {
              importJobId: importJob.id,
              rowNumber,
              sourceId: dbSource?.id || sourceId || null,
              sourceType: effectiveSourceType,
              externalId: normalized.externalId,
              collectorVersion,
              rawData: sanitizedRawPayload as Prisma.InputJsonValue,
              normalizedData: normalized as unknown as Prisma.InputJsonValue,
              checksum: recordChecksum,
              status: 'DEAD_LETTER',
              lifecycleStage: 'DEAD_LETTER',
              errorCode: classified.code,
              errorMessage: classified.message,
              retryCount: Math.max(1, attemptsUsed - 1),
              retentionExpiresAt,
            },
          });

          const dlq = await prisma.deadLetterRecord.create({
            data: {
              sourceId: dbSource?.id || sourceId || null,
              sourceName: normalized.source,
              sourceType: effectiveSourceType,
              externalId: normalized.externalId,
              importJobId: importJob.id,
              importRecordId: importRec.id,
              collectorVersion,
              failureReason: classified.message,
              errorCode: classified.code,
              lastError: classified.message,
              retryCount: Math.max(1, attemptsUsed - 1),
              maxRetries: retryPolicy.maxRetries,
              status: 'DEAD_LETTER',
              rawPayload: sanitizedRawPayload as Prisma.InputJsonValue,
              normalizedPayload: normalized as unknown as Prisma.InputJsonValue,
              checksum: recordChecksum,
              retentionExpiresAt: computeRetentionExpiryDate(
                activeRetentionPolicy.DEAD_LETTER_RECORD,
                now
              ),
            },
          });

          logIngestionEvent({
            event: 'RECORD_MOVED_TO_DEAD_LETTER',
            jobId: importJob.id,
            source: sourceName,
            sourceId: dbSource?.id || sourceId,
            collectorVersion,
            externalId: normalized.externalId,
            stage: 'DEAD_LETTER',
            status: 'FAILED',
            errorCode: classified.code,
            message: classified.message,
            metadata: { deadLetterId: dlq.id, rowNumber },
          });

          reportRecords.push({
            rowNumber,
            businessName: normalized.businessName,
            externalId: normalized.externalId,
            checksum: recordChecksum,
            lifecycleStage: 'DEAD_LETTER',
            status: 'DEAD_LETTER',
            deadLetterId: dlq.id,
            errorCode: classified.code,
            errors: [classified.message],
          });
        }

        currentCheckpoint = {
          cursor: String(i + 1),
          pageToken: null,
          offset: i + 1,
          lastProcessedExternalId: normalized.externalId || currentCheckpoint.lastProcessedExternalId || null,
          batchIndex,
          processedCount: i + 1,
          updatedAt: new Date().toISOString(),
        };
      }

      // Persist batch progress & checkpoint at batch boundary (Sections 16, 41, 42)
      await prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          normalizedCount,
          validCount,
          insertedCount,
          updatedCount,
          duplicateCount,
          possibleDuplicateCount,
          conflictCount,
          invalidCount,
          failedCount,
          skippedCount,
          saleableCount,
          retryCount,
          deadLetterCount,
          checkpoint: currentCheckpoint as unknown as Prisma.InputJsonValue,
        },
      });

      if (wasCancelled) {
        break;
      }
    }

    const completedAt = new Date();
    const durationMs = Math.max(1, completedAt.getTime() - jobStartMs);

    const finalStatus: IngestionJobStatus = wasCancelled
      ? 'CANCELLED'
      : failedCount > 0 && validCount + duplicateCount + possibleDuplicateCount === 0
        ? 'FAILED'
        : failedCount > 0
          ? 'PARTIALLY_COMPLETED'
          : 'COMPLETED';

    const summaryData = {
      status: finalStatus,
      collectorVersion,
      contractVersion: INGESTION_CONTRACT_V1,
      discovered: totalDiscoveredCount,
      fetched: totalDiscoveredCount,
      normalized: normalizedCount,
      imported: totalDiscoveredCount,
      valid: validCount,
      inserted: insertedCount,
      updated: updatedCount,
      duplicates: duplicateCount,
      possibleDuplicates: possibleDuplicateCount,
      conflicts: conflictCount,
      invalid: invalidCount,
      failed: failedCount,
      skipped: skippedCount,
      saleable: saleableCount,
      retries: retryCount,
      deadLetters: deadLetterCount,
      durationMs,
    };

    await prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status: finalStatus,
        completedAt,
        cancelledAt: wasCancelled ? completedAt : null,
        durationMs,
        normalizedCount,
        validCount,
        insertedCount,
        updatedCount,
        duplicateCount,
        possibleDuplicateCount,
        conflictCount,
        invalidCount,
        failedCount,
        skippedCount,
        saleableCount,
        retryCount,
        deadLetterCount,
        checkpoint: currentCheckpoint as unknown as Prisma.InputJsonValue,
        summary: summaryData as unknown as Prisma.InputJsonValue,
      },
    });

    // Update LeadSource health, circuit breaker & counters (Sections 35, 36, 38)
    const targetSourceId = dbSource?.id || sourceId || null;
    if (targetSourceId) {
      const latestSource = await prisma.leadSource
        .findUnique({ where: { id: targetSourceId } })
        .catch(() => null);
      if (latestSource) {
        const jobSucceeded = finalStatus === 'COMPLETED' || finalStatus === 'PARTIALLY_COMPLETED';
        const cbAfter = recordCircuitBreakerOutcome(
          {
            state: (latestSource.circuitState as CircuitBreakerState) || 'CLOSED',
            consecutiveFailures: latestSource.consecutiveFailures ?? 0,
            circuitOpenedAt: latestSource.circuitOpenedAt ?? null,
          },
          jobSucceeded,
          {
            failureThreshold: Number(sourceConfigObj.circuitFailureThreshold) || 3,
            cooldownMs: Number(sourceConfigObj.circuitCooldownMs) || 60_000,
          },
          completedAt
        );

        const prevSuccesses = latestSource.totalSuccessCount ?? 0;
        const prevAvgMs = latestSource.averageDurationMs ?? 0;
        const nextAvgMs = jobSucceeded
          ? Math.round((prevAvgMs * prevSuccesses + durationMs) / (prevSuccesses + 1))
          : prevAvgMs;

        const invalidRate =
          totalDiscoveredCount > 0 ? (invalidCount + failedCount) / totalDiscoveredCount : 0;
        const nextHealthStatus = !latestSource.isActive || !latestSource.enabled
          ? 'DISABLED'
          : cbAfter.state === 'OPEN' || cbAfter.consecutiveFailures >= 3
            ? 'FAILING'
            : cbAfter.state === 'HALF_OPEN' ||
                cbAfter.consecutiveFailures >= 1 ||
                finalStatus === 'PARTIALLY_COMPLETED' ||
                (totalDiscoveredCount >= 5 && invalidRate > 0.25)
              ? 'DEGRADED'
              : 'HEALTHY';

        const nextScheduledRun = latestSource.scheduleIntervalMinutes
          ? new Date(completedAt.getTime() + latestSource.scheduleIntervalMinutes * 60_000)
          : latestSource.nextRunAt;

        await prisma.leadSource.update({
          where: { id: targetSourceId },
          data: {
            collectorKey: collector.collectorKey,
            collectorVersion,
            contractVersion: INGESTION_CONTRACT_V1,
            lastSyncAt: completedAt,
            lastSeenAt: completedAt,
            ...(jobSucceeded
              ? {
                  lastSuccessAt: completedAt,
                  lastVerifiedAt: completedAt,
                  totalSuccessCount: { increment: 1 },
                }
              : {
                  lastFailureAt: completedAt,
                  totalFailureCount: { increment: 1 },
                }),
            averageDurationMs: nextAvgMs,
            recordsCount: { increment: insertedCount },
            circuitState: cbAfter.state,
            consecutiveFailures: cbAfter.consecutiveFailures,
            circuitOpenedAt: cbAfter.circuitOpenedAt,
            healthStatus: nextHealthStatus,
            nextRunAt: nextScheduledRun,
            activeJobId: null,
          },
        });
      }
    }

    logIngestionEvent({
      event: 'INGESTION_JOB_COMPLETED',
      jobId: importJob.id,
      source: sourceName,
      sourceId: targetSourceId,
      collectorVersion,
      stage: 'JOB_FINALIZE',
      status: wasCancelled ? 'CANCELLED' : finalStatus === 'FAILED' ? 'FAILED' : 'SUCCESS',
      durationMs,
      metadata: summaryData,
    });

    return {
      importJobId: importJob.id,
      status: finalStatus,
      collectorVersion,
      contractVersion: INGESTION_CONTRACT_V1,
      discovered: totalDiscoveredCount,
      fetched: totalDiscoveredCount,
      normalized: normalizedCount,
      imported: totalDiscoveredCount,
      valid: validCount,
      inserted: insertedCount,
      updated: updatedCount,
      duplicates: duplicateCount,
      possibleDuplicates: possibleDuplicateCount,
      conflicts: conflictCount,
      invalid: invalidCount,
      failed: failedCount,
      skipped: skippedCount,
      saleable: saleableCount,
      retries: retryCount,
      deadLetters: deadLetterCount,
      durationMs,
      checkpoint: currentCheckpoint,
      records: reportRecords,
    };
  } catch (err) {
    const classified = classifyIngestionError(err);
    const failedAt = new Date();
    const durationMs = Math.max(1, failedAt.getTime() - jobStartMs);

    if (importJob) {
      await prisma.importJob
        .update({
          where: { id: importJob.id },
          data: {
            status: 'FAILED',
            completedAt: failedAt,
            durationMs,
            errorCode: classified.code,
            errorSummary: classified.message,
          },
        })
        .catch(() => null);
    }

    const targetSourceId = dbSource?.id || sourceId || null;
    if (targetSourceId) {
      const latestSource = await prisma.leadSource
        .findUnique({ where: { id: targetSourceId } })
        .catch(() => null);
      if (latestSource) {
        const cbAfter = recordCircuitBreakerOutcome(
          {
            state: (latestSource.circuitState as CircuitBreakerState) || 'CLOSED',
            consecutiveFailures: latestSource.consecutiveFailures ?? 0,
            circuitOpenedAt: latestSource.circuitOpenedAt ?? null,
          },
          false,
          {
            failureThreshold: Number(sourceConfigObj.circuitFailureThreshold) || 3,
            cooldownMs: Number(sourceConfigObj.circuitCooldownMs) || 60_000,
          },
          failedAt
        );

        await prisma.leadSource
          .update({
            where: { id: targetSourceId },
            data: {
              lastFailureAt: failedAt,
              totalFailureCount: { increment: 1 },
              circuitState: cbAfter.state,
              consecutiveFailures: cbAfter.consecutiveFailures,
              circuitOpenedAt: cbAfter.circuitOpenedAt,
              healthStatus:
                cbAfter.state === 'OPEN' || cbAfter.consecutiveFailures >= 3
                  ? 'FAILING'
                  : 'DEGRADED',
              activeJobId: null,
            },
          })
          .catch(() => null);
      }
    }

    logIngestionEvent({
      event: 'INGESTION_JOB_FAILED',
      jobId: importJob?.id,
      source: sourceName,
      sourceId: targetSourceId,
      collectorVersion,
      stage: 'JOB_FINALIZE',
      status: 'FAILED',
      durationMs,
      errorCode: classified.code,
      message: classified.message,
    });

    throw classified;
  } finally {
    if (lockKey) {
      releaseSourceJobLock(lockKey, tempLockOwner);
      if (importJob?.id) {
        releaseSourceJobLock(lockKey, importJob.id);
      }
    }
    if (importJob?.id) {
      clearJobCancellationState(importJob.id);
    }
  }
}

/**
 * Cooperatively cancels a running or pending ingestion job (Section 57).
 */
export async function cancelIngestionJob(params: {
  prisma: PrismaClient;
  jobId: string;
  adminUserId: string;
  reason?: string;
}) {
  const { prisma, jobId, adminUserId, reason } = params;
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new IngestionError('Ingestion job not found', 'INVALID_SOURCE_RECORD', {
      statusCode: 404,
      retryable: false,
    });
  }

  requestJobCancellationInMemory(jobId);

  const now = new Date();
  const isAlreadyTerminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status);

  const updated = await prisma.importJob.update({
    where: { id: jobId },
    data: {
      cancelRequested: true,
      cancelledBy: adminUserId,
      ...(isAlreadyTerminal
        ? {}
        : {
            status: 'CANCELLED',
            cancelledAt: now,
            completedAt: now,
            errorCode: 'JOB_CANCELLED',
            errorSummary: reason || 'Cancelled by administrator',
          }),
    },
  });

  await createAuditLog(
    {
      userId: adminUserId,
      action: 'ADMIN_INGESTION_JOB_CANCELLED',
      entityType: 'ImportJob',
      entityId: jobId,
      details: {
        sourceName: job.sourceName,
        previousStatus: job.status,
        newStatus: updated.status,
        reason: reason || 'Cancelled by administrator',
      },
    },
    prisma
  );

  return updated;
}

/**
 * Resumes an interrupted or crashed ImportJob from its saved checkpoint (Section 43, 72).
 */
export async function resumeIngestionJob(params: {
  prisma: PrismaClient;
  jobId: string;
  userId: string;
  rawRecords?: RawLeadInput[];
  inputPayload?: unknown;
}): Promise<PipelineImportReport> {
  const { prisma, jobId, userId, rawRecords, inputPayload } = params;
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new IngestionError('ImportJob to resume was not found', 'INVALID_SOURCE_RECORD', {
      statusCode: 404,
      retryable: false,
    });
  }

  return runIngestionPipeline({
    prisma,
    userId,
    sourceName: job.sourceName,
    sourceId: job.sourceId,
    fileName: job.fileName,
    resumeJobId: job.id,
    checkpoint: (job.checkpoint as unknown as IngestionCheckpoint) || null,
    rawRecords,
    inputPayload,
    triggerType: 'MANUAL',
  });
}

/**
 * Failure Isolation Orchestrator: executes multiple collectors independently so that a failure
 * in one collector NEVER stops other collectors (Section 21).
 */
export async function runMultipleSourcesIsolated(params: {
  prisma: PrismaClient;
  userId: string;
  runs: Array<{
    sourceName: string;
    sourceType?: SourceType;
    sourceId?: string | null;
    rawRecords?: RawLeadInput[];
    inputPayload?: unknown;
    recordFailureSimulator?: (rowNumber: number, raw: RawLeadInput) => Error | null;
  }>;
}): Promise<{
  totalSources: number;
  succeededCount: number;
  failedCount: number;
  results: Array<{
    sourceName: string;
    status: 'SUCCEEDED' | 'FAILED';
    report?: PipelineImportReport;
    errorCode?: IngestionErrorCode;
    errorMessage?: string;
  }>;
}> {
  const { prisma, userId, runs } = params;

  const settled = await Promise.allSettled(
    runs.map(async (runSpec) => {
      const report = await runIngestionPipeline({
        prisma,
        userId,
        sourceName: runSpec.sourceName,
        sourceType: runSpec.sourceType,
        sourceId: runSpec.sourceId,
        rawRecords: runSpec.rawRecords,
        inputPayload: runSpec.inputPayload,
        recordFailureSimulator: runSpec.recordFailureSimulator,
        triggerType: 'SCHEDULED',
      });
      return { sourceName: runSpec.sourceName, report };
    })
  );

  let succeededCount = 0;
  let failedCount = 0;
  const results = settled.map((item, idx) => {
    const sourceName = runs[idx].sourceName;
    if (item.status === 'fulfilled') {
      succeededCount += 1;
      return {
        sourceName,
        status: 'SUCCEEDED' as const,
        report: item.value.report,
      };
    } else {
      failedCount += 1;
      const classified = classifyIngestionError(item.reason);
      return {
        sourceName,
        status: 'FAILED' as const,
        errorCode: classified.code,
        errorMessage: classified.message,
      };
    }
  });

  return {
    totalSources: runs.length,
    succeededCount,
    failedCount,
    results,
  };
}

/**
 * Retries a Dead-Letter Record through the canonical ingestion pipeline or marks it permanently invalid (Sections 22, 46, 73).
 */
export async function handleDeadLetterAction(params: {
  prisma: PrismaClient;
  deadLetterId: string;
  adminUserId: string;
  action: 'RETRY' | 'MARK_INVALID';
  overridePayload?: RawLeadInput | null;
  notes?: string;
}) {
  const { prisma, deadLetterId, adminUserId, action, overridePayload, notes } = params;
  const dlq = await prisma.deadLetterRecord.findUnique({
    where: { id: deadLetterId },
  });

  if (!dlq) {
    throw new IngestionError('Dead-letter record not found', 'INVALID_SOURCE_RECORD', {
      statusCode: 404,
      retryable: false,
    });
  }

  if (dlq.status === 'PERMANENTLY_INVALID') {
    throw new IngestionError(
      'Cannot retry a dead-letter record that has been marked PERMANENTLY_INVALID.',
      'POLICY_RESTRICTION',
      { statusCode: 409, retryable: false }
    );
  }

  if (dlq.status === 'RETRIED_RESOLVED') {
    throw new IngestionError(
      'Dead-letter record has already been resolved.',
      'DUPLICATE_RECORD',
      { statusCode: 409, retryable: false }
    );
  }

  const now = new Date();

  if (action === 'MARK_INVALID') {
    const updated = await prisma.deadLetterRecord.update({
      where: { id: deadLetterId },
      data: {
        status: 'PERMANENTLY_INVALID',
        resolvedAt: now,
        resolvedBy: adminUserId,
        resolutionNotes: notes || 'Marked permanently invalid by administrator',
      },
    });

    await createAuditLog(
      {
        userId: adminUserId,
        action: 'ADMIN_DEAD_LETTER_MARKED_INVALID',
        entityType: 'DeadLetterRecord',
        entityId: deadLetterId,
        details: {
          sourceName: dlq.sourceName,
          externalId: dlq.externalId,
          notes: notes || 'Marked permanently invalid by administrator',
        },
      },
      prisma
    );

    return {
      success: true,
      action: 'MARK_INVALID' as const,
      deadLetter: updated,
    };
  }

  // Action === 'RETRY'
  const rawCandidate = (overridePayload ||
    (dlq.rawPayload as unknown as RawLeadInput) ||
    (dlq.normalizedPayload as unknown as RawLeadInput) ||
    {}) as RawLeadInput;

  const report = await runIngestionPipeline({
    prisma,
    userId: adminUserId,
    sourceName: dlq.sourceName,
    sourceType: dlq.sourceType,
    sourceId: dlq.sourceId,
    rawRecords: [
      {
        ...rawCandidate,
        externalId: rawCandidate.externalId ?? dlq.externalId ?? undefined,
      },
    ],
    triggerType: 'REPROCESS',
    forceReprocess: true,
  });

  const recOutcome = report.records[0];
  const resolved =
    recOutcome &&
    (recOutcome.status === 'VALID' ||
      recOutcome.status === 'DUPLICATE' ||
      recOutcome.status === 'POSSIBLE_DUPLICATE');

  const updated = await prisma.deadLetterRecord.update({
    where: { id: deadLetterId },
    data: {
      retryCount: { increment: 1 },
      lastFailedAt: resolved ? dlq.lastFailedAt : now,
      status: resolved ? 'RETRIED_RESOLVED' : 'DEAD_LETTER',
      resolvedAt: resolved ? now : null,
      resolvedBy: resolved ? adminUserId : null,
      resolvedLeadId: recOutcome?.leadId || null,
      resolutionNotes: resolved
        ? notes || `Resolved via admin retry (ImportJob ${report.importJobId})`
        : notes || `Retry attempt failed: ${(recOutcome?.errors || []).join(', ')}`,
      lastError: resolved
        ? dlq.lastError
        : (recOutcome?.errors || ['Retry validation failed']).join(' | '),
    },
  });

  await createAuditLog(
    {
      userId: adminUserId,
      action: 'ADMIN_DEAD_LETTER_RETRIED',
      entityType: 'DeadLetterRecord',
      entityId: deadLetterId,
      details: {
        sourceName: dlq.sourceName,
        externalId: dlq.externalId,
        resolved,
        resolvedLeadId: recOutcome?.leadId || null,
        importJobId: report.importJobId,
      },
    },
    prisma
  );

  return {
    success: resolved,
    action: 'RETRY' as const,
    deadLetter: updated,
    report,
  };
}

/**
 * Controlled Backfill & Reprocessing Execution (Sections 64, 65).
 * Explicitly initiated, bounded, auditable, and idempotent.
 */
export async function runBackfillOrReprocess(params: {
  prisma: PrismaClient;
  adminUserId: string;
  sourceId?: string | null;
  sourceName?: string;
  startDate: Date;
  endDate: Date;
  maxRecords?: number;
  forceReprocess?: boolean;
}) {
  const {
    prisma,
    adminUserId,
    sourceId,
    sourceName,
    startDate,
    endDate,
    maxRecords = 500,
    forceReprocess = true,
  } = params;

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    throw new IngestionError(
      'Invalid backfill date window: startDate must be <= endDate',
      'INVALID_SOURCE_CONFIGURATION',
      { statusCode: 400, retryable: false }
    );
  }

  const boundedLimit = Math.max(1, Math.min(2000, maxRecords));

  const historicalSourceRecords = await prisma.sourceRecord.findMany({
    where: {
      ...(sourceId ? { sourceId } : {}),
      ...(sourceName ? { sourceName } : {}),
      firstSeenAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { firstSeenAt: 'asc' },
    take: boundedLimit,
  });

  const rawRecords: RawLeadInput[] = historicalSourceRecords.map((sr) => {
    const rawObj = (sr.rawData as Record<string, unknown>) || {};
    const normObj = (sr.normalizedData as Record<string, unknown>) || {};
    return {
      ...(normObj as RawLeadInput),
      ...(rawObj as RawLeadInput),
      externalId: sr.externalId || (rawObj.externalId as string | undefined),
      source: sr.sourceName,
      sourceType: sr.sourceType,
    };
  });

  const resolvedSourceName =
    sourceName || historicalSourceRecords[0]?.sourceName || 'Backfill Reprocess';

  const report = await runIngestionPipeline({
    prisma,
    userId: adminUserId,
    sourceName: resolvedSourceName,
    sourceId: sourceId || historicalSourceRecords[0]?.sourceId || null,
    rawRecords,
    triggerType: 'BACKFILL',
    maxRecords: boundedLimit,
    forceReprocess,
    backfillRange: { startDate, endDate },
  });

  await createAuditLog(
    {
      userId: adminUserId,
      action: 'ADMIN_BACKFILL_EXECUTED',
      entityType: 'ImportJob',
      entityId: report.importJobId,
      details: {
        sourceId,
        sourceName: resolvedSourceName,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        recordsReprocessed: rawRecords.length,
        reportSummary: {
          valid: report.valid,
          duplicates: report.duplicates,
          updated: report.updated,
          invalid: report.invalid,
        },
      },
    },
    prisma
  );

  return report;
}

/**
 * Full End-to-End Data Lineage Trace for any Canonical Lead (Section 60).
 * Traces: Lead -> SourceRecords -> Source -> Collector -> Collector Version -> ImportJob -> Original Observation.
 */
export async function getLeadDataLineage(prisma: PrismaClient, leadId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      leadSource: true,
      sourceRecords: {
        include: {
          source: true,
        },
        orderBy: { firstSeenAt: 'asc' },
      },
      identities: {
        orderBy: { createdAt: 'asc' },
      },
      mergeHistoriesAsTarget: {
        orderBy: { performedAt: 'asc' },
      },
      importRecords: {
        include: {
          importJob: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!lead) {
    throw new IngestionError('Lead not found for lineage lookup', 'INVALID_SOURCE_RECORD', {
      statusCode: 404,
      retryable: false,
    });
  }

  const importJobIds = Array.from(
    new Set(
      [
        ...lead.sourceRecords.map((sr) => sr.importJobId),
        ...lead.importRecords.map((ir) => ir.importJobId),
      ].filter((id): id is string => Boolean(id))
    )
  );

  const importJobs =
    importJobIds.length > 0
      ? await prisma.importJob.findMany({
          where: { id: { in: importJobIds } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
  const jobById = new Map(importJobs.map((j) => [j.id, j]));

  return {
    leadId: lead.id,
    businessName: lead.businessName,
    isCanonical: lead.isCanonical,
    originSource: lead.source,
    sourceList: lead.sourceList,
    canonicalIdentityKeys: lead.canonicalIdentityKeys,
    fieldProvenance: lead.fieldProvenance || {},
    fieldConflicts: lead.fieldConflicts || [],
    observations: lead.sourceRecords.map((sr) => {
      const job = sr.importJobId ? jobById.get(sr.importJobId) || null : null;
      return {
        sourceRecordId: sr.id,
        sourceId: sr.sourceId,
        sourceName: sr.sourceName,
        sourceType: sr.sourceType,
        externalId: sr.externalId,
        collectorVersion: sr.collectorVersion,
        contractVersion: sr.contractVersion,
        checksum: sr.checksum,
        decision: sr.decision,
        status: sr.status,
        firstSeenAt: sr.firstSeenAt.toISOString(),
        lastSeenAt: sr.lastSeenAt.toISOString(),
        fetchedAt: sr.fetchedAt.toISOString(),
        rawPayloadRetained: sr.rawPayloadRetained,
        retentionExpiresAt: sr.retentionExpiresAt?.toISOString() || null,
        originalObservation: sr.rawPayloadRetained ? sanitizeRawPayloadForStorage(sr.rawData) : null,
        importJob: job
          ? {
              jobId: job.id,
              status: job.status,
              triggerType: job.triggerType,
              collectorVersion: job.collectorVersion,
              startedAt: job.startedAt.toISOString(),
              completedAt: job.completedAt?.toISOString() || null,
            }
          : null,
      };
    }),
    identities: lead.identities.map((idRec) => ({
      canonicalKey: idRec.canonicalKey,
      keyType: idRec.keyType,
      keyValue: idRec.keyValue,
      source: idRec.source,
      sourceRecordId: idRec.sourceRecordId,
      isPrimary: idRec.isPrimary,
    })),
    mergeHistory: lead.mergeHistoriesAsTarget.map((mh) => ({
      mergeId: mh.id,
      mergeType: mh.mergeType,
      reason: mh.reason,
      decision: mh.decision,
      sourceRecordId: mh.sourceRecordId,
      performedBy: mh.performedBy,
      performedAt: mh.performedAt.toISOString(),
      fieldChanges: mh.fieldChanges,
      isReverted: mh.isReverted,
    })),
  };
}

/**
 * Applies configurable Data Retention Policies (Sections 11, 66).
 * Redacts expired raw payloads and cleans expired resolved dead-letter records
 * WITHOUT ever deleting canonical business Leads, SourceRecord provenance links, claims, or outcomes!
 */
export async function applyIngestionRetentionPolicy(
  prisma: PrismaClient,
  options?: {
    now?: Date;
    policyOverride?: Partial<RetentionPolicyConfig>;
    adminUserId?: string;
  }
) {
  const now = options?.now ?? new Date();
  const policy = {
    ...activeRetentionPolicy,
    ...(options?.policyOverride || {}),
  };

  const rawCutoff = new Date(
    now.getTime() - policy.RAW_SOURCE_PAYLOAD * 24 * 60 * 60 * 1000
  );
  const dlqCutoff = new Date(
    now.getTime() - policy.DEAD_LETTER_RECORD * 24 * 60 * 60 * 1000
  );

  // 1. Redact rawData on expired SourceRecords while keeping normalizedData, checksum, and provenance intact!
  const expiredSourceRecords = await prisma.sourceRecord.findMany({
    where: {
      rawPayloadRetained: true,
      OR: [
        { retentionExpiresAt: { lte: now } },
        { fetchedAt: { lte: rawCutoff } },
      ],
    },
    select: { id: true },
  });

  let redactedSourcePayloads = 0;
  if (expiredSourceRecords.length > 0) {
    const res = await prisma.sourceRecord.updateMany({
      where: {
        id: { in: expiredSourceRecords.map((r) => r.id) },
      },
      data: {
        rawData: { redactedByRetentionPolicy: true, redactedAt: now.toISOString() },
        rawPayloadRetained: false,
      },
    });
    redactedSourcePayloads = res.count;
  }

  // 2. Redact rawData on expired ImportRecords
  const redactedImportPayloadsRes = await prisma.importRecord.updateMany({
    where: {
      OR: [
        { retentionExpiresAt: { lte: now } },
        { fetchedAt: { lte: rawCutoff } },
      ],
    },
    data: {
      rawData: { redactedByRetentionPolicy: true, redactedAt: now.toISOString() },
    },
  });

  // 3. Delete expired resolved/invalid DeadLetterRecords
  const deletedDeadLettersRes = await prisma.deadLetterRecord.deleteMany({
    where: {
      status: { in: ['RETRIED_RESOLVED', 'PERMANENTLY_INVALID'] },
      OR: [
        { retentionExpiresAt: { lte: now } },
        { updatedAt: { lte: dlqCutoff } },
      ],
    },
  });

  if (options?.adminUserId) {
    await createAuditLog(
      {
        userId: options.adminUserId,
        action: 'ADMIN_RETENTION_POLICY_APPLIED',
        entityType: 'IngestionRetention',
        details: {
          policy,
          redactedSourcePayloads,
          redactedImportPayloads: redactedImportPayloadsRes.count,
          deletedDeadLetters: deletedDeadLettersRes.count,
        },
      },
      prisma
    );
  }

  return {
    executedAt: now.toISOString(),
    policy,
    redactedSourcePayloads,
    redactedImportPayloads: redactedImportPayloadsRes.count,
    deletedDeadLetters: deletedDeadLettersRes.count,
  };
}
