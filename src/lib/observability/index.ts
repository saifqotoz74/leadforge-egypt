import { PrismaClient } from '@prisma/client';
import { ensureDbReady, prisma as defaultPrisma } from '@/lib/db';
import { getIngestionHealthOverview } from '@/lib/collectors';
import { getFlaggedAbuseSignals, getAbuseThresholds } from '@/lib/security/abuse-detection';
import { redactSensitiveData } from '@/lib/security/error-taxonomy';
import { globalAppCache } from './cache';
import { runDataIntegrityChecks } from './integrity';
import { getRecentStructuredLogs } from './logger';
import {
  evaluateOperationalAlerts,
  getAlertThresholds,
  getOperationalMetricsSnapshot,
} from './metrics';
import { evaluateLivenessCheck, evaluateReadinessCheck } from './shutdown';

export * from './logger';
export * from './cache';
export * from './metrics';
export * from './integrity';
export * from './shutdown';

/**
 * Builds the comprehensive Admin Operational Observability Dashboard payload (Section 39).
 */
export async function getOperationalObservabilityDashboard(
  customPrisma?: PrismaClient,
  options?: { includeIntegrityCheck?: boolean }
) {
  const db = customPrisma || defaultPrisma;
  if (!customPrisma) {
    await ensureDbReady();
  }

  const [
    liveness,
    readiness,
    ingestionHealth,
    activeClaimsCount,
    refundedClaimsCount,
    failedClaimsCount,
    recentAuditLogs,
    integrityReport,
  ] = await Promise.all([
    Promise.resolve(evaluateLivenessCheck()),
    evaluateReadinessCheck(db),
    getIngestionHealthOverview(db),
    db.leadClaim.count({ where: { status: 'ACTIVE' } }),
    db.leadClaim.count({ where: { status: 'REFUNDED' } }),
    db.leadClaim.count({ where: { status: 'FAILED' } }),
    db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        userId: true,
        action: true,
        entityType: true,
        entityId: true,
        details: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
    options?.includeIntegrityCheck !== false
      ? runDataIntegrityChecks(db)
      : Promise.resolve(null),
  ]);

  const metricsSnapshot = getOperationalMetricsSnapshot();
  const cacheStats = globalAppCache.getStats();
  const abuseSignals = getFlaggedAbuseSignals(50);

  const openCircuitsCount = ingestionHealth.sources.filter(
    (s) => s.circuitState === 'OPEN'
  ).length;
  const deadLetterBacklogCount = ingestionHealth.summary.unresolvedDeadLetters;

  const alerts = evaluateOperationalAlerts({
    openCircuitSourcesCount: openCircuitsCount,
    deadLetterBacklogCount,
    totalActiveClaimsCount: activeClaimsCount,
    totalRefundedClaimsCount: refundedClaimsCount,
    integrityViolationsCount: integrityReport?.totalViolations ?? 0,
    flaggedAbuseSignalsCount: abuseSignals.length,
  });

  return {
    generatedAt: new Date().toISOString(),
    systemHealth: {
      liveness,
      readiness,
    },
    ingestionHealth: {
      summary: ingestionHealth.summary,
      openCircuitSourcesCount: openCircuitsCount,
      deadLetterBacklogCount,
      sources: ingestionHealth.sources,
    },
    claimAndCreditMetrics: {
      activeClaimsCount,
      refundedClaimsCount,
      failedClaimsCount,
      runtimeMetrics: metricsSnapshot.claimsAndCredits,
    },
    performanceAndQueries: {
      httpRequests: metricsSnapshot.requests,
      slowQueries: metricsSnapshot.slowQueries,
      cache: cacheStats,
    },
    securityAndAbuse: {
      flaggedAbuseSignalsCount: abuseSignals.length,
      flaggedAbuseSignals: abuseSignals,
      abuseThresholds: getAbuseThresholds(),
      recentAuditEvents: recentAuditLogs.map((log) => ({
        ...log,
        details: redactSensitiveData(log.details),
      })),
    },
    dataIntegrity: integrityReport,
    alerts: {
      activeAlertsCount: alerts.length,
      activeAlerts: alerts,
      thresholds: getAlertThresholds(),
    },
    recentStructuredLogs: getRecentStructuredLogs({ limit: 30 }),
  };
}
