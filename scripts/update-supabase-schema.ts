/**
 * Update Supabase schema — adds academic_tracks table and track_id columns.
 * Run via: bun run scripts/update-supabase-schema.ts
 *
 * Strategy: Use the PostgREST API to insert data into existing tables,
 * but for DDL (CREATE TABLE), we need to use the SQL Editor manually.
 * This script will:
 * 1. Try to query academic_tracks table (if exists, schema already updated)
 * 2. If not, print the SQL the user needs to run manually
 */
import { createClient } from "@supabase/supabase-js";

const url = "https://ntdzvujhujnbazaqzuvo.supabase.co";
const anonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50ZHp2dWpodWpuYmF6YXF6dXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTk0NzQsImV4cCI6MjEwMjgzNTQ3NH0.MD_tGI24lHf1RSrt6zhSru7E4VfmZP_VVASYDV8b-1Y";

const supabase = createClient(url, anonKey);

async function checkSchemaStatus() {
  console.log("🔍 Checking if academic_tracks table exists...");

  const { data, error } = await supabase
    .from("academic_tracks")
    .select("id")
    .limit(1);

  if (error) {
    if (
      error.message.includes("Could not find the table") ||
      error.message.includes("relation") ||
      error.message.includes("does not exist") ||
      error.code === "PGRST205"
    ) {
      console.log("❌ academic_tracks table does NOT exist.");
      console.log("");
      console.log("📋 Please run this SQL in Supabase SQL Editor:");
      console.log("   https://supabase.com/dashboard/project/ntdzvujhujnbazaqzuvo/sql/new");
      console.log("");
      console.log("=== SQL START ===");
      console.log(`
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

-- 6. Update existing cohort_groups to have track_id (1=PEP)
UPDATE cohort_groups SET track_id = 1 WHERE track_id IS NULL;

-- 7. Update app_users: scope_institution_id default to 1
UPDATE app_users SET scope_institution_id = 1 WHERE scope_institution_id IS NULL;
ALTER TABLE app_users ALTER COLUMN scope_institution_id SET DEFAULT 1;
`);
      console.log("=== SQL END ===");
      return false;
    }
    console.error("Unexpected error:", error);
    return false;
  }

  console.log("✅ academic_tracks table EXISTS with", data?.length ?? 0, "tracks");
  return true;
}

async function main() {
  const exists = await checkSchemaStatus();

  if (exists) {
    // Verify tracks
    const { data: tracks } = await supabase
      .from("academic_tracks")
      .select("*")
      .order("id");
    console.log("📚 Academic tracks:", tracks?.length ?? 0);
    tracks?.forEach((t) => {
      console.log(`   - ID ${t.id}: ${t.track_name_ar} (${t.code})`);
    });

    // Verify cohorts have track_id
    const { data: cohorts } = await supabase
      .from("cohort_groups")
      .select("id, group_name, track_id")
      .limit(5);
    console.log("👥 Sample cohorts:");
    cohorts?.forEach((c) => {
      console.log(`   - ID ${c.id}: ${c.group_name} (trackId: ${c.track_id ?? "NULL"})`);
    });
  }

  process.exit(exists ? 0 : 1);
}

main();
