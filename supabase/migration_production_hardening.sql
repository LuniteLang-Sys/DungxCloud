-- supabase/migration_production_hardening.sql
-- Production database hardening, relational integrity, indexing, and RLS policies.
-- Execute this script inside your Supabase SQL Editor.

-- ============================================================================
-- 1. DATABASE RELATIONAL INTEGRITY & CASCADE DELETE HARMONIZATION
-- ============================================================================

-- Ensure file_parts constraint uses ON DELETE CASCADE to prevent database orphans
ALTER TABLE IF EXISTS public.file_parts 
  DROP CONSTRAINT IF EXISTS file_parts_parent_file_id_fkey;

ALTER TABLE public.file_parts
  ADD CONSTRAINT file_parts_parent_file_id_fkey 
  FOREIGN KEY (parent_file_id) 
  REFERENCES public.files(id) 
  ON DELETE CASCADE;

-- Ensure upload_logs constraint uses ON DELETE CASCADE
ALTER TABLE IF EXISTS public.upload_logs 
  DROP CONSTRAINT IF EXISTS upload_logs_file_id_fkey;

ALTER TABLE public.upload_logs
  ADD CONSTRAINT upload_logs_file_id_fkey 
  FOREIGN KEY (file_id) 
  REFERENCES public.files(id) 
  ON DELETE CASCADE;

-- Ensure download_logs constraint uses ON DELETE CASCADE
ALTER TABLE IF EXISTS public.download_logs 
  DROP CONSTRAINT IF EXISTS download_logs_file_id_fkey;

ALTER TABLE public.download_logs
  ADD CONSTRAINT download_logs_file_id_fkey 
  FOREIGN KEY (file_id) 
  REFERENCES public.files(id) 
  ON DELETE CASCADE;

-- ============================================================================
-- 2. ENTERPRISE INDEXING STRATEGY
-- ============================================================================

-- Index on files for fast parent folder listing (virtual folder tree traversal)
CREATE INDEX IF NOT EXISTS idx_files_parent_id_status 
  ON public.files(parent_id, status);

-- Index on files for tracking files owned by specific drive accounts
CREATE INDEX IF NOT EXISTS idx_files_owner_drive_account 
  ON public.files(owner_drive_account);

-- Index on file_parts for high-performance segment retrieval and assembly lookups
CREATE INDEX IF NOT EXISTS idx_file_parts_parent_file_id 
  ON public.file_parts(parent_file_id, part_number);

-- Index on accounts to filter healthy storage accounts during upload allocations
CREATE INDEX IF NOT EXISTS idx_accounts_token_status_health 
  ON public.accounts(token_status, health_status);

-- Index on upload_logs for background cron diagnostic sweeps
CREATE INDEX IF NOT EXISTS idx_upload_logs_created_at 
  ON public.upload_logs(created_at);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS) & HARDENING POLICIES
-- ============================================================================

-- Enforce RLS on all system tables (locks down tables completely from anonymous HTTP API queries)
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_locks ENABLE ROW LEVEL SECURITY;

-- Drop any legacy insecure wildcard policies
DROP POLICY IF EXISTS "Allow service role access only" ON public.accounts;
DROP POLICY IF EXISTS "Allow service role access only" ON public.files;
DROP POLICY IF EXISTS "Allow service role access only" ON public.file_parts;
DROP POLICY IF EXISTS "Allow service role access only" ON public.upload_logs;
DROP POLICY IF EXISTS "Allow service role access only" ON public.download_logs;
DROP POLICY IF EXISTS "Allow service role access only" ON public.worker_locks;

-- Standardized SRE Best Practice: No public policies exist, meaning any API query 
-- from standard clients (anon/auth keys) is rejected with 401 Unauthorized.
-- Only backend API routes utilizing the service_role key (which bypasses RLS naturally in Supabase)
-- are granted access. This prevents metadata harvesting or unauthorized direct access.
