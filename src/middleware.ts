// src/middleware.ts
// Next.js Global Middleware: Handles route protection, Correlation IDs generation,
// W3C Trace context propagation, and request/response telemetry.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { generateTraceContext, formatTraceparent } from '@/lib/telemetry';
import { logger } from '@/lib/logger';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const method = request.method;

  // 1. Trace parent-child context establishment
  const traceparentHeader = request.headers.get('traceparent');
  let traceId: string;
  let spanId: string;

  if (traceparentHeader) {
    const parts = traceparentHeader.split('-');
    traceId = parts[1] || '';
    spanId = parts[2] || '';
  } else {
    const context = generateTraceContext();
    traceId = context.traceId;
    spanId = context.spanId;
  }

  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  // Establish trace headers for propagation to downstream API routes
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('traceparent', formatTraceparent({ traceId, spanId }));

  const isDashboardRoute = path.startsWith('/dashboard');
  const isApiRoute = path.startsWith('/api/');
  const isPublicApiRoute = 
    path.startsWith('/api/auth') || 
    path.startsWith('/api/health') || 
    path.startsWith('/api/metrics'); // Exclude auth callbacks, health pings, and Prometheus metrics

  let userEmail = 'anonymous';

  // 2. Security Authentication Boundary
  if (isDashboardRoute || (isApiRoute && !isPublicApiRoute)) {
    const sessionToken = request.cookies.get('admin_session')?.value;
    
    if (!sessionToken) {
      logger.warn('Unauthorized routing request blocked', {
        trace_id: traceId,
        span_id: spanId,
        request_id: requestId,
        request_path: path,
        request_method: method,
        reason: 'Missing admin session token',
      });

      return isApiRoute
        ? NextResponse.json({ error: 'Unauthorized access token' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url));
    }

    const payload = await verifyToken(sessionToken);
    if (!payload) {
      logger.warn('Unauthorized routing request blocked', {
        trace_id: traceId,
        span_id: spanId,
        request_id: requestId,
        request_path: path,
        request_method: method,
        reason: 'Expired or malformed session payload',
      });

      return isApiRoute
        ? NextResponse.json({ error: 'Invalid session payload' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url));
    }

    userEmail = (payload as any).email || 'admin';
  }

  // Log request entrance
  logger.info(`HTTP Request Received: ${method} ${path}`, {
    trace_id: traceId,
    span_id: spanId,
    request_id: requestId,
    request_path: path,
    request_method: method,
    user: userEmail,
  });

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Echo trace and correlation IDs back in the response headers for client visibility
  response.headers.set('x-request-id', requestId);
  response.headers.set('traceparent', formatTraceparent({ traceId, spanId }));

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/:path*',
  ],
};
