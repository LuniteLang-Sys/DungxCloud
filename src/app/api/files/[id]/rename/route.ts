import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: fileId } = await params;

  try {
    const body = await request.json();
    const { newName } = body;

    if (!newName || typeof newName !== 'string' || newName.trim() === '') {
      return NextResponse.json({ error: 'Invalid file name provided' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('files')
      .update({ original_file_name: newName.trim(), updated_at: new Date().toISOString() })
      .eq('id', fileId);

    if (error) {
      throw new Error(`Failed to update file name: ${error.message}`);
    }

    return NextResponse.json({ success: true, newName: newName.trim() });
  } catch (error: any) {
    console.error('Rename error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
