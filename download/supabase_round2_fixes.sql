-- =====================================================
-- Talib — Round 2 Fixes Migration (Supabase / PostgreSQL)
-- =====================================================
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It is SAFE to run even if some tables/columns already exist
-- (everything uses IF NOT EXISTS / IF NOT EXISTS-style guards).
--
-- What it adds:
--   1. study_groups table (المجموعات) + link cohort_groups.group_id
--   2. join_requests table (طلبات الانضمام)
--   3. app_users.scope_group_id column
--   4. Auto-backfill: creates a default group per (specialty, year, track)
--      and links existing cohorts to it, so old data keeps working.
-- =====================================================

-- ---------- 1. study_groups ----------
CREATE TABLE IF NOT EXISTS study_groups (
  id SERIAL PRIMARY KEY,
  specialty_id INTEGER NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  track_id INTEGER REFERENCES academic_tracks(id) ON DELETE SET NULL,
  group_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE study_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all access study_groups" ON study_groups;
CREATE POLICY "Allow anon all access study_groups" ON study_groups FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated all access study_groups" ON study_groups;
CREATE POLICY "Allow authenticated all access study_groups" ON study_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- link cohorts to their parent group
ALTER TABLE cohort_groups ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES study_groups(id) ON DELETE SET NULL;

-- ---------- 2. join_requests ----------
CREATE TABLE IF NOT EXISTS join_requests (
  id SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  cohort_id INTEGER NOT NULL REFERENCES cohort_groups(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES study_groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | rejected
  message TEXT NOT NULL DEFAULT '',
  reviewer_id INTEGER,
  reviewer_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_join_requests_requester ON join_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_cohort ON join_requests(cohort_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_status ON join_requests(status);
ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all access join_requests" ON join_requests;
CREATE POLICY "Allow anon all access join_requests" ON join_requests FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated all access join_requests" ON join_requests;
CREATE POLICY "Allow authenticated all access join_requests" ON join_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------- 3. app_users.scope_group_id ----------
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS scope_group_id INTEGER REFERENCES study_groups(id) ON DELETE SET NULL;

-- ---------- 4. Backfill: default group per (specialty, year, track) ----------
-- Creates "المجموعة 01" for every (specialty, year, track) combination that
-- has cohorts but no group yet, then links those cohorts to it.
INSERT INTO study_groups (specialty_id, academic_year_id, track_id, group_name, description)
SELECT DISTINCT
  cg.specialty_id,
  cg.academic_year_id,
  cg.track_id,
  'المجموعة 01',
  'مجموعة افتراضية أُنشئت تلقائياً أثناء التحديث'
FROM cohort_groups cg
WHERE NOT EXISTS (
  SELECT 1 FROM study_groups sg
  WHERE sg.specialty_id = cg.specialty_id
    AND sg.academic_year_id = cg.academic_year_id
    AND sg.track_id IS NOT DISTINCT FROM cg.track_id
);

UPDATE cohort_groups cg
SET group_id = sg.id
FROM study_groups sg
WHERE sg.specialty_id = cg.specialty_id
  AND sg.academic_year_id = cg.academic_year_id
  AND sg.track_id IS NOT DISTINCT FROM cg.track_id
  AND cg.group_id IS NULL;

-- ---------- 5. student_profiles per-user fix (informational) ----------
-- The app now upserts profiles with id = user id. Old shared row (id=1)
-- is harmless but you may clean it:
-- DELETE FROM student_profiles WHERE id = 1 AND user_id = 'local';
