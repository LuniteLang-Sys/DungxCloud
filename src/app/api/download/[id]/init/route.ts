import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request, context: { params: Promise<any> }) {
  const { id: fileId } = await context.params;

  try {
    // 1. Get file metadata
    const { data: file, error: fileError } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !file) throw new Error('File not found');

    // 2. Get file parts
    const { data: parts, error: partsError } = await supabaseAdmin
      .from('file_parts')
      .select('*, accounts(refresh_token)')
      .eq('parent_file_id', fileId)
      .order('part_number', { ascending: true });

    if (partsError || !parts || parts.length === 0) throw new Error('File parts not found');

    // 3. Prepare parts metadata without upfront tokens (tokens are fetched on-demand per chunk)
    const downloadParts = parts.map((part) => ({
      partNumber: part.part_number,
      size: part.size,
      googleDriveFileId: part.google_drive_file_id,
    }));

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
    console.error('Download init error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
