import { google } from 'googleapis';
import { supabaseAdmin } from './supabase';
import crypto from 'crypto';
import { logger } from './logger';
import { metricsRegistry } from './metrics';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

export const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// We need to request offline access to get a refresh token
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file', // Access only files created by this app
  'https://www.googleapis.com/auth/userinfo.email', // To identify the account
];

export function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force to get refresh token every time
  });
}

// 256-bit key from encryption secret (or secure fallback for development)
const ENCRYPTION_KEY = process.env.ENCRYPTION_SECRET 
  ? crypto.createHash('sha256').update(process.env.ENCRYPTION_SECRET).digest()
  : crypto.createHash('sha256').update('development_encryption_secret_key_32_bytes_fallback').digest();

const IV_LENGTH = 12; // GCM standard IV length is 12 bytes
const AUTH_TAG_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

export function decrypt(encryptedText: string): string {
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      // Not GCM formatted, might be unencrypted plaintext from older DB state
      return encryptedText;
    }
    const [ivHex, encryptedHex, authTagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // Return raw if decryption fails, ensuring full backward compatibility
    return encryptedText;
  }
}

// Function to get drive instance for a specific refresh token
export function getDriveClient(refreshToken: string) {
  const decryptedToken = decrypt(refreshToken);
  const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  client.setCredentials({ refresh_token: decryptedToken });
  return google.drive({ version: 'v3', auth: client });
}

// Function to get oauth2 client for a specific refresh token
export function getGoogleAuthClient(refreshToken: string) {
  const decryptedToken = decrypt(refreshToken);
  const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  client.setCredentials({ refresh_token: decryptedToken });
  return client;
}

// Global in-memory cache to avoid querying Google's OAuth server on every file preview request (saves ~500ms of latency per query)
const tokenCache = new Map<string, { token: string; expiryTime: number }>();

export async function getCachedAccessToken(refreshToken: string, traceId?: string): Promise<string> {
  const cached = tokenCache.get(refreshToken);
  const now = Date.now();
  
  if (cached && cached.expiryTime > now + 120 * 1000) { // 2 minutes buffer
    logger.debug('Token cache hit', {
      trace_id: traceId,
      token_expiry_diff_seconds: Math.round((cached.expiryTime - now) / 1000),
    });
    return cached.token;
  }
  
  const startTime = performance.now();
  const client = getGoogleAuthClient(refreshToken);
  
  try {
    const res = await client.getAccessToken();
    const token = res.token;
    if (!token) {
      metricsRegistry.tokenRefreshFailures.inc();
      logger.error('Failed to retrieve access token from Google OAuth', {
        trace_id: traceId,
        duration_ms: Math.round(performance.now() - startTime),
      });
      throw new Error('Failed to retrieve access token');
    }
    
    const durationMs = Math.round(performance.now() - startTime);
    metricsRegistry.googleOauthLatency.observe(durationMs / 1000); // observe in seconds
    logger.info('Token cache miss - Google OAuth token refreshed', {
      trace_id: traceId,
      duration_ms: durationMs,
    });
    
    const expiryTime = client.credentials.expiry_date || (now + 3500 * 1000);
    
    tokenCache.set(refreshToken, {
      token,
      expiryTime,
    });
    
    return token;
  } catch (err: any) {
    metricsRegistry.tokenRefreshFailures.inc();
    throw err;
  }
}

export async function refreshAccountQuota(accountId: string, refreshToken: string, traceId?: string) {
  const startTime = performance.now();
  logger.info('Storage quota synchronization started', {
    trace_id: traceId,
    account_id: accountId,
  });

  try {
    const drive = getDriveClient(refreshToken);
    const res = await drive.about.get({ fields: 'storageQuota' });
    const quota = res.data.storageQuota;
    if (!quota) {
      logger.warn('Google Drive returned empty storageQuota metadata', {
        trace_id: traceId,
        account_id: accountId,
      });
      return;
    }

    const limit = parseInt(quota.limit || '16106127360', 10); // Default 15GB if not found
    const usage = parseInt(quota.usageInDrive || quota.usage || '0', 10);
    const remainingStorage = limit - usage;
    const healthStatus = remainingStorage < 100 * 1024 * 1024 ? 'quota_exceeded' : 'healthy';

    const { error } = await supabaseAdmin
      .from('accounts')
      .update({
        total_storage: limit,
        remaining_storage: remainingStorage,
        health_status: healthStatus,
        token_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId);

    const durationMs = Math.round(performance.now() - startTime);

    if (error) {
      metricsRegistry.quotaSyncFailures.inc();
      logger.error('Failed to save synchronized account quota in database', {
        trace_id: traceId,
        account_id: accountId,
        duration_ms: durationMs,
        error: error.message,
      });
    } else {
      logger.info('Account quota synchronized successfully', {
        trace_id: traceId,
        account_id: accountId,
        duration_ms: durationMs,
        limit_bytes: limit,
        usage_bytes: usage,
        remaining_bytes: remainingStorage,
        health_status: healthStatus,
      });
    }
  } catch (error: any) {
    metricsRegistry.quotaSyncFailures.inc();
    const durationMs = Math.round(performance.now() - startTime);
    logger.error('Failed to retrieve or refresh account quota', {
      trace_id: traceId,
      account_id: accountId,
      duration_ms: durationMs,
      error: error.message || error,
    });

    const isRevoked = error.status === 400 || error.status === 401 || error.message?.includes('invalid_grant');
    if (isRevoked) {
      logger.fatal('Google Account credentials revoked or expired', {
        trace_id: traceId,
        account_id: accountId,
        google_error_status: error.status,
        google_error_reason: error.message,
      });

      await supabaseAdmin
        .from('accounts')
        .update({
          token_status: 'expired',
          health_status: 'unhealthy',
          updated_at: new Date().toISOString(),
        })
        .eq('id', accountId);
    }
  }
}
