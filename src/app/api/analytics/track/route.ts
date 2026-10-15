import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { recordFunnelMilestone, FunnelEventType } from '@/lib/analytics';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const VALID_FUNNEL_EVENTS = new Set<FunnelEventType>([
  'page_view',
  'register_start',
  'register_complete',
  'first_free_lead_viewed',
  'first_purchase',
  'plan_upgrade',
]);

export async function POST(req: NextRequest) {
  try {
    const ipAddress = getClientIp(req.headers);
    const rl = checkRateLimit({
      key: `analytics-track:${ipAddress || 'unknown'}`,
      limit: 120,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const body = await req.json();
    const { event, properties, path, anonymousId } = body;

    if (!event || !VALID_FUNNEL_EVENTS.has(event)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
    }

    const session = await getSessionFromRequest(req);
    const userId = session?.userId || null;

    await recordFunnelMilestone(
      event,
      userId,
      {
        ...properties,
        path,
        anonymousId,
      },
      ipAddress
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to process event' }, { status: 500 });
  }
}
