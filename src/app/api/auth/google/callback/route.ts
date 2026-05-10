import { NextResponse } from 'next/server';
import { oauth2Client, encrypt } from '@/lib/google';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  
  if (!code) {
    return NextResponse.redirect(new URL('/dashboard/accounts?error=missing_code', request.url));
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info to get email
    const res = await oauth2Client.request({ url: 'https://www.googleapis.com/oauth2/v2/userinfo' });
    const email = (res.data as any).email;

    if (!email) {
      throw new Error('Could not get email from Google');
    }

    // Get remaining storage quota
    const driveRes = await oauth2Client.request({ url: 'https://www.googleapis.com/drive/v3/about?fields=storageQuota' });
    const quota = (driveRes.data as any).storageQuota;
    const remainingStorage = parseInt(quota.limit, 10) - parseInt(quota.usageInDrive || quota.usage, 10);

    // Upsert into Supabase
    const { error } = await supabaseAdmin.from('accounts').upsert(
      {
        email,
        refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined, // keep existing if not provided
        remaining_storage: remainingStorage,
        token_status: 'active',
        health_status: 'healthy',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    );

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.redirect(new URL('/dashboard/accounts?error=db_error', request.url));
    }

    return NextResponse.redirect(new URL('/dashboard/accounts?success=account_added', request.url));
  } catch (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect(new URL('/dashboard/accounts?error=oauth_failed', request.url));
  }
}
