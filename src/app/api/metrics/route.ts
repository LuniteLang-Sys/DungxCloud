// src/app/api/metrics/route.ts
// Standard Prometheus scraping gateway exposing raw metrics registry stats.

import { NextResponse } from 'next/server';
import { metricsRegistry } from '@/lib/metrics';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Dynamically calculate database aggregates to keep stats fresh on scrapings
    const [accountsRes, filesRes, unhealthyRes] = await Promise.all([
      supabaseAdmin.from('accounts').select('remaining_storage, total_storage'),
      supabaseAdmin.from('files').select('size'),
      supabaseAdmin.from('accounts').select('id').or('health_status.neq.healthy,token_status.neq.active')
    ]);

    // Aggregate storage metrics dynamically
    if (accountsRes.data) {
      const totalCapacityBytes = accountsRes.data.reduce((acc, current) => acc + Number(current.total_storage || 15 * 1024 * 1024 * 1024), 0);
      const totalRemainingBytes = accountsRes.data.reduce((acc, current) => acc + Number(current.remaining_storage || 0), 0);
      
      // We set total capacity and available 
      metricsRegistry.totalStorageBytes.set(totalCapacityBytes, { state: 'capacity' });
      metricsRegistry.totalStorageBytes.set(totalRemainingBytes, { state: 'available' });
    }

    if (filesRes.data) {
      const totalFilesBytes = filesRes.data.reduce((acc, current) => acc + Number(current.size || 0), 0);
      metricsRegistry.totalStorageBytes.set(totalFilesBytes, { state: 'used' });
    }

    if (unhealthyRes.data) {
      metricsRegistry.unhealthyAccounts.set(unhealthyRes.data.length);
    } else {
      metricsRegistry.unhealthyAccounts.set(0);
    }

    const data = metricsRegistry.expose();

    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to expose metrics', details: err.message }, { status: 500 });
  }
}
