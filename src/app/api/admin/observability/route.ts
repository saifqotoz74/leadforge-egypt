import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { getClientIp, checkRateLimit } from '@/lib/rate-limit';
import {
  getOperationalObservabilityDashboard,
  getOrGenerateRequestId,
  globalAppCache,
  recordHttpRequestMetric,
  runDataIntegrityChecks,
  updateAlertThresholds,
} from '@/lib/observability';
import {
  AppSecurityError,
  applySecurityHeaders,
  createSafeErrorResponse,
  updateAbuseThresholds,
} from '@/lib/security';

import {
  evaluateProductionLaunchGate,
  executeScheduledWorkerJob,
  getFeatureFlagsSnapshot,
  getWorkerSchedulerSnapshot,
  runProductionDataQualityGate,
  runProductionSmokeTests,
  setFeatureFlagOverride,
  validateEnvironmentConfiguration,
  type FeatureFlagKey,
  type WorkerJobKey,
} from '@/lib/production';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const startMs = Date.now();
  const requestId = getOrGenerateRequestId(req.headers);

  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const includeIntegrityCheck = searchParams.get('integrity') !== 'false';

    const dashboard = await getOperationalObservabilityDashboard(undefined, {
      includeIntegrityCheck,
    });

    const production = {
      environmentValidation: validateEnvironmentConfiguration(),
      featureFlags: getFeatureFlagsSnapshot(),
      workerScheduler: getWorkerSchedulerSnapshot(),
    };

    recordHttpRequestMetric({
      route: '/api/admin/observability',
      method: 'GET',
      statusCode: 200,
      durationMs: Date.now() - startMs,
      requestId,
    });

    const res = NextResponse.json({
      ...dashboard,
      production,
      requestId,
    });
    return applySecurityHeaders(res, requestId);
  } catch (err) {
    const safeRes = createSafeErrorResponse(err, {
      defaultMessage: 'Failed to load operational observability dashboard',
      requestId,
    });
    recordHttpRequestMetric({
      route: '/api/admin/observability',
      method: 'GET',
      statusCode: safeRes.status,
      durationMs: Date.now() - startMs,
      requestId,
    });
    return safeRes;
  }
}

export async function POST(req: NextRequest) {
  const startMs = Date.now();
  const requestId = getOrGenerateRequestId(req.headers);

  try {
    if (!verifyCsrfOrigin(req)) {
      throw new AppSecurityError('FORBIDDEN', 'طلب غير مصرح به (CSRF).', 403);
    }

    const admin = await requireAdmin(req);
    const ipAddress = getClientIp(req.headers);

    const rl = checkRateLimit({
      key: `admin-observability:${admin.id}:${ipAddress}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      throw new AppSecurityError(
        'RATE_LIMITED',
        'تم تجاوز الحد المسموح به للعمليات الإدارية.',
        429
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').toUpperCase().trim();

    if (action === 'UPDATE_ALERT_THRESHOLDS') {
      const updated = updateAlertThresholds(body.thresholds || {});
      await createAuditLog({
        userId: admin.id,
        action: 'ADMIN_ALERT_THRESHOLDS_UPDATED',
        entityType: 'ObservabilityConfig',
        details: { thresholds: updated },
        ipAddress,
      });
      const res = NextResponse.json({
        success: true,
        action,
        thresholds: updated,
        requestId,
      });
      return applySecurityHeaders(res, requestId);
    }

    if (action === 'UPDATE_ABUSE_THRESHOLDS') {
      const updated = updateAbuseThresholds(body.thresholds || {});
      await createAuditLog({
        userId: admin.id,
        action: 'ADMIN_ABUSE_THRESHOLDS_UPDATED',
        entityType: 'SecurityConfig',
        details: { thresholds: updated },
        ipAddress,
      });
      const res = NextResponse.json({
        success: true,
        action,
        thresholds: updated,
        requestId,
      });
      return applySecurityHeaders(res, requestId);
    }

    if (action === 'RUN_INTEGRITY_CHECKS') {
      const report = await runDataIntegrityChecks();
      await createAuditLog({
        userId: admin.id,
        action: 'ADMIN_DATA_INTEGRITY_CHECK_EXECUTED',
        entityType: 'DataIntegrity',
        details: {
          healthy: report.healthy,
          totalViolations: report.totalViolations,
          durationMs: report.durationMs,
        },
        ipAddress,
      });
      const res = NextResponse.json({
        success: true,
        action,
        report,
        requestId,
      });
      return applySecurityHeaders(res, requestId);
    }

    if (action === 'CLEAR_CACHE') {
      globalAppCache.clearAll();
      await createAuditLog({
        userId: admin.id,
        action: 'ADMIN_CACHE_CLEARED',
        entityType: 'AppCache',
        details: { stats: globalAppCache.getStats() },
        ipAddress,
      });
      const res = NextResponse.json({
        success: true,
        action,
        cacheStats: globalAppCache.getStats(),
        requestId,
      });
      return applySecurityHeaders(res, requestId);
    }

    if (action === 'UPDATE_FEATURE_FLAG') {
      const key = String(body.key || '') as FeatureFlagKey;
      const enabled = Boolean(body.enabled);
      const reason = String(body.reason || '').trim();
      const auditEntry = setFeatureFlagOverride({
        key,
        enabled,
        actorId: admin.id,
        reason,
      });
      await createAuditLog({
        userId: admin.id,
        action: 'ADMIN_FEATURE_FLAG_UPDATED',
        entityType: 'FeatureFlag',
        entityId: key,
        details: auditEntry as unknown as Record<string, unknown>,
        ipAddress,
      });
      const res = NextResponse.json({
        success: true,
        action,
        auditEntry,
        featureFlags: getFeatureFlagsSnapshot(),
        requestId,
      });
      return applySecurityHeaders(res, requestId);
    }

    if (action === 'RUN_DATA_QUALITY_GATE') {
      const report = await runProductionDataQualityGate();
      await createAuditLog({
        userId: admin.id,
        action: 'ADMIN_DATA_QUALITY_GATE_EXECUTED',
        entityType: 'DataQualityGate',
        details: {
          gatePassed: report.gatePassed,
          criticalViolations: report.criticalViolations,
          warningCount: report.warningCount,
        },
        ipAddress,
      });
      const res = NextResponse.json({
        success: true,
        action,
        report,
        requestId,
      });
      return applySecurityHeaders(res, requestId);
    }

    if (action === 'RUN_SMOKE_TESTS') {
      const report = await runProductionSmokeTests();
      await createAuditLog({
        userId: admin.id,
        action: 'ADMIN_SMOKE_TESTS_EXECUTED',
        entityType: 'SmokeTestSuite',
        details: {
          allPassed: report.allPassed,
          passedCount: report.passedCount,
          failedCount: report.failedCount,
        },
        ipAddress,
      });
      const res = NextResponse.json({
        success: true,
        action,
        report,
        requestId,
      });
      return applySecurityHeaders(res, requestId);
    }

    if (action === 'EVALUATE_LAUNCH_GATE') {
      const evaluation = await evaluateProductionLaunchGate();
      await createAuditLog({
        userId: admin.id,
        action: 'ADMIN_LAUNCH_GATE_EVALUATED',
        entityType: 'LaunchGate',
        details: {
          overallStatus: evaluation.overallStatus,
          canLaunchToProduction: evaluation.canLaunchToProduction,
        },
        ipAddress,
      });
      const res = NextResponse.json({
        success: true,
        action,
        evaluation,
        requestId,
      });
      return applySecurityHeaders(res, requestId);
    }

    if (action === 'RUN_WORKER_JOB') {
      const jobKey = String(body.jobKey || '') as WorkerJobKey;
      const execution = await executeScheduledWorkerJob({
        jobKey,
        requestedBatchSize: typeof body.batchSize === 'number' ? body.batchSize : undefined,
      });
      await createAuditLog({
        userId: admin.id,
        action: 'ADMIN_WORKER_JOB_TRIGGERED',
        entityType: 'WorkerJob',
        entityId: jobKey,
        details: execution as unknown as Record<string, unknown>,
        ipAddress,
      });
      const res = NextResponse.json({
        success: true,
        action,
        execution,
        requestId,
      });
      return applySecurityHeaders(res, requestId);
    }

    throw new AppSecurityError(
      'VALIDATION_ERROR',
      'Invalid observability action.',
      400
    );
  } catch (err) {
    const safeRes = createSafeErrorResponse(err, {
      defaultMessage: 'Failed to execute observability action',
      requestId,
    });
    recordHttpRequestMetric({
      route: '/api/admin/observability',
      method: 'POST',
      statusCode: safeRes.status,
      durationMs: Date.now() - startMs,
      requestId,
    });
    return safeRes;
  }
}
