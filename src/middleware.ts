import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
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
