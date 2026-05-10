import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { name, parentId } = await request.json();
    
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    // Insert virtual folder record in Supabase
    const { data, error } = await supabaseAdmin
      .from('files')
      .insert({
        original_file_name: name.trim(),
        stored_file_name: name.trim(),
        mime_type: 'application/vnd.google-apps.folder',
        size: 0,
        total_parts: 0,
        is_split: false,
        status: 'completed',
        parent_id: parentId || null,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('Failed to create folder record in Supabase:', error);
      throw new Error('Failed to create folder');
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Create folder error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
