import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDriveClient } from '@/lib/google';

export async function GET(request: NextRequest, context: { params: Promise<any> }) {
  const { id: fileId } = await context.params;

  try {
    // 1. Fetch file metadata
    const { data: file, error: fileError } = await supabaseAdmin
      .from('files')
      .select(`
        *,
        file_parts (
          *,
          accounts (
            refresh_token
          )
        )
      `)
      .eq('id', fileId)
      .single();

    if (fileError || !file) throw new Error('File not found');

    // Check if cache is fresh (< 3 hours old)
    const isCacheFresh = file.preview_url && 
                         file.thumbnail_url && 
                         file.last_synced_at && 
                         (Date.now() - new Date(file.last_synced_at).getTime() < 3 * 60 * 60 * 1000);

    if (isCacheFresh) {
      let previewUrl = file.preview_url;
      const isImage = file.mime_type?.startsWith('image/');
      
      // If cached image uses stale raw Google Drive URL, upgrade it on-the-fly to high-res CDN thumbnail!
      if (isImage && (previewUrl.includes('drive.google.com/uc?id=') || !previewUrl)) {
        previewUrl = file.thumbnail_url && (file.thumbnail_url.includes('googleusercontent.com') || file.thumbnail_url.includes('drive-storage'))
          ? file.thumbnail_url.replace(/=s\d+$/, '=s1600')
          : `https://drive.google.com/thumbnail?sz=w1600&id=${file.file_parts?.[0]?.google_drive_file_id || ''}`;
      }

      return NextResponse.json({
        id: file.id,
        name: file.original_file_name,
        mime_type: file.mime_type,
        size: file.size,
        google_drive_file_id: file.file_parts?.[0]?.google_drive_file_id || '',
        preview_url: previewUrl,
        thumbnail_url: file.thumbnail_url,
      });
    }

    if (!file.file_parts || file.file_parts.length === 0) throw new Error('File parts not found');

    // Sort parts to get the first one (for preview/thumbnail, we only map the first part/shard)
    const parts = file.file_parts.sort((a: any, b: any) => a.part_number - b.part_number)[0];
    if (!parts || !parts.accounts) throw new Error('File part account not found');

    const googleDriveFileId = parts.google_drive_file_id;
    const refreshToken = parts.accounts.refresh_token;

    // 2. Initialize Google Drive client
    const drive = getDriveClient(refreshToken);

    // 3. Grant public read permission to the file part so it can be previewed without login block
    try {
      await drive.permissions.create({
        fileId: googleDriveFileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    } catch (permError: any) {
      console.warn('Failed to grant public read permission to file part:', permError.message || permError);
    }

    // 4. Retrieve webViewLink and thumbnailLink from Google Drive API
    const driveFile = await drive.files.get({
      fileId: googleDriveFileId,
      fields: 'webViewLink, thumbnailLink',
    });

    // 5. Build optimal direct URLs
    const isImage = file.mime_type?.startsWith('image/');
    
    // Google Drive webViewLink is in the form: https://docs.google.com/file/d/ID/view?usp=drivesdk
    // Convert it to: https://drive.google.com/file/d/ID/preview
    const computedPreviewUrl = driveFile.data.webViewLink?.replace('/view', '/preview') || `https://drive.google.com/file/d/${googleDriveFileId}/preview`;
    
    // Google provides a high-quality resizeable thumbnailLink (e.g. lh3.googleusercontent.com/...=s220)
    const finalThumbnailUrl = driveFile.data.thumbnailLink || `https://drive.google.com/thumbnail?sz=w320&id=${googleDriveFileId}`;

    // Images can be previewed directly via high-resolution globally cached secure short-lived Google CDN link
    const highResThumbnail = driveFile.data.thumbnailLink
      ? driveFile.data.thumbnailLink.replace(/=s\d+$/, '=s1600')
      : `https://drive.google.com/thumbnail?sz=w1600&id=${googleDriveFileId}`;

    const finalPreviewUrl = isImage 
      ? highResThumbnail
      : computedPreviewUrl;

    // 6. Update cache in Supabase DB
    await supabaseAdmin
      .from('files')
      .update({
        preview_url: finalPreviewUrl,
        thumbnail_url: finalThumbnailUrl,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', fileId);

    // 7. Return metadata + direct preview links
    return NextResponse.json({
      id: file.id,
      name: file.original_file_name,
      mime_type: file.mime_type,
      size: file.size,
      google_drive_file_id: googleDriveFileId,
      preview_url: finalPreviewUrl,
      thumbnail_url: finalThumbnailUrl,
    });

  } catch (error: any) {
    console.error('Preview metadata error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// OPTIONS preflight handler for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
    },
  });
}
