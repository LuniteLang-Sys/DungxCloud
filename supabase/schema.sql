-- schema.sql
-- Run this in your Supabase SQL Editor

-- 1. accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  remaining_storage BIGINT DEFAULT 0,
  token_status TEXT DEFAULT 'active', -- active, expired, error
  health_status TEXT DEFAULT 'healthy', -- healthy, quota_exceeded
  refresh_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. files table
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_file_name TEXT NOT NULL,
  stored_file_name TEXT NOT NULL,
  mime_type TEXT,
  size BIGINT NOT NULL DEFAULT 0,
  total_parts INTEGER NOT NULL DEFAULT 1,
  is_split BOOLEAN NOT NULL DEFAULT false,
  checksum TEXT,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'uploading', -- uploading, completed, failed
  visibility TEXT DEFAULT 'private',
  owner_drive_account UUID REFERENCES accounts(id) ON DELETE SET NULL,
  preview_supported BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. file_parts table
CREATE TABLE IF NOT EXISTS file_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  google_drive_file_id TEXT,
  account_owner UUID REFERENCES accounts(id) ON DELETE SET NULL,
  size BIGINT NOT NULL DEFAULT 0,
  checksum TEXT,
  status TEXT DEFAULT 'uploading', -- uploading, completed, failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_file_id, part_number)
);

-- 4. upload_logs table
CREATE TABLE IF NOT EXISTS upload_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. download_logs table
CREATE TABLE IF NOT EXISTS download_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Setup RLS (Row Level Security) - Only authenticated Admin can access
-- Assuming we use Supabase standard Auth for admin later, or we can just bypass for now by using Service Role Key.
-- If using Service Role Key from Next.js backend, RLS can be enabled but bypassed by service key.

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for anon/authenticated (depending on how we auth).
-- For this "Poor man's NAS", we will mostly use the Service Role key in API routes,
-- so RLS policies can be left empty (which means DENY ALL from public API).
