// src/app/api/health/db/route.ts
// DB Healthcheck Endpoint: executes real queries to verify Supabase connectivity and tracks SRE latency.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = performance.now();
  
  try {
    // Perform a lightweight, high-performance query to prove read access
    const queryStart = performance.now();
    const { data, error } = await supabaseAdmin
      .from('worker_locks')
      .select('worker_name')
      .limit(1);

    const queryLatencyMs = Math.round(performance.now() - queryStart);
    const totalDurationMs = Math.round(performance.now() - startTime);

    if (error) {
      logger.error('DB healthcheck failed: Query returned database error', {
        latency_ms: queryLatencyMs,
        error: error.message,
      });

      return NextResponse.json({
        status: 'DOWN',
        timestamp: new Date().toISOString(),
        latency_ms: totalDurationMs,
        details: {
          error: error.message,
          code: error.code,
        }
      }, { status: 503 });
    }

    logger.debug('DB healthcheck completed successfully', {
      query_latency_ms: queryLatencyMs,
      total_latency_ms: totalDurationMs,
    });

    return NextResponse.json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      latency_ms: totalDurationMs,
      details: {
        database_type: 'Supabase PostgreSQL',
        query_latency_ms: queryLatencyMs,
        connection: 'Healthy',
      }
    }, { status: 200 });

  } catch (err: any) {
    const totalDurationMs = Math.round(performance.now() - startTime);
    logger.error('DB healthcheck crashed unexpectedly', { error: err.message });

    return NextResponse.json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      latency_ms: totalDurationMs,
      details: {
        error: err.message || 'Unexpected exception',
      }
    }, { status: 500 });
  }
}
