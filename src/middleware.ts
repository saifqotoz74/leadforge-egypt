import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PROTECTED_PREFIXES = [
  '/admin',
  '/dashboard',
  '/pipeline',
  '/credits',
  '/settings',
  '/my-leads',
];

function getEdgeSecretKey(): Uint8Array {
  const authSecret = process.env.AUTH_SECRET?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const candidate =
    authSecret && authSecret !== 'leadforge-egypt-local-dev-secret-change-in-production-32chars'
      ? authSecret
      : jwtSecret && jwtSecret !== 'leadforge-egypt-local-dev-secret-change-in-production-32chars'
      ? jwtSecret
      : authSecret || jwtSecret;

  if (process.env.NODE_ENV === 'production') {
    if (!candidate || candidate === 'leadforge-egypt-local-dev-secret-change-in-production-32chars' || candidate.length < 32) {
      throw new Error(
        'Production AUTH_SECRET must be configured with a strong secret (at least 32 characters) and cannot use default dev secret.'
      );
    }
    return new TextEncoder().encode(candidate);
  }

  return new TextEncoder().encode(candidate || 'leadforge-egypt-local-dev-secret-change-in-production-32chars');
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';

  // Enforce canonical www host via 301 permanent redirect
  if (host === 'leads4dev.com') {
    const redirectUrl = new URL(request.url);
    redirectUrl.host = 'www.leads4dev.com';
    redirectUrl.protocol = 'https:';
    return NextResponse.redirect(redirectUrl, { status: 301 });
  }

  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');

  // In production, block or ignore ?fixtures=true on /dashboard
  if (
    process.env.NODE_ENV === 'production' &&
    (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) &&
    request.nextUrl.searchParams.has('fixtures')
  ) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete('fixtures');
    return NextResponse.redirect(cleanUrl, { status: 307 });
  }

  // In development, allow unauthenticated access to /dashboard if ?fixtures=true
  const isDevFixturesMode =
    process.env.NODE_ENV !== 'production' &&
    (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) &&
    request.nextUrl.searchParams.get('fixtures') === 'true';

  // Edge Route Guarding for protected paths (excluding API routes which manage their own JSON auth, and dev fixtures mode)
  const isProtectedRoute =
    !isApiRoute &&
    !isDevFixturesMode &&
    PROTECTED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

  if (isProtectedRoute) {
    let token = request.cookies.get('leadforge_session')?.value;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }

    let sessionPayload: { userId?: string; role?: string } | null = null;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, getEdgeSecretKey());
        if (payload.userId && payload.role) {
          sessionPayload = payload as { userId?: string; role?: string };
        }
      } catch {
        sessionPayload = null;
      }
    }

    // If unauthenticated, redirect (307) to /login?from=${pathname}
    if (!sessionPayload) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl, { status: 307 });
    }

    // If accessing /admin/:path* and user role is not 'ADMIN', redirect (307) to /dashboard
    const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
    if (isAdminRoute && sessionPayload.role !== 'ADMIN') {
      const dashboardUrl = new URL('/dashboard', request.url);
      return NextResponse.redirect(dashboardUrl, { status: 307 });
    }
  }

  const url = request.nextUrl.clone();

  // Query param locale support (?locale=en or ?locale=ar)
  const localeParam = url.searchParams.get('locale');
  const requestHeaders = new Headers(request.headers);

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (localeParam === 'en' || localeParam === 'ar') {
    requestHeaders.set('x-lf-locale', localeParam);
    response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    // Set cookie for client continuity
    response.cookies.set('lf_locale', localeParam, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - icon.svg, favicon.ico (favicon files)
     */
    '/((?!_next/static|_next/image|icon\\.svg|favicon\\.ico).*)',
  ],
};
