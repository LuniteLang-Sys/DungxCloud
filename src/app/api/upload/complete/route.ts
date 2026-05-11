import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { extractTraceContext } from '@/lib/telemetry';

export async function POST(request: Request) {
  const { trace_id, span_id, request_id } = extractTraceContext(request.headers);
  const startTime = performance.now();
  let parsedFileId: string | null = null;

  try {
    const { fileId, parts } = await request.json();
    parsedFileId = fileId;

    if (!fileId || !parts || !Array.isArray(parts)) {
      logger.warn('Upload completion rejected: missing parameters', {
        trace_id,
        span_id,
        request_id,
        file_id: fileId,
        parts_present: !!parts,
      });
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    logger.info('Upload completion finalization started', {
      trace_id,
      span_id,
      request_id,
      file_id: fileId,
      parts_count: parts.length,
    });

    // Insert parts
    const partsData = parts.map((p: any) => ({
      parent_file_id: fileId,
      part_number: p.partNumber,
      google_drive_file_id: p.googleDriveFileId,
      account_owner: p.accountId,
      size: p.size,
      status: 'completed'
    }));

    const partsInsertStart = performance.now();
    const { error: partsError } = await supabaseAdmin.from('file_parts').insert(partsData);

    if (partsError) {
      logger.error('Database write failed: file_parts insert error', {
        trace_id,
        span_id,
        request_id,
        file_id: fileId,
        error: partsError.message,
        duration_ms: Math.round(performance.now() - partsInsertStart),
      });
      throw new Error('Failed to save file parts');
    }

    logger.debug('File parts metadata saved to database successfully', {
      trace_id,
      span_id,
      request_id,
      file_id: fileId,
      parts_count: parts.length,
      duration_ms: Math.round(performance.now() - partsInsertStart),
    });

    // Update file status
    const statusUpdateStart = performance.now();
    const { error: fileError } = await supabaseAdmin.from('files').update({
      status: 'completed'
    }).eq('id', fileId);

    if (fileError) {
      logger.error('Database write failed: file status update error', {
        trace_id,
        span_id,
        request_id,
        file_id: fileId,
        error: fileError.message,
        duration_ms: Math.round(performance.now() - statusUpdateStart),
      });
      throw new Error('Failed to update file status');
    }

    logger.info('Virtual file status updated to completed', {
      trace_id,
      span_id,
      request_id,
      file_id: fileId,
      duration_ms: Math.round(performance.now() - statusUpdateStart),
    });

    // Sync quotas for all accounts involved in the upload & Pre-cache preview links in the background
    try {
      const accountIds = Array.from(new Set(parts.map((p: any) => p.accountId)));
      const syncQueryStart = performance.now();
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

      logger.debug('Accounts and file records metadata retrieved for background sync', {
        trace_id,
        span_id,
        request_id,
        file_id: fileId,
        accounts_to_sync_count: accountsToSync?.length,
        duration_ms: Math.round(performance.now() - syncQueryStart),
      });

      if (accountsToSync) {
        const { refreshAccountQuota, getDriveClient } = await import('@/lib/google');
        
        // 1. Refresh quotas in parallel
        logger.info('Spawning parallel background storage quota sync tasks', {
          trace_id,
          span_id,
          request_id,
          accounts_count: accountsToSync.length,
        });

        // Fire-and-forget background execution, fully traced
        Promise.all(
          accountsToSync.map(acc => {
            if (acc.refresh_token) {
              return refreshAccountQuota(acc.id, acc.refresh_token, trace_id);
            }
          })
        ).catch(err => {
          logger.error('Background storage quota synchronization failed', {
            trace_id,
            span_id,
            request_id,
            error: err.message || err,
          });
        });

        // 2. Pre-cache direct previews and thumbnails in the background
        if (fileRecord && parts.length > 0) {
          const firstPart = parts.sort((a: any, b: any) => a.partNumber - b.partNumber)[0];
          const syncAccount = accountsToSync.find(acc => acc.id === firstPart.accountId);
          
          if (syncAccount && syncAccount.refresh_token) {
            // Trigger fire-and-forget background execution, traced
            (async () => {
              const bgPreviewStart = performance.now();
              logger.info('Starting background file preview pre-caching', {
                trace_id,
                file_id: fileId,
                file_name: fileRecord.original_file_name,
                google_drive_file_id: firstPart.googleDriveFileId,
              });

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

                const { error: updateError } = await supabaseAdmin
                  .from('files')
                  .update({
                    preview_url: finalPreviewUrl,
                    thumbnail_url: finalThumbnailUrl,
                    last_synced_at: new Date().toISOString()
                  })
                  .eq('id', fileId);

                const bgDuration = Math.round(performance.now() - bgPreviewStart);

                if (updateError) {
                  logger.error('Failed to save pre-cached preview URL into database', {
                    trace_id,
                    file_id: fileId,
                    error: updateError.message,
                    duration_ms: bgDuration,
                  });
                } else {
                  logger.info('Background file preview pre-caching completed successfully', {
                    trace_id,
                    file_id: fileId,
                    duration_ms: bgDuration,
                    preview_url: finalPreviewUrl,
                  });
                }
              } catch (bgErr: any) {
                logger.error('Background upload preview sync failed', {
                  trace_id,
                  file_id: fileId,
                  error: bgErr.message || bgErr,
                  duration_ms: Math.round(performance.now() - bgPreviewStart),
                });
              }
            })();
          }
        }
      }
    } catch (quotaErr: any) {
      logger.error('Spawning background tasks post-upload failed', {
        trace_id,
        span_id,
        request_id,
        file_id: fileId,
        error: quotaErr.message || quotaErr,
      });
    }

    const durationMs = Math.round(performance.now() - startTime);
    logger.info('Upload finalization transaction completed', {
      trace_id,
      span_id,
      request_id,
      file_id: fileId,
      duration_ms: durationMs,
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    const durationMs = Math.round(performance.now() - startTime);
    logger.error('Upload finalization crash caught', {
      trace_id,
      span_id,
      request_id,
      file_id: parsedFileId,
      error: error.message || error,
      duration_ms: durationMs,
    });
    
    // Log error in db safely using parsed outer-scope ID
    if (parsedFileId) {
      try {
        const fallbackDbStart = performance.now();
        await Promise.all([
          supabaseAdmin.from('upload_logs').insert({
            file_id: parsedFileId,
            status: 'error',
            error_message: error.message || 'Unknown upload finalization error'
          }),
          supabaseAdmin.from('files').update({ status: 'failed' }).eq('id', parsedFileId)
        ]);
        
        logger.warn('Upload finalization error registered in database upload_logs', {
          trace_id,
          span_id,
          request_id,
          file_id: parsedFileId,
          duration_ms: Math.round(performance.now() - fallbackDbStart),
        });
      } catch (dbErr: any) {
        logger.fatal('Failed to write finalization failure crash to database upload_logs', {
          trace_id,
          span_id,
          request_id,
          file_id: parsedFileId,
          error: dbErr.message || dbErr,
        });
      }
    }

    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

