import { PrismaClient, SourceType } from '@prisma/client';
import { collectorRegistry } from './registry';
import { maskSourceConfigSecrets } from './security';
import { runIngestionPipeline } from './orchestrator';
import { logIngestionEvent } from './logger';
import {
  InventoryReplenishmentDecision,
  InventoryReplenishmentRule,
  OperationalAlert,
  SourceConfigurationStatus,
  SourceHealthStatus,
} from './types';

function parseJsonObject(val: unknown): Record<string, unknown> | undefined {
  if (!val) return undefined;
  if (typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export interface SourceCostMetricValue {
  value: number | null;
  currency: 'EGP';
  status: 'OK' | 'INSUFFICIENT_DATA';
  numeratorCostEgp: number | null;
  denominatorCount: number;
}

export interface SourceCostEconomics {
  hasCostData: boolean;
  totalAcquisitionCostEgp: number | null;
  acquisitionCostPerRunEgp: number | null;
  acquisitionCostPerRecordEgp: number | null;
  costPerCollectedRecord: SourceCostMetricValue;
  costPerUniqueLead: SourceCostMetricValue;
  costPerSaleableLead: SourceCostMetricValue;
  costPerClaimedLead: SourceCostMetricValue;
  costPerWonLead: SourceCostMetricValue;
}

export function computeSourceCostEconomics(params: {
  acquisitionCostPerRunEgp?: number | null;
  acquisitionCostPerRecordEgp?: number | null;
  totalJobCostEgp?: number | null;
  completedRunsCount: number;
  collectedRecordsCount: number;
  uniqueLeadsCount: number;
  saleableLeadsCount: number;
  claimedLeadsCount: number;
  wonLeadsCount: number;
}): SourceCostEconomics {
  const hasExplicitRunCost =
    typeof params.acquisitionCostPerRunEgp === 'number' &&
    Number.isFinite(params.acquisitionCostPerRunEgp);
  const hasExplicitRecordCost =
    typeof params.acquisitionCostPerRecordEgp === 'number' &&
    Number.isFinite(params.acquisitionCostPerRecordEgp);
  const hasJobCost =
    typeof params.totalJobCostEgp === 'number' &&
    Number.isFinite(params.totalJobCostEgp) &&
    params.totalJobCostEgp > 0;

  const hasCostData = hasExplicitRunCost || hasExplicitRecordCost || hasJobCost;

  if (!hasCostData) {
    const emptyMetric = (denom: number): SourceCostMetricValue => ({
      value: null,
      currency: 'EGP',
      status: 'INSUFFICIENT_DATA',
      numeratorCostEgp: null,
      denominatorCount: denom,
    });

    return {
      hasCostData: false,
      totalAcquisitionCostEgp: null,
      acquisitionCostPerRunEgp: null,
      acquisitionCostPerRecordEgp: null,
      costPerCollectedRecord: emptyMetric(params.collectedRecordsCount),
      costPerUniqueLead: emptyMetric(params.uniqueLeadsCount),
      costPerSaleableLead: emptyMetric(params.saleableLeadsCount),
      costPerClaimedLead: emptyMetric(params.claimedLeadsCount),
      costPerWonLead: emptyMetric(params.wonLeadsCount),
    };
  }

  const computedFromModel =
    (hasExplicitRunCost
      ? (params.acquisitionCostPerRunEgp as number) * Math.max(1, params.completedRunsCount)
      : 0) +
    (hasExplicitRecordCost
      ? (params.acquisitionCostPerRecordEgp as number) * params.collectedRecordsCount
      : 0);

  const totalCost =
    Math.round(
      ((hasJobCost ? (params.totalJobCostEgp as number) : computedFromModel) +
        Number.EPSILON) *
        100
    ) / 100;

  const buildMetric = (denominator: number): SourceCostMetricValue => {
    if (denominator <= 0) {
      return {
        value: null,
        currency: 'EGP',
        status: 'INSUFFICIENT_DATA',
        numeratorCostEgp: totalCost,
        denominatorCount: 0,
      };
    }
    return {
      value: Math.round(((totalCost / denominator) + Number.EPSILON) * 100) / 100,
      currency: 'EGP',
      status: 'OK',
      numeratorCostEgp: totalCost,
      denominatorCount: denominator,
    };
  };

  return {
    hasCostData: true,
    totalAcquisitionCostEgp: totalCost,
    acquisitionCostPerRunEgp: hasExplicitRunCost
      ? (params.acquisitionCostPerRunEgp as number)
      : null,
    acquisitionCostPerRecordEgp: hasExplicitRecordCost
      ? (params.acquisitionCostPerRecordEgp as number)
      : null,
    costPerCollectedRecord: buildMetric(params.collectedRecordsCount),
    costPerUniqueLead: buildMetric(params.uniqueLeadsCount),
    costPerSaleableLead: buildMetric(params.saleableLeadsCount),
    costPerClaimedLead: buildMetric(params.claimedLeadsCount),
    costPerWonLead: buildMetric(params.wonLeadsCount),
  };
}

export function computeNextRunAt(params: {
  baseTime?: Date;
  scheduleIntervalMinutes?: number | null;
  scheduleCron?: string | null;
}): Date | null {
  const base = params.baseTime ?? new Date();
  if (
    typeof params.scheduleIntervalMinutes === 'number' &&
    params.scheduleIntervalMinutes > 0
  ) {
    return new Date(base.getTime() + params.scheduleIntervalMinutes * 60_000);
  }

  if (params.scheduleCron && params.scheduleCron.trim()) {
    const cron = params.scheduleCron.trim();
    const parts = cron.split(/\s+/);
    if (parts.length === 5) {
      const [minPart, hourPart] = parts;
      if (minPart.startsWith('*/')) {
        const mins = Number(minPart.slice(2));
        if (Number.isFinite(mins) && mins > 0) {
          return new Date(base.getTime() + mins * 60_000);
        }
      }
      if (hourPart.startsWith('*/')) {
        const hours = Number(hourPart.slice(2));
        if (Number.isFinite(hours) && hours > 0) {
          return new Date(base.getTime() + hours * 3_600_000);
        }
      }
      return new Date(base.getTime() + 60 * 60_000);
    }
  }

  return null;
}

export async function ensureDefaultLeadSourcesSeeded(prisma: PrismaClient): Promise<void> {
  const defaultSources: {
    name: string;
    type: SourceType;
    collectorKey: string;
    description: string;
    enabled: boolean;
    priority: number;
    scheduleIntervalMinutes: number | null;
    scheduleCron: string | null;
    acquisitionCostPerRunEgp: number | null;
    acquisitionCostPerRecordEgp: number | null;
  }[] = [
    {
      name: 'Egypt Open Business Registry',
      type: 'OPEN_DATA',
      collectorKey: 'open-data-v1',
      description: 'قواعد البيانات المفتوحة للأنشطة التجارية المسجلة في مصر',
      enabled: true,
      priority: 10,
      scheduleIntervalMinutes: 360,
      scheduleCron: '0 */6 * * *',
      acquisitionCostPerRunEgp: 15,
      acquisitionCostPerRecordEgp: 0.5,
    },
    {
      name: 'Egyptian Business Directory',
      type: 'DIRECTORY',
      collectorKey: 'directory-v1',
      description: 'الدليل التجاري المصري للعيادات والمطاعم والشركات والمكاتب',
      enabled: true,
      priority: 20,
      scheduleIntervalMinutes: 720,
      scheduleCron: '0 */12 * * *',
      acquisitionCostPerRunEgp: 25,
      acquisitionCostPerRecordEgp: 0.75,
    },
    {
      name: 'CSV Import',
      type: 'CSV_IMPORT',
      collectorKey: 'csv-v1',
      description: 'استيراد ملفات CSV المعتمدة للعملاء المحتملين',
      enabled: true,
      priority: 30,
      scheduleIntervalMinutes: null,
      scheduleCron: null,
      acquisitionCostPerRunEgp: 10,
      acquisitionCostPerRecordEgp: 0.25,
    },
    {
      name: 'Public Business Websites',
      type: 'WEBSITE',
      collectorKey: 'website-v1',
      description: 'فحص الصفحات العامة للأنشطة التجارية المصرية لاستخراج بيانات التواصل',
      enabled: true,
      priority: 40,
      scheduleIntervalMinutes: 1440,
      scheduleCron: '0 0 * * *',
      acquisitionCostPerRunEgp: 20,
      acquisitionCostPerRecordEgp: 1.0,
    },
    {
      name: 'Google Business Profile Connector',
      type: 'GOOGLE_BUSINESS',
      collectorKey: 'google-business-v1',
      description: 'موصل Google Places API الرسمي (يتطلب GOOGLE_PLACES_API_KEY)',
      enabled: true,
      priority: 50,
      scheduleIntervalMinutes: 1440,
      scheduleCron: '0 2 * * *',
      acquisitionCostPerRunEgp: null,
      acquisitionCostPerRecordEgp: null,
    },
    {
      name: 'Manual Admin Entry',
      type: 'MANUAL',
      collectorKey: 'manual-v1',
      description: 'الإدخال اليدوي المباشر عبر لوحة تحكم المسؤول',
      enabled: true,
      priority: 60,
      scheduleIntervalMinutes: null,
      scheduleCron: null,
      acquisitionCostPerRunEgp: null,
      acquisitionCostPerRecordEgp: null,
    },
  ];

  for (const def of defaultSources) {
    const collector = collectorRegistry.resolveCollector({
      collectorKey: def.collectorKey,
      sourceType: def.type,
    });
    const validation = collector.validateConfiguration();
    const existing = await prisma.leadSource.findUnique({
      where: { name: def.name },
    });

    const healthStatus: SourceHealthStatus = !def.enabled
      ? 'DISABLED'
      : validation.status === 'NOT_CONFIGURED'
        ? 'NOT_CONFIGURED'
        : 'HEALTHY';

    if (!existing) {
      await prisma.leadSource.create({
        data: {
          name: def.name,
          type: def.type,
          description: def.description,
          isActive: def.enabled,
          enabled: def.enabled,
          collectorKey: collector.collectorKey,
          collectorVersion: collector.version,
          contractVersion: collector.contractVersion,
          configurationStatus: validation.status,
          healthStatus,
          priority: def.priority,
          scheduleIntervalMinutes: def.scheduleIntervalMinutes,
          scheduleCron: def.scheduleCron,
          nextRunAt: def.scheduleIntervalMinutes
            ? computeNextRunAt({ scheduleIntervalMinutes: def.scheduleIntervalMinutes })
            : null,
          acquisitionCostPerRunEgp: def.acquisitionCostPerRunEgp,
          acquisitionCostPerRecordEgp: def.acquisitionCostPerRecordEgp,
        },
      });
    } else if (!existing.collectorKey) {
      await prisma.leadSource.update({
        where: { id: existing.id },
        data: {
          collectorKey: collector.collectorKey,
          collectorVersion: collector.version,
          contractVersion: collector.contractVersion,
          configurationStatus: validation.status,
          healthStatus:
            !existing.isActive || !existing.enabled
              ? 'DISABLED'
              : validation.status === 'NOT_CONFIGURED'
                ? 'NOT_CONFIGURED'
                : (existing.healthStatus as SourceHealthStatus) || 'HEALTHY',
        },
      });
    }
  }
}

export function determineDeterministicHealthStatus(params: {
  enabled: boolean;
  isActive: boolean;
  configurationStatus: SourceConfigurationStatus;
  circuitState: string;
  consecutiveFailures: number;
  invalidRate: number;
  duplicateRate: number;
  totalProcessed: number;
}): SourceHealthStatus {
  if (!params.enabled || !params.isActive) {
    return 'DISABLED';
  }
  if (
    params.configurationStatus === 'NOT_CONFIGURED' ||
    params.configurationStatus === 'INVALID'
  ) {
    return 'NOT_CONFIGURED';
  }
  if (params.circuitState === 'OPEN' || params.consecutiveFailures >= 3) {
    return 'FAILING';
  }
  if (
    params.consecutiveFailures >= 1 ||
    params.circuitState === 'HALF_OPEN' ||
    (params.totalProcessed >= 5 && params.invalidRate > 0.35) ||
    (params.totalProcessed >= 10 && params.duplicateRate > 0.85)
  ) {
    return 'DEGRADED';
  }
  return 'HEALTHY';
}

export async function evaluateOperationalAlerts(
  prisma: PrismaClient
): Promise<OperationalAlert[]> {
  const alerts: OperationalAlert[] = [];
  const nowIso = new Date().toISOString();

  const [sources, recentJobs, unresolvedDeadLetters] = await Promise.all([
    prisma.leadSource.findMany({
      orderBy: { priority: 'asc' },
    }),
    prisma.importJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.deadLetterRecord.groupBy({
      by: ['sourceName', 'sourceId'],
      where: { status: 'DEAD_LETTER' },
      _count: { _all: true },
    }),
  ]);

  const deadLettersBySource = new Map<string, number>();
  for (const dl of unresolvedDeadLetters) {
    deadLettersBySource.set(
      dl.sourceName,
      (deadLettersBySource.get(dl.sourceName) || 0) + dl._count._all
    );
  }

  for (const source of sources) {
    const sourceJobs = recentJobs.filter(
      (j) => j.sourceId === source.id || j.sourceName === source.name
    );
    const latestJob = sourceJobs[0];

    // 1. Repeated collector failures
    if (source.consecutiveFailures >= 3) {
      alerts.push({
        code: 'REPEATED_COLLECTOR_FAILURES',
        severity: 'CRITICAL',
        sourceId: source.id,
        sourceName: source.name,
        message: `المصدر "${source.name}" سجل ${source.consecutiveFailures} إخفاقات متتالية.`,
        observedValue: source.consecutiveFailures,
        thresholdValue: 3,
        detectedAt: nowIso,
      });
    } else if (source.consecutiveFailures >= 2) {
      alerts.push({
        code: 'REPEATED_COLLECTOR_FAILURES',
        severity: 'WARNING',
        sourceId: source.id,
        sourceName: source.name,
        message: `المصدر "${source.name}" سجل إخفاقين متتاليين.`,
        observedValue: source.consecutiveFailures,
        thresholdValue: 2,
        detectedAt: nowIso,
      });
    }

    // 2. Source unavailable / Circuit breaker open
    if (source.circuitState === 'OPEN' || source.healthStatus === 'FAILING') {
      alerts.push({
        code: 'SOURCE_UNAVAILABLE',
        severity: 'CRITICAL',
        sourceId: source.id,
        sourceName: source.name,
        message: `المصدر "${source.name}" غير متاح حالياً (حالة القاطع: ${source.circuitState}).`,
        observedValue: source.circuitState,
        thresholdValue: 'CLOSED',
        detectedAt: nowIso,
      });
    }

    // Aggregate job counters for this source
    const totalRecords = sourceJobs.reduce(
      (acc, j) => acc + (j.fetchedCount || j.totalRows || 0),
      0
    );
    const invalidRecords = sourceJobs.reduce(
      (acc, j) => acc + (j.invalidCount || 0),
      0
    );
    const duplicateRecords = sourceJobs.reduce(
      (acc, j) => acc + (j.duplicateCount || 0),
      0
    );

    // 3. High invalid rate
    if (totalRecords >= 5) {
      const invalidRate = invalidRecords / totalRecords;
      if (invalidRate > 0.3) {
        alerts.push({
          code: 'HIGH_INVALID_RATE',
          severity: invalidRate > 0.5 ? 'CRITICAL' : 'WARNING',
          sourceId: source.id,
          sourceName: source.name,
          message: `معدل السجلات غير الصالحة مرتفع في المصدر "${source.name}" (${Math.round(
            invalidRate * 100
          )}%).`,
          observedValue: Math.round(invalidRate * 1000) / 10,
          thresholdValue: 30,
          detectedAt: nowIso,
        });
      }

      // 4. High duplicate rate
      const duplicateRate = duplicateRecords / totalRecords;
      if (duplicateRate > 0.8) {
        alerts.push({
          code: 'HIGH_DUPLICATE_RATE',
          severity: 'WARNING',
          sourceId: source.id,
          sourceName: source.name,
          message: `معدل التكرار مرتفع في المصدر "${source.name}" (${Math.round(
            duplicateRate * 100
          )}%).`,
          observedValue: Math.round(duplicateRate * 1000) / 10,
          thresholdValue: 80,
          detectedAt: nowIso,
        });
      }
    }

    // 5. Zero records from active source
    if (
      source.enabled &&
      source.isActive &&
      source.configurationStatus === 'CONFIGURED' &&
      latestJob &&
      latestJob.status === 'COMPLETED' &&
      latestJob.fetchedCount === 0 &&
      latestJob.totalRows === 0
    ) {
      alerts.push({
        code: 'ZERO_RECORDS_FROM_ACTIVE_SOURCE',
        severity: 'WARNING',
        sourceId: source.id,
        sourceName: source.name,
        message: `المصدر النشط "${source.name}" أرجع 0 سجلات في آخر تشغيل.`,
        observedValue: 0,
        thresholdValue: 1,
        detectedAt: nowIso,
      });
    }

    // 6. Excessive runtime
    const maxObservedRuntime = Math.max(
      source.averageDurationMs || 0,
      latestJob?.durationMs || 0
    );
    if (maxObservedRuntime > 30_000) {
      alerts.push({
        code: 'EXCESSIVE_RUNTIME',
        severity: 'WARNING',
        sourceId: source.id,
        sourceName: source.name,
        message: `زمن تشغيل مرتفع للمصدر "${source.name}" (${maxObservedRuntime} مللي ثانية).`,
        observedValue: maxObservedRuntime,
        thresholdValue: 30000,
        detectedAt: nowIso,
      });
    }

    // 7. Retry exhaustion
    const retryExhaustedJob = sourceJobs.find(
      (j) =>
        j.errorCode === 'RETRY_EXHAUSTED' ||
        (j.status === 'FAILED' && j.retryCount >= (source.maxRetries || 3))
    );
    if (retryExhaustedJob) {
      alerts.push({
        code: 'RETRY_EXHAUSTION',
        severity: 'CRITICAL',
        sourceId: source.id,
        sourceName: source.name,
        message: `استنفاد محاولات إعادة التشغيل للمصدر "${source.name}" في المهمة ${retryExhaustedJob.id}.`,
        observedValue: retryExhaustedJob.retryCount,
        thresholdValue: source.maxRetries || 3,
        detectedAt: nowIso,
      });
    }

    // 8. Dead-letter spike
    const dlCount = deadLettersBySource.get(source.name) || 0;
    if (dlCount >= 5) {
      alerts.push({
        code: 'DEAD_LETTER_SPIKE',
        severity: dlCount >= 15 ? 'CRITICAL' : 'WARNING',
        sourceId: source.id,
        sourceName: source.name,
        message: `ارتفاع عدد السجلات في طابور المعالجة المعلقة (Dead-Letter) للمصدر "${source.name}" (${dlCount} سجل).`,
        observedValue: dlCount,
        thresholdValue: 5,
        detectedAt: nowIso,
      });
    }
  }

  return alerts;
}

export async function getIngestionHealthOverview(prisma: PrismaClient) {
  await ensureDefaultLeadSourcesSeeded(prisma);

  const [sources, jobs, deadLetters, leads, claims, alerts] = await Promise.all([
    prisma.leadSource.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.importJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.deadLetterRecord.findMany({
      orderBy: { lastFailedAt: 'desc' },
      take: 100,
    }),
    prisma.lead.findMany({
      where: { isCanonical: true, mergedIntoLeadId: null },
      select: {
        id: true,
        source: true,
        status: true,
        saleabilityStatus: true,
        category: true,
        city: true,
        governorate: true,
      },
    }),
    prisma.leadClaim.findMany({
      select: {
        leadId: true,
        pipelineStatus: true,
      },
    }),
    evaluateOperationalAlerts(prisma),
  ]);

  const claimsByLead = new Map<string, { claimed: boolean; won: boolean }>();
  for (const c of claims) {
    const existing = claimsByLead.get(c.leadId) || { claimed: false, won: false };
    existing.claimed = true;
    if (c.pipelineStatus === 'WON') existing.won = true;
    claimsByLead.set(c.leadId, existing);
  }

  const sourceDetails = await Promise.all(
    sources.map(async (s) => {
      const configObj = parseJsonObject(s.config);

      const collector = collectorRegistry.resolveCollector({
        collectorKey: s.collectorKey,
        sourceType: s.type,
        sourceName: s.name,
        config: configObj,
      });
      const configValidation = collector.validateConfiguration(configObj);

      const sourceJobs = jobs.filter(
        (j) => j.sourceId === s.id || j.sourceName === s.name
      );
      const sourceLeads = leads.filter((l) => l.source === s.name);
      const sourceDeadLetters = deadLetters.filter(
        (dl) =>
          (dl.sourceId === s.id || dl.sourceName === s.name) &&
          dl.status === 'DEAD_LETTER'
      );

      const funnelStats = sourceJobs.reduce(
        (acc, j) => {
          acc.discovered += j.discoveredCount || j.totalRows || 0;
          acc.fetched += j.fetchedCount || j.totalRows || 0;
          acc.normalized += j.normalizedCount || 0;
          acc.accepted += j.validCount || 0;
          acc.inserted += j.insertedCount || 0;
          acc.updated += j.updatedCount || 0;
          acc.duplicate += j.duplicateCount || 0;
          acc.possibleDuplicate += j.possibleDuplicateCount || 0;
          acc.conflict += j.conflictCount || 0;
          acc.invalid += j.invalidCount || 0;
          acc.failed += j.failedCount || 0;
          acc.skipped += j.skippedCount || 0;
          acc.saleable += j.saleableCount || 0;
          acc.deadLetter += j.deadLetterCount || 0;
          acc.totalJobCostEgp += j.acquisitionCostEgp || 0;
          return acc;
        },
        {
          discovered: 0,
          fetched: 0,
          normalized: 0,
          accepted: 0,
          inserted: 0,
          updated: 0,
          duplicate: 0,
          possibleDuplicate: 0,
          conflict: 0,
          invalid: 0,
          failed: 0,
          skipped: 0,
          saleable: 0,
          deadLetter: 0,
          totalJobCostEgp: 0,
        }
      );

      const totalProcessed = Math.max(
        funnelStats.fetched,
        funnelStats.accepted +
          funnelStats.duplicate +
          funnelStats.invalid +
          funnelStats.failed
      );
      const invalidRate =
        totalProcessed > 0 ? funnelStats.invalid / totalProcessed : 0;
      const duplicateRate =
        totalProcessed > 0 ? funnelStats.duplicate / totalProcessed : 0;
      const conflictRate =
        totalProcessed > 0 ? funnelStats.conflict / totalProcessed : 0;
      const saleableLeadsCount = sourceLeads.filter(
        (l) => l.saleabilityStatus === 'AVAILABLE'
      ).length;
      const saleableRate =
        sourceLeads.length > 0 ? saleableLeadsCount / sourceLeads.length : 0;

      const totalRuns = s.totalSuccessCount + s.totalFailureCount;
      const successRate = totalRuns > 0 ? s.totalSuccessCount / totalRuns : 1;

      const computedHealth = determineDeterministicHealthStatus({
        enabled: s.enabled,
        isActive: s.isActive,
        configurationStatus: configValidation.status,
        circuitState: s.circuitState,
        consecutiveFailures: s.consecutiveFailures,
        invalidRate,
        duplicateRate,
        totalProcessed,
      });

      if (
        computedHealth !== s.healthStatus ||
        configValidation.status !== s.configurationStatus
      ) {
        await prisma.leadSource
          .update({
            where: { id: s.id },
            data: {
              healthStatus: computedHealth,
              configurationStatus: configValidation.status,
            },
          })
          .catch(() => undefined);
      }

      const claimedLeadsCount = sourceLeads.filter(
        (l) => claimsByLead.get(l.id)?.claimed
      ).length;
      const wonLeadsCount = sourceLeads.filter(
        (l) => claimsByLead.get(l.id)?.won
      ).length;

      const economics = computeSourceCostEconomics({
        acquisitionCostPerRunEgp: s.acquisitionCostPerRunEgp,
        acquisitionCostPerRecordEgp: s.acquisitionCostPerRecordEgp,
        totalJobCostEgp:
          funnelStats.totalJobCostEgp > 0 ? funnelStats.totalJobCostEgp : null,
        completedRunsCount: s.totalSuccessCount,
        collectedRecordsCount: Math.max(
          totalProcessed,
          sourceLeads.length + funnelStats.duplicate
        ),
        uniqueLeadsCount: sourceLeads.length,
        saleableLeadsCount,
        claimedLeadsCount,
        wonLeadsCount,
      });

      return {
        id: s.id,
        name: s.name,
        type: s.type,
        description: s.description,
        isActive: s.isActive,
        enabled: s.enabled,
        collectorKey: s.collectorKey || collector.collectorKey,
        collectorVersion: s.collectorVersion || collector.version,
        contractVersion: s.contractVersion || collector.contractVersion,
        capabilities: collector.capabilities,
        configurationStatus: configValidation.status,
        configurationValidation: configValidation,
        healthStatus: computedHealth,
        circuitState: s.circuitState,
        circuitOpenedAt: s.circuitOpenedAt,
        consecutiveFailures: s.consecutiveFailures,
        totalSuccessCount: s.totalSuccessCount,
        totalFailureCount: s.totalFailureCount,
        averageDurationMs: s.averageDurationMs,
        scheduleCron: s.scheduleCron,
        scheduleIntervalMinutes: s.scheduleIntervalMinutes,
        nextRunAt: s.nextRunAt,
        lastRunAt: s.lastSyncAt,
        lastSuccessAt: s.lastSuccessAt,
        lastFailureAt: s.lastFailureAt,
        lastVerifiedAt: s.lastVerifiedAt,
        firstSeenAt: s.firstSeenAt,
        lastSeenAt: s.lastSeenAt,
        priority: s.priority,
        quotas: {
          maxRecordsPerRun: s.maxRecordsPerRun,
          batchSize: s.batchSize,
          requestsPerMinute: s.requestsPerMinute,
          maxConcurrentRequests: s.maxConcurrentRequests,
          timeoutMs: s.timeoutMs,
          maxRetries: s.maxRetries,
          baseRetryDelayMs: s.baseRetryDelayMs,
          maxRetryDelayMs: s.maxRetryDelayMs,
          retentionDaysRaw: s.retentionDaysRaw,
        },
        safeConfig: maskSourceConfigSecrets(configObj || null),
        funnelStats,
        rates: {
          successRate: Math.round(successRate * 1000) / 10,
          duplicateRate: Math.round(duplicateRate * 1000) / 10,
          invalidRate: Math.round(invalidRate * 1000) / 10,
          conflictRate: Math.round(conflictRate * 1000) / 10,
          saleableRate: Math.round(saleableRate * 1000) / 10,
        },
        unresolvedDeadLettersCount: sourceDeadLetters.length,
        economics,
      };
    })
  );

  const summary = {
    totalSources: sourceDetails.length,
    healthySources: sourceDetails.filter((s) => s.healthStatus === 'HEALTHY').length,
    degradedSources: sourceDetails.filter((s) => s.healthStatus === 'DEGRADED').length,
    failingSources: sourceDetails.filter((s) => s.healthStatus === 'FAILING').length,
    disabledSources: sourceDetails.filter((s) => s.healthStatus === 'DISABLED').length,
    notConfiguredSources: sourceDetails.filter(
      (s) => s.healthStatus === 'NOT_CONFIGURED'
    ).length,
    totalJobs: jobs.length,
    completedJobs: jobs.filter((j) => j.status === 'COMPLETED').length,
    partiallyCompletedJobs: jobs.filter(
      (j) => j.status === 'PARTIALLY_COMPLETED'
    ).length,
    failedJobs: jobs.filter((j) => j.status === 'FAILED').length,
    runningJobs: jobs.filter(
      (j) => j.status === 'RUNNING' || j.status === 'PROCESSING'
    ).length,
    unresolvedDeadLetters: deadLetters.filter(
      (d) => d.status === 'DEAD_LETTER'
    ).length,
    activeAlertsCount: alerts.length,
    criticalAlertsCount: alerts.filter((a) => a.severity === 'CRITICAL').length,
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    sources: sourceDetails,
    alerts,
    registeredCollectors: collectorRegistry.listMetadata(),
  };
}

export const DEFAULT_INVENTORY_TARGETS: InventoryReplenishmentRule[] = [
  {
    id: 'rule-medical-cairo',
    category: 'Medical',
    city: 'القاهرة',
    governorate: 'القاهرة',
    requiredService: 'WEBSITE_DEVELOPMENT',
    minAvailableSaleableLeads: 2,
    enabled: true,
  },
  {
    id: 'rule-real-estate-giza',
    category: 'Real Estate',
    city: 'الجيزة',
    governorate: 'الجيزة',
    requiredService: 'LANDING_PAGE_FUNNEL',
    minAvailableSaleableLeads: 2,
    enabled: true,
  },
  {
    id: 'rule-restaurant-alex',
    category: 'Restaurant',
    city: 'الإسكندرية',
    governorate: 'الإسكندرية',
    requiredService: 'ECOMMERCE_STORE',
    minAvailableSaleableLeads: 1,
    enabled: true,
  },
  {
    id: 'rule-dental-cairo',
    category: 'Dental',
    city: 'القاهرة',
    governorate: 'القاهرة',
    requiredService: 'WEBSITE_DEVELOPMENT',
    minAvailableSaleableLeads: 2,
    enabled: true,
  },
];

export async function evaluateInventoryReplenishment(
  prisma: PrismaClient,
  options?: {
    userId?: string;
    rules?: InventoryReplenishmentRule[];
    autoTrigger?: boolean;
  }
): Promise<{
  evaluatedAt: string;
  decisions: InventoryReplenishmentDecision[];
  triggeredJobsCount: number;
}> {
  await ensureDefaultLeadSourcesSeeded(prisma);

  const rules = (options?.rules || DEFAULT_INVENTORY_TARGETS).filter((r) => r.enabled);
  const [availableSaleableLeads, sources] = await Promise.all([
    prisma.lead.findMany({
      where: {
        isCanonical: true,
        mergedIntoLeadId: null,
        status: 'AVAILABLE',
        saleabilityStatus: 'AVAILABLE',
      },
      select: {
        id: true,
        category: true,
        city: true,
        governorate: true,
        requiredService: true,
        source: true,
      },
    }),
    prisma.leadSource.findMany({
      where: {
        enabled: true,
        isActive: true,
      },
      orderBy: [{ priority: 'asc' }, { totalSuccessCount: 'desc' }],
    }),
  ]);

  const eligibleSources = sources.filter((s) => {
    if (s.circuitState === 'OPEN') return false;
    if (s.configurationStatus !== 'CONFIGURED') return false;
    if (s.healthStatus !== 'HEALTHY' && s.healthStatus !== 'DEGRADED') return false;
    const collector = collectorRegistry.resolveCollector({
      collectorKey: s.collectorKey,
      sourceType: s.type,
    });
    return !collector.capabilities.requiresManualInput;
  });

  const decisions: InventoryReplenishmentDecision[] = [];
  const sourcesAlreadyTriggered = new Set<string>();
  let triggeredJobsCount = 0;

  for (const rule of rules) {
    const matchingLeads = availableSaleableLeads.filter((lead) => {
      if (
        rule.category &&
        lead.category.toLowerCase() !== rule.category.toLowerCase()
      ) {
        return false;
      }
      if (rule.city && lead.city !== rule.city) return false;
      if (rule.governorate && lead.governorate !== rule.governorate) return false;
      if (
        rule.requiredService &&
        lead.requiredService &&
        lead.requiredService !== rule.requiredService
      ) {
        return false;
      }
      return true;
    });

    const currentAvailable = matchingLeads.length;
    const deficit = Math.max(0, rule.minAvailableSaleableLeads - currentAvailable);
    const needsReplenishment = deficit > 0;

    const selectedSources = needsReplenishment
      ? eligibleSources.slice(0, 2).map((s) => ({
          sourceId: s.id,
          sourceName: s.name,
          sourceType: s.type,
          priority: s.priority,
          healthStatus: s.healthStatus as SourceHealthStatus,
          selectionReason: `أولوية ${s.priority} | الحالة: ${s.healthStatus} | لتعويض عجز (${deficit}) في قطاع ${rule.category}`,
        }))
      : [];

    const triggeredJobIds: string[] = [];

    if (needsReplenishment && options?.autoTrigger && options.userId) {
      for (const candidate of selectedSources) {
        if (sourcesAlreadyTriggered.has(candidate.sourceId)) continue;
        sourcesAlreadyTriggered.add(candidate.sourceId);

        try {
          const report = await runIngestionPipeline({
            prisma,
            userId: options.userId,
            sourceId: candidate.sourceId,
            sourceName: candidate.sourceName,
            sourceType: candidate.sourceType,
            triggerType: 'REPLENISHMENT',
          });
          triggeredJobIds.push(report.importJobId);
          triggeredJobsCount += 1;
        } catch (err) {
          logIngestionEvent({
            event: 'REPLENISHMENT_TRIGGER_FAILED',
            source: candidate.sourceName,
            sourceId: candidate.sourceId,
            collectorVersion: 'v1',
            stage: 'JOB_INIT',
            status: 'WARNING',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    decisions.push({
      ruleId: rule.id,
      category: rule.category,
      city: rule.city ?? null,
      governorate: rule.governorate ?? null,
      requiredService: rule.requiredService ?? null,
      minRequired: rule.minAvailableSaleableLeads,
      currentAvailable,
      deficit,
      needsReplenishment,
      selectedSources,
      triggeredJobIds,
    });
  }

  return {
    evaluatedAt: new Date().toISOString(),
    decisions,
    triggeredJobsCount,
  };
}

export async function evaluateScheduledSources(
  prisma: PrismaClient,
  options: {
    userId: string;
    now?: Date;
    autoExecute?: boolean;
  }
) {
  await ensureDefaultLeadSourcesSeeded(prisma);
  const now = options.now ?? new Date();

  const sources = await prisma.leadSource.findMany({
    where: {
      enabled: true,
      isActive: true,
      configurationStatus: 'CONFIGURED',
    },
    orderBy: { priority: 'asc' },
  });

  const dueSources = sources.filter((s) => {
    if (!s.scheduleIntervalMinutes && !s.scheduleCron) return false;
    if (s.circuitState === 'OPEN') return false;
    const collector = collectorRegistry.resolveCollector({
      collectorKey: s.collectorKey,
      sourceType: s.type,
    });
    if (collector.capabilities.requiresManualInput) return false;
    if (!s.nextRunAt) return true;
    return s.nextRunAt.getTime() <= now.getTime();
  });

  const executedJobs: {
    sourceId: string;
    sourceName: string;
    jobId?: string;
    status: string;
  }[] = [];

  if (options.autoExecute) {
    for (const source of dueSources) {
      try {
        const report = await runIngestionPipeline({
          prisma,
          userId: options.userId,
          sourceId: source.id,
          sourceName: source.name,
          sourceType: source.type,
          triggerType: 'SCHEDULED',
        });

        const nextRunAt = computeNextRunAt({
          baseTime: now,
          scheduleIntervalMinutes: source.scheduleIntervalMinutes,
          scheduleCron: source.scheduleCron,
        });

        await prisma.leadSource.update({
          where: { id: source.id },
          data: { nextRunAt },
        });

        executedJobs.push({
          sourceId: source.id,
          sourceName: source.name,
          jobId: report.importJobId,
          status: report.status || 'COMPLETED',
        });
      } catch {
        executedJobs.push({
          sourceId: source.id,
          sourceName: source.name,
          status: 'FAILED',
        });
      }
    }
  }

  return {
    evaluatedAt: now.toISOString(),
    dueSourcesCount: dueSources.length,
    dueSources: dueSources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      collectorKey: s.collectorKey,
      priority: s.priority,
      nextRunAt: s.nextRunAt,
    })),
    executedJobs,
  };
}
