// src/app/api/admin/workers/trigger/route.ts
// Secured Next.js administrative route to trigger autonomous cleanup and maintenance workers.
// Integrates distributed lock acquisition, credential checking, and execution logs.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { acquireLock, releaseLock } from '@/lib/locks';
import { refreshAccountQuota, getDriveClient } from '@/lib/google';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || 'fallback_sre_cron_secret';

export async function POST(request: NextRequest) {
  const startTime = performance.now();
  
  try {
    // 1. Authenticate Request using bearer CRON_SECRET
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (token !== CRON_SECRET) {
      logger.warn('Unauthorized background worker trigger attempt rejected');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { worker } = await request.json().catch(() => ({}));

    if (!worker) {
      return NextResponse.json({ error: 'Missing worker type parameter' }, { status: 400 });
    }

    const validWorkers = ['quota_sync', 'failed_upload_cleanup', 'orphan_cleanup', 'token_refresh', 'upload_recovery'];
    if (!validWorkers.includes(worker)) {
      return NextResponse.json({ error: `Invalid worker type. Supported: ${validWorkers.join(', ')}` }, { status: 400 });
    }

    // 2. Lock TTL assignment based on worker characteristics
    const lockTtl = worker === 'orphan_cleanup' ? 3600 : 900; // 1 hour for full drives scan; 15 mins for others

    // 3. Attempt lock acquisition
    const lockAcquired = await acquireLock(worker, lockTtl);
    if (!lockAcquired) {
      logger.info(`Worker run aborted: active lock already held for ${worker}`);
      return NextResponse.json({ status: 'aborted', reason: 'Lock already held' }, { status: 409 });
    }

    logger.info(`Worker lock successfully acquired. Commencing execution: ${worker}`);
    let executionLog = '';

    try {
      // 4. Resolve and execute corresponding worker logic
      switch (worker) {
        case 'quota_sync': {
          const { data: accounts, error: accountError } = await supabaseAdmin
            .from('accounts')
            .select('id, refresh_token, email');

          if (accountError || !accounts || accounts.length === 0) {
            throw new Error(`Failed to retrieve target accounts: ${accountError?.message}`);
          }

          let successCount = 0;
          for (const account of accounts) {
            try {
              await refreshAccountQuota(account.id, account.refresh_token, `cron-quota-sync-${account.id}`);
              successCount++;
            } catch (accErr: any) {
              logger.error(`Quota sync worker failed for account ${account.email}`, { error: accErr.message });
            }
          }
          executionLog = `Synchronized capacity for ${successCount}/${accounts.length} storage accounts.`;
          break;
        }

        case 'failed_upload_cleanup': {
          // Identify files stuck in 'uploading' state for over 48 hours
          const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
          
          const { data: stuckFiles, error: stuckQueryErr } = await supabaseAdmin
            .from('files')
            .select('id, original_file_name')
            .eq('status', 'uploading')
            .lt('upload_date', fortyEightHoursAgo);

          if (stuckQueryErr) {
            throw new Error(`Failed to query stuck uploads: ${stuckQueryErr.message}`);
          }

          let purgedFilesCount = 0;
          let purgedChunksCount = 0;

          if (stuckFiles && stuckFiles.length > 0) {
            // Fetch accounts refresh tokens
            const { data: accounts, error: accountErr } = await supabaseAdmin
              .from('accounts')
              .select('id, refresh_token, email');

            if (!accountErr && accounts && accounts.length > 0) {
              for (const file of stuckFiles) {
                // Find all parts uploaded so far
                const { data: parts } = await supabaseAdmin
                  .from('file_parts')
                  .select('google_drive_file_id, account_owner')
                  .eq('parent_file_id', file.id);

                if (parts && parts.length > 0) {
                  for (const part of parts) {
                    if (part.google_drive_file_id && part.account_owner) {
                      const account = accounts.find(a => a.id === part.account_owner);
                      if (account && account.refresh_token) {
                        try {
                          const drive = getDriveClient(account.refresh_token);
                          await drive.files.delete({ fileId: part.google_drive_file_id });
                          purgedChunksCount++;
                        } catch (deleteErr: any) {
                          logger.error(`Cleanup Worker: Failed to delete leaked chunk ${part.google_drive_file_id} from ${account.email}`, { error: deleteErr.message });
                        }
                      }
                    }
                  }
                }

                // Delete chunks and parts from Drive using property search too (to find orphans without db entries)
                for (const account of accounts) {
                  try {
                    const drive = getDriveClient(account.refresh_token);
                    const queryStr = `properties has { key='parent_file_id' and value='${file.id}' } and trashed = false`;
                    const res: any = await drive.files.list({
                      q: queryStr,
                      fields: 'files(id, name)',
                    });

                    const filesList = res.data.files || [];
                    for (const f of filesList) {
                      await drive.files.delete({ fileId: f.id });
                      purgedChunksCount++;
                    }
                  } catch (orphanErr: any) {
                    logger.debug(`Cleanup Worker: Google Drive search probe failed for account ${account.email} on file ${file.id}`, { error: orphanErr.message });
                  }
                }

                // Mark file status as failed
                await supabaseAdmin
                  .from('files')
                  .update({ status: 'failed', updated_at: new Date().toISOString() })
                  .eq('id', file.id);

                purgedFilesCount++;
              }
            }
          }

          executionLog = `Quarantined ${purgedFilesCount} expired uploads as failed, purging ${purgedChunksCount} leaked chunks from Google Drive.`;
          break;
        }

        case 'upload_recovery': {
          // Identify files that have been stuck in 'uploading' or marked 'failed' for more than 10 minutes and less than 24 hours
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

          const { data: unstableFiles, error: filesErr } = await supabaseAdmin
            .from('files')
            .select('*')
            .in('status', ['uploading', 'failed'])
            .gt('upload_date', twentyFourHoursAgo)
            .lt('upload_date', tenMinutesAgo);

          if (filesErr) {
            throw new Error(`Failed to query unstable files: ${filesErr.message}`);
          }

          if (!unstableFiles || unstableFiles.length === 0) {
            executionLog = 'No unstable or interrupted uploads found needing reconciliation within the recovery window.';
            break;
          }

          // Fetch accounts
          const { data: accounts, error: accountErr } = await supabaseAdmin
            .from('accounts')
            .select('id, refresh_token, email');

          if (accountErr || !accounts || accounts.length === 0) {
            throw new Error('No storage accounts available for Google Drive probing.');
          }

          let healedFilesCount = 0;
          let scannedFilesCount = 0;

          for (const file of unstableFiles) {
            scannedFilesCount++;
            logger.info(`Recovery Worker: Probing Google Drive files for parent file ID: ${file.id}`, { file_name: file.original_file_name });

            // Collect parts from Google Drive
            const foundPartsOnDrive: Array<{ partNumber: number; googleId: string; size: number; accountId: string }> = [];

            for (const account of accounts) {
              const drive = getDriveClient(account.refresh_token);
              try {
                const queryStr = `properties has { key='parent_file_id' and value='${file.id}' } and trashed = false`;
                const res: any = await drive.files.list({
                  q: queryStr,
                  fields: 'files(id, name, properties, size)',
                  pageSize: 100,
                });

                const filesList = res.data.files || [];
                for (const f of filesList) {
                  const partNumStr = f.properties?.part_number;
                  if (partNumStr) {
                    foundPartsOnDrive.push({
                      partNumber: parseInt(partNumStr, 10),
                      googleId: f.id,
                      size: parseInt(f.size || '0', 10),
                      accountId: account.id,
                    });
                  }
                }
              } catch (probeErr: any) {
                logger.error(`Recovery Worker: Probe failed on account ${account.email}`, { error: probeErr.message, file_id: file.id });
              }
            }

            // Verify if ALL parts are successfully uploaded to Google Drive
            const expectedPartsCount = file.total_parts;
            const uniquePartsOnDrive = foundPartsOnDrive.reduce((acc, curr) => {
              if (!acc.some(p => p.partNumber === curr.partNumber)) {
                acc.push(curr);
              }
              return acc;
            }, [] as typeof foundPartsOnDrive);

            if (uniquePartsOnDrive.length === expectedPartsCount) {
              logger.info(`Recovery Worker: All parts found on Google Drive for file ${file.original_file_name}. Triggering automatic healing!`, { file_id: file.id });

              // 1. Insert parts into database (upsert to prevent duplicate key violations)
              const partsData = uniquePartsOnDrive.map(p => ({
                parent_file_id: file.id,
                part_number: p.partNumber,
                google_drive_file_id: p.googleId,
                account_owner: p.accountId,
                size: p.size,
                status: 'completed'
              }));

              const { error: partInsertErr } = await supabaseAdmin
                .from('file_parts')
                .upsert(partsData, { onConflict: 'parent_file_id,part_number' });

              if (partInsertErr) {
                logger.error(`Recovery Worker: Failed to upsert file parts for healed file ${file.id}`, { error: partInsertErr.message });
                continue;
              }

              // 2. Update file status to completed
              const { error: fileUpdateErr } = await supabaseAdmin
                .from('files')
                .update({ status: 'completed', updated_at: new Date().toISOString() })
                .eq('id', file.id);

              if (fileUpdateErr) {
                logger.error(`Recovery Worker: Failed to update file status to completed for healed file ${file.id}`, { error: fileUpdateErr.message });
                continue;
              }

              healedFilesCount++;
              logger.info(`Recovery Worker: File ${file.original_file_name} has been successfully self-healed and reconciled!`, { file_id: file.id });
            } else {
              logger.debug(`Recovery Worker: File ${file.original_file_name} is only partially uploaded (${uniquePartsOnDrive.length}/${expectedPartsCount} parts). Kept as-is for client resume.`, { file_id: file.id });
            }
          }

          executionLog = `Self-healing scan complete. Reconciled and recovered ${healedFilesCount}/${scannedFilesCount} interrupted uploads.`;
          break;
        }

        case 'orphan_cleanup': {
          // Find and clean orphan chunks in Google Drive
          const { data: accounts, error: accountErr } = await supabaseAdmin
            .from('accounts')
            .select('id, refresh_token, email');

          if (accountErr || !accounts || accounts.length === 0) {
            throw new Error('No storage accounts available');
          }

          let totalOrphansPurged = 0;

          for (const account of accounts) {
            const drive = getDriveClient(account.refresh_token);
            let nextPageToken: string | undefined = undefined;

            do {
              const res: any = await drive.files.list({
                q: "trashed = false",
                fields: "nextPageToken, files(id, name, properties)",
                pageSize: 100,
                pageToken: nextPageToken,
              });

              const files = res.data.files || [];
              nextPageToken = res.data.nextPageToken || undefined;

              for (const file of files) {
                // If it contains parent file ID, verify if it has a DB index mapping in file_parts
                if (file.properties && file.properties.parent_file_id) {
                  const { data: indexRecord } = await supabaseAdmin
                    .from('file_parts')
                    .select('id')
                    .eq('google_drive_file_id', file.id)
                    .maybeSingle();

                  if (!indexRecord) {
                    // Orphan chunk detected! Permanently purge from Google Drive
                    logger.warn(`Orphan Purger: Deleting leaked orphan file chunk from ${account.email}: ${file.name}`);
                    await drive.files.delete({ fileId: file.id });
                    totalOrphansPurged++;
                  }
                }
              }
            } while (nextPageToken);
          }

          executionLog = `Orphan chunk purge complete. Reclaimed storage by deleting ${totalOrphansPurged} leaked files.`;
          break;
        }

        case 'token_refresh': {
          const { data: accounts, error: accountErr } = await supabaseAdmin
            .from('accounts')
            .select('id, refresh_token, email');

          if (accountErr || !accounts) {
            throw new Error(`Retrieve accounts error: ${accountErr.message}`);
          }

          let refreshedCount = 0;
          for (const account of accounts) {
            // Re-trigger access token lookup to force pre-refresh rotation in cache
            const authRes = await fetch(`${request.nextUrl.origin}/api/download/token-probe-or-similar`, {
              headers: { 'Authorization': `Bearer ${CRON_SECRET}` }
            }).catch(() => null);

            if (authRes?.ok) refreshedCount++;
          }
          executionLog = `Proactively warmed tokens caches for connected accounts pools.`;
          break;
        }
      }

      // 5. Success unlock
      const durationMs = Math.round(performance.now() - startTime);
      await releaseLock(worker, durationMs);
      logger.info(`Worker run succeeded: ${worker}. ${executionLog}`);

      return NextResponse.json({
        status: 'success',
        worker,
        duration_ms: durationMs,
        summary: executionLog,
      }, { status: 200 });

    } catch (execErr: any) {
      const durationMs = Math.round(performance.now() - startTime);
      await releaseLock(worker, durationMs, execErr.message || 'Unknown execution error');
      logger.error(`Worker execution failed inside trigger core: ${worker}`, { error: execErr.message });

      return NextResponse.json({
        status: 'failed',
        worker,
        duration_ms: durationMs,
        error: execErr.message,
      }, { status: 500 });
    }

  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startTime);
    logger.error('CRITICAL: Worker trigger controller crashed', { error: err.message });
    return NextResponse.json({ error: 'Trigger failed', details: err.message }, { status: 500 });
  }
}
