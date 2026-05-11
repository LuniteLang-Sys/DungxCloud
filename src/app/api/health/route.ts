// src/app/api/health/route.ts
// Central Aggregated Health Gateway Router: queries all subcomponents in parallel to minimize latency.

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const startTime = performance.now();
  const { origin } = new URL(request.url);

  try {
    // Fire sub-healthcheck HTTP queries in parallel to ensure complete non-blocking execution
    const endpoints = [
      { name: 'database', url: `${origin}/api/health/db` },
      { name: 'storage', url: `${origin}/api/health/storage` },
      { name: 'google_api', url: `${origin}/api/health/google` }
    ];

    const results = await Promise.all(
      endpoints.map(async (ep) => {
        const epStart = performance.now();
        try {
          const res = await fetch(ep.url, {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' },
            next: { revalidate: 0 }
          });
          const latencyMs = Math.round(performance.now() - epStart);
          const data = await res.json().catch(() => ({}));
          
          return {
            component: ep.name,
            status: res.ok ? (data.status || 'UP') : 'DOWN',
            status_code: res.status,
            latency_ms: latencyMs,
            details: data.details || {},
          };
        } catch (fetchErr: any) {
          return {
            component: ep.name,
            status: 'DOWN',
            status_code: 500,
            latency_ms: Math.round(performance.now() - epStart),
            details: { error: fetchErr.message || 'Network fetch crashed' }
          };
        }
      })
    );

    const isAnyDown = results.some(r => r.status === 'DOWN');
    const isAnyDegraded = results.some(r => r.status === 'DEGRADED');

    const aggregateStatus = isAnyDown 
      ? 'DOWN' 
      : isAnyDegraded 
        ? 'DEGRADED' 
        : 'UP';

    const totalDurationMs = Math.round(performance.now() - startTime);

    logger.info(`Global Healthcheck processed: ${aggregateStatus}`, {
      aggregate_status: aggregateStatus,
      total_duration_ms: totalDurationMs,
      components_latencies: results.map(r => `${r.component}=${r.latency_ms}ms`).join(', ')
    });

    const payload = {
      status: aggregateStatus,
      timestamp: new Date().toISOString(),
      total_latency_ms: totalDurationMs,
      components: results,
    };

    return NextResponse.json(
      payload, 
      { status: aggregateStatus === 'DOWN' ? 503 : 200 }
    );

  } catch (err: any) {
    const totalDurationMs = Math.round(performance.now() - startTime);
    logger.error('Aggregated Healthcheck router crashed', { error: err.message });

    return NextResponse.json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      latency_ms: totalDurationMs,
      error: err.message || 'Central health aggregator error'
    }, { status: 500 });
  }
}
