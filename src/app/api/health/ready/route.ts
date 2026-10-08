import { NextRequest, NextResponse } from 'next/server';
import {
  evaluateReadinessCheck,
  getOrGenerateRequestId,
  recordHttpRequestMetric,
} from '@/lib/observability';
import { applySecurityHeaders } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const startMs = Date.now();
  const requestId = getOrGenerateRequestId(req.headers);
  const report = await evaluateReadinessCheck();
  const statusCode = report.ready ? 200 : 503;

  recordHttpRequestMetric({
    route: '/api/health/ready',
    method: 'GET',
    statusCode,
    durationMs: Date.now() - startMs,
    requestId,
  });

  const res = NextResponse.json(
    {
      ...report,
      requestId,
    },
    { status: statusCode }
  );
  return applySecurityHeaders(res, requestId);
}
