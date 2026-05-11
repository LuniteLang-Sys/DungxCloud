// src/app/api/metrics/collect/route.ts
// Central telemetry gateway receiving high-frequency metric payloads and React exception logs from frontend browser clients.

import { NextRequest, NextResponse } from 'next/server';
import { metricsRegistry } from '@/lib/metrics';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { events } = body;

    if (!Array.isArray(events)) {
      return NextResponse.json({ error: 'Payload must contain a valid events array' }, { status: 400 });
    }

    for (const event of events) {
      const { type, labels, amount } = event;
      if (!type) continue;

      const incAmount = typeof amount === 'number' ? amount : 1;

      switch (type) {
        case 'upload_attempt':
          metricsRegistry.uploadAttempts.inc(labels, incAmount);
          break;
        case 'chunk_retry':
          metricsRegistry.chunkRetryCount.inc(labels, incAmount);
          break;
        case 'upload_recovery':
          metricsRegistry.uploadRecoveryCount.inc(labels, incAmount);
          break;
        case 'download_attempt':
          metricsRegistry.downloadAttempts.inc(labels, incAmount);
          break;
        case 'download_interruption':
          metricsRegistry.downloadInterruptions.inc(labels, incAmount);
          break;
        case 'download_token_failure':
          metricsRegistry.downloadTokenFailures.inc(labels, incAmount);
          break;
        case 'download_corruption':
          metricsRegistry.downloadCorruptions.inc(labels, incAmount);
          break;
        case 'frontend_crash':
          metricsRegistry.frontendUiCrashes.inc(labels, incAmount);
          logger.error('Frontend application UI crash detected by React Error Boundary', {
            event_type: type,
            ...labels,
          });
          break;
        case 'frontend_hydration_error':
          metricsRegistry.frontendHydrationErrors.inc(labels, incAmount);
          logger.warn('Frontend Next.js hydration error mismatch caught', {
            event_type: type,
            ...labels,
          });
          break;
        case 'frontend_failed_optimistic_update':
          metricsRegistry.frontendFailedOptimisticUpdates.inc(labels, incAmount);
          break;
        default:
          logger.warn('Unknown telemetry event type ignored', { event_type: type, labels });
      }
    }

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (err: any) {
    logger.error('Failed to collect telemetry event payloads', { error: err.message });
    return NextResponse.json({ error: 'Failed to process events', details: err.message }, { status: 500 });
  }
}
