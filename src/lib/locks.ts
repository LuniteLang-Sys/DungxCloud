// src/lib/locks.ts
// Database-backed distributed lock utility using atomic Supabase JS updates to prevent duplicate execution of background crons.

import { supabaseAdmin } from './supabase';

/**
 * Atomically attempts to acquire a distributed lock for a specific worker.
 * @param workerName The identifier of the background worker.
 * @param ttlSeconds The time-to-live of the lock in seconds before it expires.
 * @returns Promise<boolean> True if lock acquired successfully; false otherwise.
 */
export async function acquireLock(workerName: string, ttlSeconds: number): Promise<boolean> {
  const nowStr = new Date().toISOString();
  const expiresAtStr = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  try {
    // Atomic Mutex Update: Only succeeds if worker_locks row exists and previous lock has expired or was never set
    const { data, error } = await supabaseAdmin
      .from('worker_locks')
      .update({
        locked_at: nowStr,
        expires_at: expiresAtStr,
      })
      .eq('worker_name', workerName)
      // Atomic condition: lock has expired or is null (unlocked)
      .or(`expires_at.is.null,expires_at.lt.${nowStr}`)
      .select();

    if (error) {
      console.error(`[LOCKS] Error acquiring lock for ${workerName}:`, error.message);
      return false;
    }

    return data !== null && data.length > 0;
  } catch (err: any) {
    console.error(`[LOCKS] Unexpected error acquiring lock for ${workerName}:`, err.message || err);
    return false;
  }
}

/**
 * Releases a distributed worker lock, logging execution duration metrics and error states.
 * @param workerName The identifier of the background worker.
 * @param durationMs The total execution time of the worker run.
 * @param errorMessage Optional error message if the worker execution failed.
 */
export async function releaseLock(workerName: string, durationMs: number, errorMessage?: string): Promise<void> {
  const updates: any = {
    locked_at: null,
    expires_at: null,
    last_run_duration_ms: durationMs,
  };

  if (errorMessage) {
    updates.last_error = errorMessage;
  } else {
    updates.last_success = new Date().toISOString();
    updates.last_error = null;
  }

  try {
    const { error } = await supabaseAdmin
      .from('worker_locks')
      .update(updates)
      .eq('worker_name', workerName);

    if (error) {
      console.error(`[LOCKS] Failed to release lock for ${workerName}:`, error.message);
    }
  } catch (err: any) {
    console.error(`[LOCKS] Unexpected error releasing lock for ${workerName}:`, err.message || err);
  }
}
