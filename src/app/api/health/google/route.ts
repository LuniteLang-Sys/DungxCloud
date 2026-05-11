// src/app/api/health/google/route.ts
// Google Drive API Healthcheck Endpoint: Probes Google OAuth and API servers with authentic requests.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDriveClient, decrypt } from '@/lib/google';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = performance.now();

  try {
    // 1. Resolve first active Google Account in database to test actual client connections
    const { data: account, error: accountErr } = await supabaseAdmin
      .from('accounts')
      .select('id, email, refresh_token')
      .eq('token_status', 'active')
      .eq('health_status', 'healthy')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (accountErr) {
      throw new Error(`Database account query error: ${accountErr.message}`);
    }

    if (!account || !account.refresh_token) {
      logger.warn('Google Drive API health check skipped: No active/healthy storage accounts are configured');
      return NextResponse.json({
        status: 'DEGRADED',
        timestamp: new Date().toISOString(),
        latency_ms: Math.round(performance.now() - startTime),
        details: {
          warning: 'No healthy Google accounts registered. Add accounts to active checking.',
        }
      }, { status: 200 });
    }

    // 2. Setup Google Drive API client and perform lightweight probe
    const driveStart = performance.now();
    const drive = getDriveClient(account.refresh_token);
    
    const googleRes = await drive.about.get({
      fields: 'kind, user',
    });

    const googleLatencyMs = Math.round(performance.now() - driveStart);
    const totalLatencyMs = Math.round(performance.now() - startTime);

    if (googleRes.status !== 200) {
      logger.error('Google Drive API probe returned failure code', {
        google_status: googleRes.status,
        google_account: account.email,
        latency_ms: googleLatencyMs,
      });

      return NextResponse.json({
        status: 'DOWN',
        timestamp: new Date().toISOString(),
        latency_ms: totalLatencyMs,
        details: {
          google_account: account.email,
          google_status_code: googleRes.status,
          error: 'Google Drive API returned non-200 code',
        }
      }, { status: 503 });
    }

    logger.debug('Google Drive API probe completed successfully', {
      google_latency_ms: googleLatencyMs,
      total_latency_ms: totalLatencyMs,
    });

    return NextResponse.json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      latency_ms: totalLatencyMs,
      details: {
        google_account_probe: account.email,
        google_api_status: 'Connected',
        google_latency_ms: googleLatencyMs,
        kind: googleRes.data.kind,
      }
    }, { status: 200 });

  } catch (err: any) {
    const totalLatencyMs = Math.round(performance.now() - startTime);
    logger.error('Google Drive API health probe crashed', { error: err.message });

    return NextResponse.json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      latency_ms: totalLatencyMs,
      details: {
        error: err.message || 'Google API network probe failure',
        status_code: err.status || 500,
      }
    }, { status: 500 });
  }
}
