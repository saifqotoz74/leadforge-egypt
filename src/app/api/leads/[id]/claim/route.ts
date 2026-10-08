import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { claimLeadForDeveloper, LeadServiceError } from '@/lib/lead-service';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const user = await requireAuth(req);
    const rl = checkRateLimit({ key: `claim:${user.id}`, limit: 30, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'تم تجاوز الحد المسموح به للطلبات. يرجى الانتظار قليلاً.' },
        { status: 429 }
      );
    }

    const result = await claimLeadForDeveloper({
      prisma,
      userId: user.id,
      leadId: params.id,
    });

    return NextResponse.json({
      success: true,
      claim: result.claim,
      lead: result.lead,
      remainingCredits: result.remainingCredits,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof LeadServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    console.error('POST /api/leads/[id]/claim error:', err);
    return NextResponse.json({ error: 'تعذر اقتناص الفرصة.' }, { status: 500 });
  }
}
