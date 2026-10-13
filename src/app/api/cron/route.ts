import { NextRequest, NextResponse } from 'next/server';
import {
  executeScheduledWorkerJob,
  WORKER_JOB_DEFINITIONS,
  WorkerJobKey,
} from '@/lib/production/scheduler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Max execution time for Vercel functions

const VALID_JOB_KEYS = new Set<string>(Object.keys(WORKER_JOB_DEFINITIONS));

/**
 * Vercel Cron Endpoint.
 * Vercel automatically sends an `Authorization: Bearer <CRON_SECRET>` header.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  // Enforce CRON_SECRET authentication in production
  if (process.env.NODE_ENV === 'production') {
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET is not configured on this deployment' },
        { status: 503 }
      );
    }

    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing Bearer token' },
        { status: 401 }
      );
    }
  }

  const { searchParams } = new URL(req.url);
  const requestedJob = searchParams.get('job');

  try {
    if (requestedJob) {
      if (!VALID_JOB_KEYS.has(requestedJob)) {
        return NextResponse.json(
          {
            error: `Invalid job key: ${requestedJob}`,
            availableJobs: Array.from(VALID_JOB_KEYS),
          },
          { status: 400 }
        );
      }

      const result = await executeScheduledWorkerJob({
        jobKey: requestedJob as WorkerJobKey,
      });

      return NextResponse.json({
        success: result.status === 'COMPLETED',
        executedJob: requestedJob,
        result,
      });
    }

    // If no specific job is requested, run the routine maintenance cycle
    const routineJobs: WorkerJobKey[] = [
      'stale_lead_lifecycle_sweep',
      'verification_batch_refresh',
      'dead_letter_retention_cleanup',
    ];

    const results = [];
    for (const jobKey of routineJobs) {
      const res = await executeScheduledWorkerJob({ jobKey });
      results.push(res);
    }

    return NextResponse.json({
      success: true,
      mode: 'routine_cycle',
      jobsExecuted: results.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'CRON_EXECUTION_FAILED',
        message: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
