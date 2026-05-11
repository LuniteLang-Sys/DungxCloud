import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getGoogleAuthClient } from '@/lib/google';
import { logger } from '@/lib/logger';
import { extractTraceContext } from '@/lib/telemetry';

const CHUNK_SIZE = Number(process.env.CHUNK_SIZE) || 1024 * 1024 * 1024; // 1GB default

export async function POST(request: Request) {
  const { trace_id, span_id, request_id } = extractTraceContext(request.headers);
  const startTime = performance.now();

  try {
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const origin = request.headers.get('origin') || `${protocol}://${host}`;
    const { filename, mimeType, size } = await request.json();

    if (!filename || !size) {
      logger.warn('Upload initialization rejected: missing parameters', {
        trace_id,
        span_id,
        request_id,
        filename,
        size,
      });
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    logger.info('Upload initialization process started', {
      trace_id,
      span_id,
      request_id,
      file_name: filename,
      file_size: size,
      mime_type: mimeType,
    });

    // 1. Determine parts
    const isSplit = size > CHUNK_SIZE;
    const totalParts = isSplit ? Math.ceil(size / CHUNK_SIZE) : 1;

    // 2. Fetch healthy accounts with available quota
    const { data: accounts, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('health_status', 'healthy')
      .eq('token_status', 'active');

    if (accountError || !accounts || accounts.length === 0) {
      logger.error('No available healthy storage accounts found in database', {
        trace_id,
        span_id,
        request_id,
        error: accountError?.message,
      });
      return NextResponse.json({ error: 'No available storage accounts' }, { status: 500 });
    }

    // 3. Allocation Logic: In-memory virtual remaining storage deduction loop
    const virtualAccounts = accounts.map(acc => ({
      ...acc,
      virtual_storage: Number(acc.remaining_storage)
    }));

    const allocations = [];
    let currentByte = 0;

    for (let i = 0; i < totalParts; i++) {
      const partSize = Math.min(CHUNK_SIZE, size - currentByte);
      
      // Find a healthy account that has enough virtual remaining storage
      const matchedAccountIndex = virtualAccounts.findIndex(a => a.virtual_storage > partSize);
      
      if (matchedAccountIndex === -1) {
        logger.error('Insufficient storage pools across connected accounts', {
          trace_id,
          span_id,
          request_id,
          file_name: filename,
          file_size: size,
          total_parts: totalParts,
          part_failed: i + 1,
          part_size: partSize,
          available_accounts_capacities: virtualAccounts.map(a => ({ email: a.email, remaining_virtual: a.virtual_storage })),
        });
        return NextResponse.json({ error: 'Insufficient storage pools across all connected accounts.' }, { status: 507 });
      }

      const account = virtualAccounts[matchedAccountIndex];
      account.virtual_storage -= partSize; // virtual decrement to prevent double-allocating overlapping blocks

      allocations.push({
        partNumber: i + 1,
        size: partSize,
        account: accounts[matchedAccountIndex], // Push original database model
      });

      currentByte += partSize;
    }

    logger.info('Virtual space allocation calculation completed', {
      trace_id,
      span_id,
      request_id,
      file_name: filename,
      allocations_count: allocations.length,
      allocation_details: allocations.map(a => ({ part: a.partNumber, size: a.size, email: a.account.email })),
    });

    // 4. Create a pending record in `files` table FIRST to generate the ID for Google Drive property indexing
    const { data: fileData, error: fileError } = await supabaseAdmin.from('files').insert({
      original_file_name: filename,
      stored_file_name: filename,
      mime_type: mimeType,
      size: size,
      total_parts: totalParts,
      is_split: isSplit,
      status: 'uploading'
    }).select('id').single();

    if (fileError || !fileData) {
      logger.error('Failed to register file record in database during init', {
        trace_id,
        span_id,
        request_id,
        file_name: filename,
        error: fileError?.message,
      });
      throw new Error('Failed to create file record in DB');
    }

    // 5. Initialize Resumable Upload Sessions with Google Drive
    let sessions;
    try {
      sessions = await Promise.all(allocations.map(async (allocation) => {
        const sessionStart = performance.now();
        const authClient = getGoogleAuthClient(allocation.account.refresh_token);
        const { token } = await authClient.getAccessToken();

        if (!token) {
          logger.error('Could not retrieve OAuth token for storage account', {
            trace_id,
            span_id,
            request_id,
            account_id: allocation.account.id,
            account_email: allocation.account.email,
          });
          throw new Error(`Could not get access token for account ${allocation.account.email}`);
        }

        const partFilename = isSplit ? `${filename}.part${allocation.partNumber}` : filename;
        const partMimeType = isSplit ? 'application/octet-stream' : mimeType;

        const metadata = {
          name: partFilename,
          mimeType: partMimeType,
          properties: {
            parent_file_id: fileData.id,
            part_number: allocation.partNumber.toString(),
            is_split: isSplit.toString(),
            original_file_name: filename,
          }
        };

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': partMimeType,
            'X-Upload-Content-Length': allocation.size.toString(),
            'Origin': origin,
          },
          body: JSON.stringify(metadata),
        });

        const sessionDuration = Math.round(performance.now() - sessionStart);

        if (!res.ok) {
          const errorText = await res.text();
          logger.error('Google Drive Resumable Session creation failed', {
            trace_id,
            span_id,
            request_id,
            account_id: allocation.account.id,
            account_email: allocation.account.email,
            part_number: allocation.partNumber,
            google_status_code: res.status,
            google_error: errorText,
            duration_ms: sessionDuration,
          });
          throw new Error(`Failed to init upload session: ${errorText}`);
        }

        const uploadUrl = res.headers.get('location');

        if (!uploadUrl) {
          logger.error('Google Drive did not return location header for resumable session', {
            trace_id,
            span_id,
            request_id,
            account_id: allocation.account.id,
            part_number: allocation.partNumber,
            duration_ms: sessionDuration,
          });
          throw new Error('No location header returned from Google Drive API');
        }

        logger.debug('Google Drive Resumable URL initialized', {
          trace_id,
          span_id,
          request_id,
          account_id: allocation.account.id,
          part_number: allocation.partNumber,
          duration_ms: sessionDuration,
        });

        return {
          partNumber: allocation.partNumber,
          size: allocation.size,
          uploadUrl,
          accountId: allocation.account.id,
        };
      }));
    } catch (sessionErr: any) {
      // SRE Self-Healing: Clean up the registered database file entry to prevent dangling pending records
      await supabaseAdmin.from('files').delete().eq('id', fileData.id);
      throw sessionErr;
    }

    const durationMs = Math.round(performance.now() - startTime);
    logger.info('Upload initialization completed successfully', {
      trace_id,
      span_id,
      request_id,
      file_id: fileData.id,
      file_name: filename,
      total_parts: totalParts,
      duration_ms: durationMs,
    });

    return NextResponse.json({
      fileId: fileData.id,
      sessions,
      isSplit,
      chunkSize: CHUNK_SIZE
    });

  } catch (error: any) {
    const durationMs = Math.round(performance.now() - startTime);
    logger.error('Failed to complete upload initialization', {
      trace_id,
      span_id,
      request_id,
      error: error.message || error,
      duration_ms: durationMs,
    });
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

