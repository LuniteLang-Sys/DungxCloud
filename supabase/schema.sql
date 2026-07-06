-- supabase/schema.sql
-- Run this in your Supabase SQL Editor to initialize a fully hardened database from scratch.

-- 1. accounts table
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  remaining_storage BIGINT DEFAULT 0,
  total_storage BIGINT DEFAULT 16106127360,
  token_status TEXT DEFAULT 'active', -- active, expired, error
  health_status TEXT DEFAULT 'healthy', -- healthy, quota_exceeded
  refresh_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. files table (with virtual folder self-reference hierarchy support)
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_file_name TEXT NOT NULL,
  stored_file_name TEXT NOT NULL,
  mime_type TEXT,
  size BIGINT NOT NULL DEFAULT 0 CHECK (size >= 0),
  total_parts INTEGER NOT NULL DEFAULT 1 CHECK (total_parts >= 0),
  is_split BOOLEAN NOT NULL DEFAULT false,
  checksum TEXT,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'uploading', -- uploading, completed, failed
  visibility TEXT DEFAULT 'private',
  owner_drive_account UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  preview_supported BOOLEAN DEFAULT false,
  parent_id UUID REFERENCES public.files(id) ON DELETE CASCADE, -- self-referencing virtual folder node
  preview_url TEXT,
  thumbnail_url TEXT,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. file_parts table (stores segments metadata for split-uploads)
CREATE TABLE IF NOT EXISTS public.file_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_file_id UUID REFERENCES public.files(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL CHECK (part_number >= 1),
  google_drive_file_id TEXT,
  account_owner UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  size BIGINT NOT NULL DEFAULT 0 CHECK (size >= 0),
  checksum TEXT,
  status TEXT DEFAULT 'uploading', -- uploading, completed, failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_file_id, part_number)
);

-- 4. upload_logs table (for tracking file upload attempts and failures)
CREATE TABLE IF NOT EXISTS public.upload_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES public.files(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. download_logs table (for auditing file download events)
CREATE TABLE IF NOT EXISTS public.download_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES public.files(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. worker_locks table (for coordinating distributed background cron schedulers)
CREATE TABLE IF NOT EXISTS public.worker_locks (
  worker_name TEXT PRIMARY KEY,
  locked_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  last_success TIMESTAMP WITH TIME ZONE,
  last_run_duration_ms INTEGER,
  last_error TEXT
);

-- ============================================================================
-- DB INDEXES & RELATION SHIELDS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_files_parent_id_status 
  ON public.files(parent_id, status);

CREATE INDEX IF NOT EXISTS idx_files_owner_drive_account 
  ON public.files(owner_drive_account);

CREATE INDEX IF NOT EXISTS idx_file_parts_parent_file_id 
  ON public.file_parts(parent_file_id, part_number);

CREATE INDEX IF NOT EXISTS idx_accounts_token_status_health 
  ON public.accounts(token_status, health_status);

CREATE INDEX IF NOT EXISTS idx_upload_logs_created_at 
  ON public.upload_logs(created_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) CONFIGURATION
-- ============================================================================

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_locks ENABLE ROW LEVEL SECURITY;

-- Note: RLS is active with empty policies (deny-by-default).
-- Only backend operations using the service role key can read and write data.
