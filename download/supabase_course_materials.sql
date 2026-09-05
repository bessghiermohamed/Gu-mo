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

-- ------------------------------------------------------------
-- OPTIONAL hygiene (round 41 bugfix): rows uploaded BEFORE the fix were
-- stamped with the UPLOADER's specialty instead of the course's. The app
-- now reads course materials by module_id alone (visibility restored for
-- students without this), but re-stamping keeps specialty_id truthful:
-- ------------------------------------------------------------
UPDATE library_references r
SET specialty_id = m.specialty_id
FROM module_courses m
WHERE r.module_id = m.id
  AND r.specialty_id IS DISTINCT FROM m.specialty_id;
