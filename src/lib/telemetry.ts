// src/lib/telemetry.ts
// Telemetry and Context Propagation Helpers implementing W3C Trace Context specifications.
// format: 00-{traceId}-{spanId}-{traceFlags}

import crypto from 'crypto';

export interface TraceContext {
  traceId: string;
  spanId: string;
}

/**
 * Generates a standard cryptographically random W3C compliant TraceContext
 */
export function generateTraceContext(): TraceContext {
  // 16 bytes for trace ID (32 hex characters)
  const traceId = crypto.randomBytes(16).toString('hex');
  // 8 bytes for span ID (16 hex characters)
  const spanId = crypto.randomBytes(8).toString('hex');
  return { traceId, spanId };
}

/**
 * Parses a standard W3C 'traceparent' header string
 * e.g. "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
 */
export function parseTraceparent(traceparent: string | null): TraceContext | null {
  if (!traceparent) return null;
  
  const parts = traceparent.trim().split('-');
  if (parts.length < 3) return null;
  
  // W3C format validation: version must be '00' for draft, followed by 32 hex and 16 hex characters
  const [version, traceId, spanId] = parts;
  if (version !== '00') return null;
  if (traceId.length !== 32 || spanId.length !== 16) return null;
  
  return {
    traceId,
    spanId,
  };
}

/**
 * Formats a TraceContext into a valid W3C 'traceparent' header string
 */
export function formatTraceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-01`;
}

/**
 * Extracts correlation IDs from standard Next.js request headers or creates a fresh trace
 */
export function extractTraceContext(headers: Headers): { trace_id: string; span_id: string; request_id: string } {
  const requestId = headers.get('x-request-id') || crypto.randomUUID();
  const traceparent = headers.get('traceparent');
  
  const parsed = parseTraceparent(traceparent);
  if (parsed) {
    return {
      trace_id: parsed.traceId,
      span_id: parsed.spanId,
      request_id: requestId,
    };
  }
  
  // Fallback: Check custom request-id to derive traceId safely
  const freshContext = generateTraceContext();
  return {
    trace_id: freshContext.traceId,
    span_id: freshContext.spanId,
    request_id: requestId,
  };
}
