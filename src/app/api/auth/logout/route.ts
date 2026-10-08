import { NextRequest, NextResponse } from 'next/server';
import { revokeSessionToken, SESSION_COOKIE_NAME, verifyCsrfOrigin } from '@/lib/auth';
import { applySecurityHeaders } from '@/lib/security';

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req)) {
    return applySecurityHeaders(
      NextResponse.json(
        { error: 'طلب غير مصرح به (CSRF).', code: 'FORBIDDEN' },
        { status: 403 }
      )
    );
  }
  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const activeToken = cookieToken || bearerToken;
  if (activeToken) {
    revokeSessionToken(activeToken);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return applySecurityHeaders(response);
}
