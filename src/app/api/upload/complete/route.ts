import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  let parsedFileId: string | null = null;
  try {
    const { fileId, parts } = await request.json();
    parsedFileId = fileId;

    if (!fileId || !parts || !Array.isArray(parts)) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Insert parts
    const partsData = parts.map((p: any) => ({
      parent_file_id: fileId,
      part_number: p.partNumber,
      google_drive_file_id: p.googleDriveFileId,
      account_owner: p.accountId,
      size: p.size,
      status: 'completed'
    }));

    const { error: partsError } = await supabaseAdmin.from('file_parts').insert(partsData);

    if (partsError) {
      console.error('Parts insert error', partsError);
      throw new Error('Failed to save file parts');
    }

    // Update file status
    const { error: fileError } = await supabaseAdmin.from('files').update({
      status: 'completed'
    }).eq('id', fileId);

    if (fileError) {
      throw new Error('Failed to update file status');
    }

    // Sync quotas for all accounts involved in the upload & Pre-cache preview links in the background
    try {
      const accountIds = Array.from(new Set(parts.map((p: any) => p.accountId)));
      const [accountsRes, fileRes] = await Promise.all([
        supabaseAdmin
          .from('accounts')
          .select('id, refresh_token')
          .in('id', accountIds),
        supabaseAdmin
          .from('files')
          .select('id, mime_type, original_file_name')
          .eq('id', fileId)
          .single()
      ]);

      const accountsToSync = accountsRes.data;
      const fileRecord = fileRes.data;

      if (accountsToSync) {
        const { refreshAccountQuota, getDriveClient } = await import('@/lib/google');
        
        // 1. Refresh quotas in parallel
        await Promise.all(
          accountsToSync.map(acc => {
            if (acc.refresh_token) {
              return refreshAccountQuota(acc.id, acc.refresh_token);
            }
          })
        );

        // 2. Pre-cache direct previews and thumbnails in the background
        if (fileRecord && parts.length > 0) {
          const firstPart = parts.sort((a: any, b: any) => a.partNumber - b.partNumber)[0];
          const syncAccount = accountsToSync.find(acc => acc.id === firstPart.accountId);
          
          if (syncAccount && syncAccount.refresh_token) {
            // Trigger fire-and-forget background execution
            (async () => {
              try {
                const drive = getDriveClient(syncAccount.refresh_token);
                const googleFileId = firstPart.googleDriveFileId;

                // Retrieve Drive links
                const driveFile = await drive.files.get({
                  fileId: googleFileId,
                  fields: 'webViewLink, thumbnailLink',
                });

                const isImage = fileRecord.mime_type?.startsWith('image/');
                const computedPreviewUrl = driveFile.data.webViewLink?.replace('/view', '/preview') || `https://drive.google.com/file/d/${googleFileId}/preview`;
                
                // Use short-lived secure high-res thumbnail link for images
                const highResThumbnail = driveFile.data.thumbnailLink
                  ? driveFile.data.thumbnailLink.replace(/=s\d+$/, '=s1600')
                  : `https://drive.google.com/thumbnail?sz=w1600&id=${googleFileId}`;

                const finalPreviewUrl = isImage 
                  ? highResThumbnail
                  : computedPreviewUrl;

                const finalThumbnailUrl = driveFile.data.thumbnailLink || `https://drive.google.com/thumbnail?sz=w320&id=${googleFileId}`;

                await supabaseAdmin
                  .from('files')
                  .update({
                    preview_url: finalPreviewUrl,
                    thumbnail_url: finalThumbnailUrl,
                    last_synced_at: new Date().toISOString()
                  })
                  .eq('id', fileId);
              } catch (bgErr) {
                console.error('Background upload preview sync failed:', bgErr);
              }
            })();
          }
        }
      }
    } catch (quotaErr) {
      console.error('Failed to sync quotas after upload complete:', quotaErr);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Upload complete error:', error);
    
    // Log error in db safely using parsed outer-scope ID
    if (parsedFileId) {
      try {
        await Promise.all([
          supabaseAdmin.from('upload_logs').insert({
            file_id: parsedFileId,
            status: 'error',
            error_message: error.message || 'Unknown upload finalization error'
          }),
          supabaseAdmin.from('files').update({ status: 'failed' }).eq('id', parsedFileId)
        ]);
      } catch (dbErr) {
        console.error('Failed to log finalization error in DB:', dbErr);
      }
    }

    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
