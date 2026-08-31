-- =====================================================
-- Update Supabase schema — adds AcademicTrack + trackId fields
-- Run after the initial schema
-- =====================================================

-- 1. Create academic_tracks table
CREATE TABLE IF NOT EXISTS academic_tracks (
  id SERIAL PRIMARY KEY,
  specialty_id INTEGER NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  track_name_ar TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(specialty_id, code)
);

ALTER TABLE academic_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all access" ON academic_tracks FOR ALL TO anon USING (true) WITH CHECK (true);

-- 2. Add track_id column to cohort_groups
ALTER TABLE cohort_groups ADD COLUMN IF NOT EXISTS track_id INTEGER REFERENCES academic_tracks(id) ON DELETE SET NULL;

-- 3. Add scope_track_id to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS scope_track_id INTEGER REFERENCES academic_tracks(id) ON DELETE SET NULL;

-- 4. Add track_id to student_profiles
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS track_id INTEGER REFERENCES academic_tracks(id) ON DELETE SET NULL;

-- 5. Seed academic tracks (PEP, PEM, PES, INF-GEN, ISIL)
INSERT INTO academic_tracks (specialty_id, track_name_ar, code) VALUES
  (1, 'أستاذ التعليم الابتدائي (PEP)', 'PEP'),
  (1, 'أستاذ التعليم المتوسط (PEM)', 'PEM'),
  (1, 'أستاذ التعليم الثانوي (PES)', 'PES'),
  (1, 'علوم الإعلام الآلي العامة (INF-GEN)', 'INF-GEN'),
  (1, 'هندسة نظم المعلومات اللوجستية (ISIL)', 'ISIL')
ON CONFLICT (specialty_id, code) DO NOTHING;

-- 6. Update existing cohort_groups to have track_id (1=PEP for first 3 cohorts)
UPDATE cohort_groups SET track_id = 1 WHERE track_id IS NULL AND group_name IN ('الفوج 01', 'الفوج 02', 'الفوج 03');

-- 7. Update app_users: scope_institution_id default to 1 (was null before)
UPDATE app_users SET scope_institution_id = 1 WHERE scope_institution_id IS NULL;
ALTER TABLE app_users ALTER COLUMN scope_institution_id SET DEFAULT 1;
