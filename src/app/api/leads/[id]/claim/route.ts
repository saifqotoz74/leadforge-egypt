import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { claimLead, ClaimEngineError } from '@/lib/claims';
import { LeadServiceError } from '@/lib/lead-service';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { recordClaimMetric } from '@/lib/observability';
import { applySecurityHeaders, recordSecuritySignal } from '@/lib/security';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let activeUserId: string | null = null;
  const ipAddress = getClientIp(req.headers);

  try {
    if (!verifyCsrfOrigin(req)) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'طلب غير مصرح به (CSRF).', code: 'FORBIDDEN' },
          { status: 403 }
        )
      );
    }

    const user = await requireAuth(req);
    activeUserId = user.id;

    const rlUser = checkRateLimit({ key: `claim:user:${user.id}`, limit: 30, windowMs: 60_000 });
    const rlIp = checkRateLimit({ key: `claim:ip:${ipAddress}`, limit: 60, windowMs: 60_000 });
    if (!rlUser.allowed || !rlIp.allowed) {
      await recordSecuritySignal({
        signalType: 'REPEATED_FAILED_CLAIMS',
        userId: user.id,
        ipAddress,
        details: { leadId: params.id, reason: 'RATE_LIMITED' },
      });
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: 'Rate limit exceeded — تم تجاوز الحد المسموح به للطلبات.',
            code: 'RATE_LIMIT_EXCEEDED',
          },
          { status: 429 }
        )
      );
    }

    let bodyIdempotencyKey: unknown = undefined;
    try {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await req.json();
        if (body && typeof body === 'object' && 'idempotencyKey' in body) {
          bodyIdempotencyKey = (body as Record<string, unknown>).idempotencyKey;
        }
      }
    } catch {
      // Optional JSON body
    }

    const rawHeaderKey =
      req.headers.get('Idempotency-Key') ?? req.headers.get('idempotency-key');
    const idempotencyKey =
      rawHeaderKey !== null ? rawHeaderKey : (bodyIdempotencyKey as string | undefined);

    const result = await claimLead({
      leadId: params.id,
      developerId: user.id,
      idempotencyKey,
      ipAddress,
    });

    recordClaimMetric('SUCCESS');

    const claimRecord = await prisma.leadClaim.findUnique({
      where: { id: result.claimId },
    });

    return applySecurityHeaders(
      NextResponse.json({
        ...result,
        claim: claimRecord,
      })
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: err.message,
            code: err.statusCode === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
          },
          { status: err.statusCode }
        )
      );
    }
    if (err instanceof ClaimEngineError) {
      const upperCode = err.code.toUpperCase();
      if (upperCode.includes('CONFLICT') || upperCode.includes('ALREADY_CLAIMED')) {
        recordClaimMetric('CONFLICT');
      } else {
        recordClaimMetric('FAILED');
      }

      await recordSecuritySignal({
        signalType: 'REPEATED_FAILED_CLAIMS',
        userId: activeUserId,
        ipAddress,
        details: { leadId: params.id, errorCode: err.code },
      });

      if (
        upperCode.includes('UNAVAILABLE') ||
        upperCode.includes('CLAIMED') ||
        upperCode.includes('MAX_PURCHASERS') ||
        upperCode.includes('NOT_SALEABLE') ||
        upperCode.includes('STALE')
      ) {
        await recordSecuritySignal({
          signalType: 'UNAVAILABLE_LEAD_CLAIM_SPAM',
          userId: activeUserId,
          ipAddress,
          details: { leadId: params.id, errorCode: err.code },
        });
      }

      return applySecurityHeaders(
        NextResponse.json(
          {
            error: err.message,
            code: err.code,
            details: err.details,
          },
          { status: err.statusCode }
        )
      );
    }
    if (err instanceof LeadServiceError) {
      recordClaimMetric('FAILED');
      return applySecurityHeaders(
        NextResponse.json(
          { error: err.message, code: err.code, details: err.details },
          { status: err.statusCode }
        )
      );
    }
    recordClaimMetric('FAILED');
    console.error('POST /api/leads/[id]/claim error:', err);
    return applySecurityHeaders(
      NextResponse.json(
        { error: 'تعذر اقتناص الفرصة.', code: 'INTERNAL_CLAIM_ERROR' },
        { status: 500 }
      )
    );
  }
}
