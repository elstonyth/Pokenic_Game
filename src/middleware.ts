import { NextRequest, NextResponse } from 'next/server';
import { buildCsp } from '@/lib/security/csp';

// Per-request nonce so Next can nonce its own inline bootstrap scripts. We set
// the CSP on the REQUEST headers (Next reads it there to nonce scripts) and on
// the RESPONSE headers (the browser enforces it).
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Skip static assets + the image optimizer; they don't execute scripts and
  // re-noncing them only adds latency.
  matcher: [
    {
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?)$).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
