import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: fileId } = await params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!fileId || !uuidRegex.test(fileId)) {
    return NextResponse.json({ error: 'Invalid File ID format' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { newName } = body;

    if (!newName || typeof newName !== 'string' || newName.trim() === '') {
      return NextResponse.json({ error: 'Invalid file name provided' }, { status: 400 });
    }

    if (newName.length > 255) {
      return NextResponse.json({ error: 'Name exceeds maximum allowed limit of 255 characters' }, { status: 400 });
    }

    // Sanitize slashes (both / and \) by replacing them with underscores
    const sanitizedName = newName.replace(/[\/\\]/g, '_').trim();
    if (sanitizedName === '') {
      return NextResponse.json({ error: 'Invalid file name provided' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('files')
      .update({ original_file_name: sanitizedName, updated_at: new Date().toISOString() })
      .eq('id', fileId);

    if (error) {
      throw new Error(`Failed to update file name: ${error.message}`);
    }

    return NextResponse.json({ success: true, newName: sanitizedName });
  } catch (error: any) {
    console.error('Rename error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
