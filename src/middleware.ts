import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard');
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
  const isPublicApiRoute = request.nextUrl.pathname.startsWith('/api/auth'); // exclude login/logout

  if (isDashboardRoute || (isApiRoute && !isPublicApiRoute)) {
    const sessionToken = request.cookies.get('admin_session')?.value;
    if (!sessionToken) {
      return isApiRoute
        ? NextResponse.json({ error: 'Unauthorized access token' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url));
    }

    const payload = await verifyToken(sessionToken);
    if (!payload) {
      return isApiRoute
        ? NextResponse.json({ error: 'Invalid session payload' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/admin/:path*',
    '/api/upload/:path*',
    '/api/download/:path*',
    '/api/files/:path*',
  ],
};
