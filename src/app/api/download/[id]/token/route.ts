import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCachedAccessToken } from '@/lib/google';
import { logger } from '@/lib/logger';
import { extractTraceContext } from '@/lib/telemetry';

export async function GET(request: Request, context: { params: Promise<any> }) {
  const { id: fileId } = await context.params;
  const { searchParams } = new URL(request.url);
  const partNumber = parseInt(searchParams.get('partNumber') || '1', 10);
  const { trace_id, span_id, request_id } = extractTraceContext(request.headers);
  const startTime = performance.now();

  try {
    logger.debug('On-demand chunk access token requested', {
      trace_id,
      span_id,
      request_id,
      file_id: fileId,
      part_number: partNumber,
    });

    const { data: part, error } = await supabaseAdmin
      .from('file_parts')
      .select('google_drive_file_id, accounts(id, refresh_token)')
      .eq('parent_file_id', fileId)
      .eq('part_number', partNumber)
      .single();

    if (error || !part) {
      logger.warn('Part configuration not found during token extraction', {
        trace_id,
        span_id,
        request_id,
        file_id: fileId,
        part_number: partNumber,
        error: error?.message,
      });
      return NextResponse.json({ error: 'Part configuration not found' }, { status: 404 });
    }

    // Cast accounts to any to bypass strict typescript object/array schema mismatch if present
    const accountInfo = part.accounts as any;
    if (!accountInfo || !accountInfo.refresh_token) {
      logger.error('Account refresh token missing for file part owner', {
        trace_id,
        span_id,
        request_id,
        file_id: fileId,
        part_number: partNumber,
      });
      return NextResponse.json({ error: 'OAuth account refresh token not found' }, { status: 404 });
    }

    const accessToken = await getCachedAccessToken(accountInfo.refresh_token, trace_id);
    const durationMs = Math.round(performance.now() - startTime);

    logger.debug('On-demand chunk access token retrieved successfully', {
      trace_id,
      span_id,
      request_id,
      file_id: fileId,
      part_number: partNumber,
      account_id: accountInfo.id,
      duration_ms: durationMs,
    });

    return NextResponse.json({ accessToken });
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startTime);
    logger.error('On-demand token extraction failed', {
      trace_id,
      span_id,
      request_id,
      file_id: fileId,
      part_number: partNumber,
      error: err.message || err,
      duration_ms: durationMs,
    });
    return NextResponse.json({ error: 'Token extraction failed' }, { status: 500 });
  }
}

