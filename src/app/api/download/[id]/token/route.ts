import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCachedAccessToken } from '@/lib/google';

export async function GET(request: Request, context: { params: Promise<any> }) {
  const { id: fileId } = await context.params;
  const { searchParams } = new URL(request.url);
  const partNumber = parseInt(searchParams.get('partNumber') || '1', 10);

  try {
    const { data: part, error } = await supabaseAdmin
      .from('file_parts')
      .select('google_drive_file_id, accounts(refresh_token)')
      .eq('parent_file_id', fileId)
      .eq('part_number', partNumber)
      .single();

    if (error || !part) {
      return NextResponse.json({ error: 'Part configuration not found' }, { status: 404 });
    }

    // Cast accounts to any to bypass strict typescript object/array schema mismatch if present
    const accountInfo = part.accounts as any;
    if (!accountInfo || !accountInfo.refresh_token) {
      return NextResponse.json({ error: 'OAuth account refresh token not found' }, { status: 404 });
    }

    const accessToken = await getCachedAccessToken(accountInfo.refresh_token);
    return NextResponse.json({ accessToken });
  } catch (err: any) {
    console.error('On-demand token error:', err);
    return NextResponse.json({ error: 'Token extraction failed' }, { status: 500 });
  }
}
