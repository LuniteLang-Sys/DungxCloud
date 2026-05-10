import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function POST(request: Request) {
  try {
    const { fileId, parentId } = await request.json();

    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
    }

    // Basic cycle check: prevent moving a folder into itself
    if (parentId && fileId === parentId) {
      return NextResponse.json({ error: 'Cannot move a folder into itself' }, { status: 400 });
    }

    // Update parent_id to move file/folder (set to null if moving to root)
    const { error } = await supabaseAdmin
      .from('files')
      .update({ 
        parent_id: parentId || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', fileId);

    if (error) {
      console.error('Failed to move file in Supabase:', error);
      throw new Error('Failed to move file');
    }

    revalidatePath('/dashboard/files');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Move file error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
