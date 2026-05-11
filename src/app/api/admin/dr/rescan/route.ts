// src/app/api/admin/dr/rescan/route.ts
// Next.js administrative Disaster Recovery route that dynamically scans connected Google Drive storage accounts,
// extracts embedded file properties, and reconstructs metadata database indices from scratch.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDriveClient } from '@/lib/google';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = performance.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') !== 'false'; // Default to dry-run safety
    const reclaimOrphans = searchParams.get('reclaimOrphans') === 'true';

    logger.info('Disaster Recovery metadata rescan operation initiated', {
      dry_run: dryRun,
      reclaim_orphans: reclaimOrphans,
    });

    // 1. Retrieve all registered accounts from Supabase
    const { data: accounts, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('*');

    if (accountError || !accounts || accounts.length === 0) {
      logger.error('No storage accounts found during DR rescan process', {
        error: accountError?.message,
      });
      return NextResponse.json({ error: 'No storage accounts available' }, { status: 500 });
    }

    const reconstructionLog: any[] = [];
    const orphanList: any[] = [];
    let filesReconstructedCount = 0;
    let chunksReconstructedCount = 0;

    // Map of parent file ID to its parts to aggregate size and totals at the end
    const pendingAggregations = new Set<string>();

    // 2. Scan each account shard sequentially
    for (const account of accounts) {
      logger.info(`Scanning Google Drive account shard: ${account.email}`);
      const drive = getDriveClient(account.refresh_token);

      let nextPageToken: string | undefined = undefined;
      do {
        // Query Google Drive for untrashed files, requesting standard properties fields
        const res: any = await drive.files.list({
          q: "trashed = false",
          fields: "nextPageToken, files(id, name, size, mimeType, properties, createdTime)",
          pageSize: 100,
          pageToken: nextPageToken,
        });

        const driveFiles = res.data.files || [];
        nextPageToken = res.data.nextPageToken || undefined;

        for (const file of driveFiles) {
          const properties = file.properties;

          // Check if file is a self-describing storage chunk belonging to this NAS pool
          if (properties && properties.parent_file_id) {
            const parentFileId = properties.parent_file_id;
            const partNumber = parseInt(properties.part_number || '1', 10);
            const isSplit = properties.is_split === 'true';
            const originalFileName = properties.original_file_name || file.name;
            const fileSize = parseInt(file.size || '0', 10);

            // Check if this part number is already registered in our DB
            const { data: existingPart, error: partCheckErr } = await supabaseAdmin
              .from('file_parts')
              .select('id')
              .eq('google_drive_file_id', file.id)
              .maybeSingle();

            if (!existingPart) {
              // This is a missing DB chunk!
              reconstructionLog.push({
                action: 'reconstruct_part',
                google_file_id: file.id,
                file_name: originalFileName,
                parent_file_id: parentFileId,
                part_number: partNumber,
                account: account.email,
                size_bytes: fileSize,
              });

              if (!dryRun) {
                // Step 1: Ensure files table has parent entry
                const { data: existingParent } = await supabaseAdmin
                  .from('files')
                  .select('id')
                  .eq('id', parentFileId)
                  .maybeSingle();

                if (!existingParent) {
                  const { error: fileInsertErr } = await supabaseAdmin
                    .from('files')
                    .insert({
                      id: parentFileId,
                      original_file_name: originalFileName,
                      stored_file_name: originalFileName,
                      mime_type: file.mimeType || 'application/octet-stream',
                      size: 0, // Placeholder, updated in aggregation step
                      total_parts: 0, // Placeholder
                      is_split: isSplit,
                      status: 'completed',
                      upload_date: file.createdTime || new Date().toISOString(),
                    });

                  if (fileInsertErr) {
                    logger.error(`Failed to reconstruct parent file entry ${parentFileId}`, { error: fileInsertErr.message });
                    continue;
                  }
                  filesReconstructedCount++;
                }

                // Step 2: Insert the file part mapping record
                const { error: partInsertErr } = await supabaseAdmin
                  .from('file_parts')
                  .insert({
                    parent_file_id: parentFileId,
                    part_number: partNumber,
                    google_drive_file_id: file.id,
                    account_owner: account.id,
                    size: fileSize,
                    status: 'completed',
                  });

                if (partInsertErr) {
                  logger.error(`Failed to insert reconstructed part mapping for chunk ${file.id}`, { error: partInsertErr.message });
                  continue;
                }
                chunksReconstructedCount++;
                pendingAggregations.add(parentFileId);
              }
            } else {
              // Part exists in DB, track it in case we need to update aggregate file properties
              pendingAggregations.add(parentFileId);
            }
          } else {
            // Unregistered file on Google Drive (No self-describing properties tags found)
            // If it matches standard chunk filename suffix pattern, it's highly likely an aborted orphan chunk
            const isAbortedOrphanPattern = file.name.includes('.part') || file.mimeType === 'application/octet-stream';
            
            if (isAbortedOrphanPattern) {
              orphanList.push({
                google_file_id: file.id,
                name: file.name,
                size_bytes: parseInt(file.size || '0', 10),
                account: account.email,
              });

              if (reclaimOrphans && !dryRun) {
                logger.warn(`SRE Reclamation: Deleting orphan storage chunk from Google Drive: ${file.name} (${file.id})`);
                try {
                  await drive.files.delete({ fileId: file.id });
                } catch (delErr: any) {
                  logger.error(`Failed to delete orphan file ${file.id}`, { error: delErr.message });
                }
              }
            }
          }
        }
      } while (nextPageToken);
    }

    // 3. Post-Aggregation Process: Recompute file manifest sizes and total parts counts
    if (!dryRun && pendingAggregations.size > 0) {
      logger.info('Performing post-aggregation size calculations on reconstructed records');
      for (const parentFileId of Array.from(pendingAggregations)) {
        const { data: parts, error: partsFetchErr } = await supabaseAdmin
          .from('file_parts')
          .select('size, part_number')
          .eq('parent_file_id', parentFileId);

        if (partsFetchErr || !parts || parts.length === 0) continue;

        const totalSize = parts.reduce((acc, p) => acc + Number(p.size), 0);
        const maxPartNumber = Math.max(...parts.map(p => p.part_number));

        await supabaseAdmin
          .from('files')
          .update({
            size: totalSize,
            total_parts: maxPartNumber,
            status: 'completed',
          })
          .eq('id', parentFileId);
      }
    }

    const durationMs = Math.round(performance.now() - startTime);
    logger.info('Disaster Recovery metadata rescan process completed successfully', {
      duration_ms: durationMs,
      reconstructed_files: filesReconstructedCount,
      reconstructed_chunks: chunksReconstructedCount,
      orphans_identified: orphanList.length,
    });

    return NextResponse.json({
      status: dryRun ? 'dry-run-completed' : 'reconstruction-completed',
      reconstructed_files_count: filesReconstructedCount,
      reconstructed_chunks_count: chunksReconstructedCount,
      orphans_identified_count: orphanList.length,
      duration_ms: durationMs,
      reconstruction_log: reconstructionLog,
      orphans_log: orphanList,
    }, { status: 200 });

  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startTime);
    logger.error('Disaster Recovery metadata rescan process failed', {
      duration_ms: durationMs,
      error: err.message,
    });
    return NextResponse.json({ error: 'Disaster Recovery Rescan failed', details: err.message }, { status: 500 });
  }
}
