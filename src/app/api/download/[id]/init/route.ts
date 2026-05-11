import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { extractTraceContext } from '@/lib/telemetry';

export async function GET(request: Request, context: { params: Promise<any> }) {
  const { id: fileId } = await context.params;
  const { trace_id, span_id, request_id } = extractTraceContext(request.headers);
  const startTime = performance.now();
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    logger.info('Download initialization requested', {
      trace_id,
      span_id,
      request_id,
      file_id: fileId,
      client_ip: clientIp,
      user_agent: userAgent,
    });

    // 1. Get file metadata
    const { data: file, error: fileError } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      logger.error('File metadata not found during download initialization', {
        trace_id,
        span_id,
        request_id,
        file_id: fileId,
        error: fileError?.message || 'File record missing',
      });
      throw new Error('File not found');
    }

    // 2. Get file parts
    const { data: parts, error: partsError } = await supabaseAdmin
      .from('file_parts')
      .select('*, accounts(refresh_token)')
      .eq('parent_file_id', fileId)
      .order('part_number', { ascending: true });

    if (partsError || !parts || parts.length === 0) {
      logger.error('File parts not found during download initialization', {
        trace_id,
        span_id,
        request_id,
        file_id: fileId,
        error: partsError?.message || 'Empty or missing file parts',
      });
      throw new Error('File parts not found');
    }

    // 3. Prepare parts metadata without upfront tokens (tokens are fetched on-demand per chunk)
    const downloadParts = parts.map((part) => ({
      partNumber: part.part_number,
      size: part.size,
      googleDriveFileId: part.google_drive_file_id,
    }));

    const durationMs = Math.round(performance.now() - startTime);
    logger.info('Download metadata dispatched successfully', {
      trace_id,
      span_id,
      request_id,
      file_id: fileId,
      file_name: file.original_file_name,
      file_size: file.size,
      total_parts: file.total_parts,
      client_ip: clientIp,
      duration_ms: durationMs,
    });

    return NextResponse.json({
      file: {
        name: file.original_file_name,
        size: file.size,
        mimeType: file.mime_type,
        isSplit: file.is_split,
        totalParts: file.total_parts,
      },
      parts: downloadParts,
    });
  } catch (error: any) {
    const durationMs = Math.round(performance.now() - startTime);
    logger.error('Download initialization failed', {
      trace_id,
      span_id,
      request_id,
      file_id: fileId,
      error: error.message || error,
      duration_ms: durationMs,
    });
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

