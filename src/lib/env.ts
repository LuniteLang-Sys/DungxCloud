// src/lib/env.ts
// Secure, zero-dependency environment validation module for Next.js Serverless Control Plane.
// Validates all critical production keys, credentials, and settings.
// Automatically bypasses checks during the Next.js static compilation/build phase.

import { logger } from './logger';

export interface EnvSchema {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
  ENCRYPTION_SECRET: string;
  CRON_SECRET: string;
  CHUNK_SIZE: number;
}

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'ADMIN_PASSWORD',
  'JWT_SECRET',
  'ENCRYPTION_SECRET',
  'CRON_SECRET',
];

export function validateEnvironment(): EnvSchema {
  // 1. Build Phase Bypass Detection
  // Next.js uses different env phases like phase-production-build during static generation
  const isBuildPhase =
    process.env.PHASE === 'phase-production-build' ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.SKIP_ENV_VALIDATION === 'true' ||
    process.env.NODE_ENV === 'test';

  if (isBuildPhase) {
    logger.info('Skipping detailed environment validation during build compilation phase');
    return {} as EnvSchema;
  }

  const missingVars: string[] = [];
  const errors: string[] = [];

  // 2. Existence verification
  for (const key of REQUIRED_ENV_VARS) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      missingVars.push(key);
    }
  }

  if (missingVars.length > 0) {
    const errMsg = `FATAL: Missing critical environment variables: ${missingVars.join(', ')}`;
    logger.fatal(errMsg);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(errMsg);
    }
  }

  // 3. Format & Hardening validation checks
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL must be a secure HTTPS endpoint');
  }

  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (supabaseKey && supabaseKey.split('.').length !== 3) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is malformed (must be a valid JWT secret token)');
  }

  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (adminPassword && adminPassword.length < 8) {
    errors.push('ADMIN_PASSWORD must be at least 8 characters long for production security');
  }

  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret && (jwtSecret.length < 32 || jwtSecret === 'fallback_secret_for_development')) {
    errors.push('JWT_SECRET must be a strong cryptographically random string (at least 32 characters)');
  }

  const encryptionSecret = process.env.ENCRYPTION_SECRET || '';
  if (
    encryptionSecret &&
    (encryptionSecret.length < 32 || encryptionSecret === 'development_encryption_secret_key_32_bytes_fallback')
  ) {
    errors.push('ENCRYPTION_SECRET must be a unique, high-entropy 32+ character key for AES encryption');
  }

  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && (cronSecret.length < 16 || cronSecret === 'fallback_sre_cron_secret')) {
    errors.push('CRON_SECRET must be a secure token of at least 16 characters to protect admin workflows');
  }

  // 4. Fallback execution handling
  if (errors.length > 0) {
    const fullErrorMsg = `FATAL: Environment hardening check failures detected:\n- ${errors.join('\n- ')}`;
    logger.fatal(fullErrorMsg);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(fullErrorMsg);
    }
  }

  logger.info('Environment validated successfully - All production guardrails active');

  return {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: supabaseKey,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || '',
    ADMIN_PASSWORD: adminPassword,
    JWT_SECRET: jwtSecret,
    ENCRYPTION_SECRET: encryptionSecret,
    CRON_SECRET: cronSecret,
    CHUNK_SIZE: Number(process.env.CHUNK_SIZE) || 1024 * 1024 * 1024,
  };
}

// Automatically execute on module loading (singleton trigger)
export const env = validateEnvironment();
export default env;
