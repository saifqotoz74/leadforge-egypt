import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processPaymentWebhookEvent } from '@/lib/payment/provider';
import { isFeatureFlagEnabled } from '@/lib/production/feature-flags';
import { applySecurityHeaders, createSafeErrorResponse } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!isFeatureFlagEnabled('payment_webhooks_enabled')) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: 'PAYMENT_WEBHOOKS_DISABLED',
            message: 'Payment webhook processing is temporarily disabled.',
          },
          { status: 503 }
        )
      );
    }

    const rawBody = await req.text();
    if (rawBody.length > 256 * 1024) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: 'PAYLOAD_TOO_LARGE',
            message: 'Webhook payload exceeds maximum allowed size.',
          },
          { status: 413 }
        )
      );
    }

    const signatureHeader =
      req.headers.get('x-webhook-signature') || req.headers.get('x-leadforge-signature');
    const timestampHeader =
      req.headers.get('x-webhook-timestamp') || req.headers.get('x-leadforge-timestamp');

    const result = await processPaymentWebhookEvent({
      prisma,
      rawBody,
      signatureHeader,
      timestampHeader,
    });

    return applySecurityHeaders(NextResponse.json(result, { status: result.httpStatus }));
  } catch (err) {
    return createSafeErrorResponse(err, {
      defaultMessage: 'Failed to process payment webhook',
    });
  }
}
