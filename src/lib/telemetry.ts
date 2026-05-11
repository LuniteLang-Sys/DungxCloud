// src/lib/telemetry.ts
// Telemetry and Context Propagation Helpers implementing W3C Trace Context specifications.
// format: 00-{traceId}-{spanId}-{traceFlags}

export interface TraceContext {
  traceId: string;
  spanId: string;
}

/**
 * Generates a standard cryptographically random W3C compliant TraceContext
 * Utilizes web-standard globalThis.crypto to remain fully compatible with Edge runtimes.
 */
export function generateTraceContext(): TraceContext {
  const bytes16 = new Uint8Array(16);
  const bytes8 = new Uint8Array(8);
  
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes16);
    globalThis.crypto.getRandomValues(bytes8);
  } else {
    // Hard fallback for environments lacking standard crypto support
    for (let i = 0; i < 16; i++) {
      bytes16[i] = Math.floor(Math.random() * 256);
    }
    for (let i = 0; i < 8; i++) {
      bytes8[i] = Math.floor(Math.random() * 256);
    }
  }
  
  const traceId = Array.from(bytes16).map(b => b.toString(16).padStart(2, '0')).join('');
  const spanId = Array.from(bytes8).map(b => b.toString(16).padStart(2, '0')).join('');
  
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
  let requestId = headers.get('x-request-id');
  if (!requestId) {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      requestId = globalThis.crypto.randomUUID();
    } else {
      requestId = 'req-' + Math.random().toString(36).substring(2, 11);
    }
  }
  
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

