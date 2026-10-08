import { NextRequest, NextResponse } from 'next/server';
import {
  evaluateLivenessCheck,
  getOrGenerateRequestId,
  recordHttpRequestMetric,
} from '@/lib/observability';
import { applySecurityHeaders } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const startMs = Date.now();
  const requestId = getOrGenerateRequestId(req.headers);
  const report = evaluateLivenessCheck();
  const statusCode = report.alive ? 200 : 503;

  recordHttpRequestMetric({
    route: '/api/health/live',
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
