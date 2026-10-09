import { NextResponse } from 'next/server';
import { evaluateReadinessCheck } from '@/lib/observability/shutdown';

export const dynamic = 'force-dynamic';

export async function GET() {
  const report = await evaluateReadinessCheck();

  const payload = {
    status: report.ready ? 'ok' : 'degraded',
    environment: report.environment,
    version: report.version,
    checkedAt: report.checkedAt,
    checks: {
      database: report.checks.database.status,
      configuration: report.checks.configuration.status,
      processLifecycle: report.checks.processLifecycle.status,
      jobQueue: report.checks.jobQueue.status,
    },
  };

  return NextResponse.json(payload, {
    status: report.ready ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
