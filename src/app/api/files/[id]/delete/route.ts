import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDriveClient } from '@/lib/google';

export async function POST(request: Request, context: { params: Promise<any> }) {
  const { id: fileId } = await context.params;

  try {
    // Get file parts
    const { data: parts, error: partsError } = await supabaseAdmin
      .from('file_parts')
      .select('*, accounts(refresh_token)')
      .eq('parent_file_id', fileId);

    if (partsError) throw new Error('Failed to fetch file parts');

    // Run Google Drive deletions and dependent DB deletions in parallel!
    if (parts && parts.length > 0) {
      await Promise.all([
        // Google Drive deletions
        ...parts.map(async (part) => {
          if (!part.google_drive_file_id || !part.accounts?.refresh_token) return;
          try {
            const drive = getDriveClient(part.accounts.refresh_token);
            await drive.files.delete({ fileId: part.google_drive_file_id });
          } catch (e) {
            console.error(`Failed to delete part ${part.google_drive_file_id} from Drive`, e);
          }
        }),
        // DB dependent records deletions
        supabaseAdmin.from('upload_logs').delete().eq('file_id', fileId),
        supabaseAdmin.from('download_logs').delete().eq('file_id', fileId),
        supabaseAdmin.from('file_parts').delete().eq('parent_file_id', fileId)
      ]);
    } else {
      // Just DB dependent deletions if no parts exist
      await Promise.all([
        supabaseAdmin.from('upload_logs').delete().eq('file_id', fileId),
        supabaseAdmin.from('download_logs').delete().eq('file_id', fileId),
      ]);
    }

    // Delete the parent file record
    const { error: deleteError } = await supabaseAdmin
      .from('files')
      .delete()
      .eq('id', fileId);

    if (deleteError) throw new Error(`Failed to delete file from DB: ${deleteError.message}`);

    // Sync quotas for all accounts involved in the background without blocking the response!
    const uniqueAccounts = Array.from(new Set(parts?.map((p: any) => p.account_owner).filter(Boolean)));
    if (uniqueAccounts.length > 0) {
      import('@/lib/google').then(({ refreshAccountQuota }) => {
        Promise.all(uniqueAccounts.map(async (accId: any) => {
          const part = parts.find(p => p.account_owner === accId);
          if (part?.accounts?.refresh_token) {
            return refreshAccountQuota(accId, part.accounts.refresh_token);
          }
        })).catch(quotaErr => console.error('Background quota sync failed:', quotaErr));
      }).catch(err => console.error('Failed to import google module for background sync', err));
    }

    // Return immediate success JSON response
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
