import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { refreshAccountQuota } from '@/lib/google';

export async function POST() {
  try {
    // 1. Fetch all accounts
    const { data: accounts, error } = await supabaseAdmin
      .from('accounts')
      .select('id, refresh_token');

    if (error) {
      throw new Error(`Failed to fetch accounts: ${error.message}`);
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: 'No accounts to sync', count: 0 });
    }

    // 2. Refresh quotas for each account in parallel
    await Promise.all(
      accounts.map(acc => {
        if (acc.refresh_token) {
          return refreshAccountQuota(acc.id, acc.refresh_token);
        }
      })
    );

    return NextResponse.json({ success: true, count: accounts.length });
  } catch (error: any) {
    console.error('Manual sync error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
