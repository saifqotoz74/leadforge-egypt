import { NextRequest, NextResponse } from 'next/server';
import { executeScheduledWorkerJob, type WorkerJobKey, WORKER_JOB_DEFINITIONS } from '@/lib/production';
import { getOrGenerateRequestId, recordHttpRequestMetric } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const startMs = Date.now();
  const requestId = getOrGenerateRequestId(req.headers);

  try {
    // 1. Authenticate with CRON_SECRET
    const expectedSecret = process.env.CRON_SECRET?.trim();
    const authHeader = req.headers.get('authorization')?.trim();
    const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';

    if (expectedSecret) {
      if (authHeader !== `Bearer ${expectedSecret}`) {
        recordHttpRequestMetric({
          route: '/api/cron/worker',
          method: 'GET',
          statusCode: 401,
          durationMs: Date.now() - startMs,
          requestId,
        });
        return NextResponse.json(
          { error: 'Unauthorized: Invalid or missing Bearer token in Authorization header', requestId },
          { status: 401 }
        );
      }
    } else if (isProduction) {
      recordHttpRequestMetric({
        route: '/api/cron/worker',
        method: 'GET',
        statusCode: 500,
        durationMs: Date.now() - startMs,
        requestId,
      });
      return NextResponse.json(
        { error: 'Configuration Error: CRON_SECRET is required in production', requestId },
        { status: 500 }
      );
    }

    // 2. Parse job parameter
    const { searchParams } = new URL(req.url);
    const jobKeyParam = searchParams.get('job')?.trim();

    // Special handler for Vercel Hobby plan (single daily maintenance run)
    if (jobKeyParam === 'daily_maintenance') {
      const maintenanceJobs: WorkerJobKey[] = [
        'ingestion_scheduled_sync',
        'verification_batch_refresh',
        'scoring_recalculation_batch',
        'analytics_daily_snapshot',
        'stale_lead_lifecycle_sweep',
      ];

      const executions: Record<string, unknown> = {};
      let hasFailure = false;

      for (const key of maintenanceJobs) {
        try {
          const res = await executeScheduledWorkerJob({ jobKey: key });
          executions[key] = res;
          if (res.status === 'FAILED') hasFailure = true;
        } catch (err: any) {
          executions[key] = { status: 'FAILED', error: err?.message };
          hasFailure = true;
        }
      }

      recordHttpRequestMetric({
        route: '/api/cron/worker',
        method: 'GET',
        statusCode: hasFailure ? 500 : 200,
        durationMs: Date.now() - startMs,
        requestId,
      });

      return NextResponse.json(
        {
          success: !hasFailure,
          jobKey: 'daily_maintenance',
          executions,
          requestId,
        },
        {
          status: hasFailure ? 500 : 200,
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        }
      );
    }

    if (!jobKeyParam || !WORKER_JOB_DEFINITIONS[jobKeyParam as WorkerJobKey]) {
      const availableJobs = [...Object.keys(WORKER_JOB_DEFINITIONS), 'daily_maintenance'];
      recordHttpRequestMetric({
        route: '/api/cron/worker',
        method: 'GET',
        statusCode: 400,
        durationMs: Date.now() - startMs,
        requestId,
      });
      return NextResponse.json(
        {
          error: `Invalid or missing job parameter. Available jobs: ${availableJobs.join(', ')}`,
          requestId,
        },
        { status: 400 }
      );
    }

    const batchSizeParam = searchParams.get('batchSize');
    const requestedBatchSize = batchSizeParam ? parseInt(batchSizeParam, 10) : undefined;

    // 3. Execute worker job
    const result = await executeScheduledWorkerJob({
      jobKey: jobKeyParam as WorkerJobKey,
      requestedBatchSize: Number.isFinite(requestedBatchSize) ? requestedBatchSize : undefined,
    });

    recordHttpRequestMetric({
      route: '/api/cron/worker',
      method: 'GET',
      statusCode: result.status === 'FAILED' ? 500 : 200,
      durationMs: Date.now() - startMs,
      requestId,
    });

    return NextResponse.json(
      {
        success: result.status !== 'FAILED',
        jobKey: jobKeyParam,
        execution: result,
        requestId,
      },
      {
        status: result.status === 'FAILED' ? 500 : 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    recordHttpRequestMetric({
      route: '/api/cron/worker',
      method: 'GET',
      statusCode: 500,
      durationMs: Date.now() - startMs,
      requestId,
    });
    return NextResponse.json(
      {
        error: error?.message || 'Worker execution failed',
        requestId,
      },
      { status: 500 }
    );
  }
}
