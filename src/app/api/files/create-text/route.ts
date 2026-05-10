import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCachedAccessToken } from '@/lib/google';

export async function POST(request: Request) {
  try {
    const { name, content, parentId } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'File name is required' }, { status: 400 });
    }

    let finalName = name.trim();
    if (!finalName.toLowerCase().endsWith('.txt')) {
      finalName += '.txt';
    }

    const textContent = content || '';
    const size = Buffer.byteLength(textContent, 'utf8');

    // 1. Fetch active and healthy Google Drive accounts
    const { data: accounts, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('health_status', 'healthy')
      .eq('token_status', 'active');

    if (accountError || !accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No active and healthy storage accounts found' }, { status: 500 });
    }

    // Pick the account with the most remaining storage to balance disk usage
    const sortedAccounts = [...accounts].sort((a, b) => Number(b.remaining_storage) - Number(a.remaining_storage));
    const targetAccount = sortedAccounts[0];

    if (Number(targetAccount.remaining_storage) < size) {
      return NextResponse.json({ error: 'Insufficient storage in your storage accounts' }, { status: 507 });
    }

    // 2. Fetch the access token for the targeted Google account
    const accessToken = await getCachedAccessToken(targetAccount.refresh_token);

    // 3. Perform a Google Drive Multipart Upload (Metadata + File Body in one HTTP request)
    const boundary = 'antigravity_nas_multipart_boundary';
    const metadata = {
      name: finalName,
      mimeType: 'text/plain',
    };

    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
      textContent +
      closeDelimiter;

    const driveRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(multipartRequestBody, 'utf8').toString(),
      },
      body: multipartRequestBody,
    });

    if (!driveRes.ok) {
      const errorText = await driveRes.text();
      console.error('Google Drive API Multipart upload error:', errorText);
      throw new Error(`Google Drive API error: ${driveRes.statusText}`);
    }

    const driveFile = await driveRes.json();
    const googleDriveFileId = driveFile.id;

    if (!googleDriveFileId) {
      throw new Error('Google Drive failed to return a file ID');
    }

    // 4. Register the new file record in Supabase 'files' table
    const { data: fileRecord, error: fileError } = await supabaseAdmin
      .from('files')
      .insert({
        original_file_name: finalName,
        stored_file_name: finalName,
        mime_type: 'text/plain',
        size: size,
        total_parts: 1,
        is_split: false,
        status: 'completed',
        parent_id: parentId || null,
        preview_supported: true, // We can preview text files natively!
      })
      .select('*')
      .single();

    if (fileError || !fileRecord) {
      console.error('Failed to create file record in Supabase:', fileError);
      throw new Error('Failed to create file record');
    }

    // 5. Register the file part in 'file_parts' table
    const { error: partError } = await supabaseAdmin
      .from('file_parts')
      .insert({
        parent_file_id: fileRecord.id,
        part_number: 1, // First and only part
        google_drive_file_id: googleDriveFileId,
        account_owner: targetAccount.id,
        size: size,
        status: 'completed',
      });

    if (partError) {
      console.error('Failed to create file part in Supabase:', partError);
      throw new Error('Failed to create file part record');
    }

    // 6. Proactively trigger background quota update for this account
    try {
      const { refreshAccountQuota } = await import('@/lib/google');
      // Fire-and-forget so we don't block the user's quick API response
      refreshAccountQuota(targetAccount.id, targetAccount.refresh_token);
    } catch (quotaErr) {
      console.error('Failed to trigger quota refresh:', quotaErr);
    }

    return NextResponse.json(fileRecord);
  } catch (error: any) {
    console.error('Create text file error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
