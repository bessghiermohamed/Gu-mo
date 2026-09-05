-- ============================================================
-- طالب | Talib — ربط مواد المقاييس بمواقعها (الجولة ٤١)
-- One-time: run once in Supabase SQL Editor, then never again.
-- https://supabase.com/dashboard/project/_/sql/new
--
-- What it does:
--   module_id    → a material uploaded INSIDE a course is bound to that
--                  course and appears in its المواد tab (never in the
--                  general library).
--   storage_path → stores the Google Drive fileId («على Drive» badge).
--   file_size    → stores the file size in bytes (size badge).
-- All three are optional/appended — existing rows are untouched.
-- ============================================================

ALTER TABLE library_references ADD COLUMN IF NOT EXISTS module_id INTEGER;
ALTER TABLE library_references ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE library_references ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- Helpful index for the course view (المواد tab filter)
CREATE INDEX IF NOT EXISTS idx_library_refs_module
  ON library_references (module_id)
  WHERE module_id IS NOT NULL;
