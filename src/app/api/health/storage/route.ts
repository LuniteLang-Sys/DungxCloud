// src/app/api/health/storage/route.ts
// NAS Storage Pools Healthcheck Endpoint: Aggregates capacity, health, and status across storage shards.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = performance.now();

  try {
    // 1. Query accounts & files summary
    const [accountsRes, filesRes] = await Promise.all([
      supabaseAdmin.from('accounts').select('id, email, remaining_storage, token_status, health_status'),
      supabaseAdmin.from('files').select('size, status')
    ]);

    if (accountsRes.error) {
      throw new Error(`Failed to query accounts: ${accountsRes.error.message}`);
    }

    const accounts = accountsRes.data || [];
    const files = filesRes.data || [];

    // 2. Aggregate capacities
    // Each Google Drive account has roughly 15GB by default (16106127360 bytes)
    const googleAccountCapacityBytes = 15 * 1024 * 1024 * 1024; // 15GB virtual capacity per drive
    const totalCapacityBytes = accounts.length * googleAccountCapacityBytes;

    const remainingStorageBytes = accounts.reduce(
      (acc, curr) => acc + Number(curr.remaining_storage || 0),
      0
    );

    const activeFilesBytes = files
      .filter(f => f.status === 'completed')
      .reduce((acc, curr) => acc + Number(curr.size || 0), 0);

    const activeUploadsCount = files.filter(f => f.status === 'uploading').length;

    // 3. Evaluate account status ratios
    const activeAccounts = accounts.filter(a => a.token_status === 'active' && a.health_status === 'healthy');
    const unhealthyAccounts = accounts.filter(a => a.token_status !== 'active' || a.health_status !== 'healthy');

    const ratioCapacityUsed = totalCapacityBytes > 0 
      ? Number(((totalCapacityBytes - remainingStorageBytes) / totalCapacityBytes).toFixed(4))
      : 0;

    const systemStatus = unhealthyAccounts.length === accounts.length && accounts.length > 0
      ? 'DOWN' // All accounts are broken
      : unhealthyAccounts.length > 0 
        ? 'DEGRADED' // Some accounts are broken, but others work
        : 'UP';

    const durationMs = Math.round(performance.now() - startTime);

    logger.debug('Storage pools healthcheck completed', {
      system_status: systemStatus,
      total_pools: accounts.length,
      unhealthy_pools: unhealthyAccounts.length,
      ratio_used: ratioCapacityUsed,
    });

    return NextResponse.json({
      status: systemStatus,
      timestamp: new Date().toISOString(),
      latency_ms: durationMs,
      details: {
        total_accounts: accounts.length,
        healthy_accounts_count: activeAccounts.length,
        unhealthy_accounts_count: unhealthyAccounts.length,
        virtual_pool: {
          total_capacity_bytes: totalCapacityBytes,
          consumed_bytes: totalCapacityBytes - remainingStorageBytes,
          remaining_bytes: remainingStorageBytes,
          usage_percent: Math.round(ratioCapacityUsed * 100),
        },
        files_database: {
          completed_files_bytes: activeFilesBytes,
          active_uploads_in_progress: activeUploadsCount,
        },
        unhealthy_accounts: unhealthyAccounts.map(a => ({
          email: a.email,
          token_status: a.token_status,
          health_status: a.health_status,
        })),
      }
    }, { status: systemStatus === 'DOWN' ? 503 : 200 });

  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startTime);
    logger.error('Storage healthcheck worker crashed', { error: err.message });

    return NextResponse.json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      latency_ms: durationMs,
      details: {
        error: err.message || 'Storage status compilation failure',
      }
    }, { status: 500 });
  }
}
