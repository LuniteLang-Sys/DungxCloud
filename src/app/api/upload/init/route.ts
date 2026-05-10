import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getGoogleAuthClient } from '@/lib/google';

const CHUNK_SIZE = Number(process.env.CHUNK_SIZE) || 1024 * 1024 * 1024; // 1GB default

export async function POST(request: Request) {
  try {
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const origin = request.headers.get('origin') || `${protocol}://${host}`;
    const { filename, mimeType, size } = await request.json();

    if (!filename || !size) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

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

    // 4. Initialize Resumable Upload Sessions with Google Drive
    const sessions = await Promise.all(allocations.map(async (allocation) => {
      const authClient = getGoogleAuthClient(allocation.account.refresh_token);
      const { token } = await authClient.getAccessToken();

      if (!token) {
        throw new Error(`Could not get access token for account ${allocation.account.email}`);
      }

      const partFilename = isSplit ? `${filename}.part${allocation.partNumber}` : filename;
      const partMimeType = isSplit ? 'application/octet-stream' : mimeType;

      const metadata = {
        name: partFilename,
        mimeType: partMimeType,
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

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to init upload session: ${errorText}`);
      }

      const uploadUrl = res.headers.get('location');

      if (!uploadUrl) {
        throw new Error('No location header returned from Google Drive API');
      }

      return {
        partNumber: allocation.partNumber,
        size: allocation.size,
        uploadUrl,
        accountId: allocation.account.id,
      };
    }));

    // 5. Create a pending record in `files` table
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
      throw new Error('Failed to create file record in DB');
    }

    return NextResponse.json({
      fileId: fileData.id,
      sessions,
      isSplit,
      chunkSize: CHUNK_SIZE
    });

  } catch (error: any) {
    console.error('Upload init error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
