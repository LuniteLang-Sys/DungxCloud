import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { fileId, parts } = await request.json();

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

                // Set file permission to public so direct download links work in iframe/img
                try {
                  await drive.permissions.create({
                    fileId: googleFileId,
                    requestBody: {
                      role: 'reader',
                      type: 'anyone',
                    },
                  });
                } catch (permErr) {
                  console.error('Background upload preview sync: failed to set permissions:', permErr);
                }

                // Retrieve Drive links
                const driveFile = await drive.files.get({
                  fileId: googleFileId,
                  fields: 'webViewLink, thumbnailLink',
                });

                const isImage = fileRecord.mime_type?.startsWith('image/');
                const computedPreviewUrl = driveFile.data.webViewLink?.replace('/view', '/preview') || `https://drive.google.com/file/d/${googleFileId}/preview`;
                const finalPreviewUrl = isImage 
                  ? `https://drive.google.com/uc?id=${googleFileId}`
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
    
    // Log error in db
    try {
      const { fileId } = await request.json().catch(() => ({}));
      if (fileId) {
         await supabaseAdmin.from('upload_logs').insert({
            file_id: fileId,
            status: 'error',
            error_message: error.message
         });
         await supabaseAdmin.from('files').update({ status: 'failed' }).eq('id', fileId);
      }
    } catch(e) {}

    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
