-- =====================================================
-- Talib — Round 24: Notification Preferences Migration (Supabase / PostgreSQL)
-- =====================================================
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It is SAFE to run even if the table already exists (IF NOT EXISTS guards).
--
-- What it adds (Round 24 — notification system completion):
--   notification_prefs table — per-user muted notification categories
--   so students/supervisors can silence noisy categories instead of
--   receiving everything (anti-spam backbone).
--
--   Muteable categories (stored as a JSON array in muted_types):
--     announcements  → new announcement published in your specialty
--     exams          → new exam scheduled / exam date changed
--     assignments    → new assignment / due date changed
--     library        → new library reference added
--     reminders      → exam & deadline reminders (D-3/D-1/D-0)
--     group_events   → (supervisors) new join requests
--     reports        → (supervisors) new student reports
--
--   NEVER muteable (not in the table's domain, enforced in code):
--     join_approved / join_rejected — the outcome of the user's OWN request.
--
-- After running this, the "الإشعارات" card in the profile screen becomes
-- functional in production. Until then the code treats the table as absent
-- (graceful fallback: everyone receives everything — the previous behavior).
-- No existing table is modified — zero risk to current data.
-- =====================================================

-- ---------- 1. notification_prefs ----------
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id     INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  muted_types TEXT NOT NULL DEFAULT '[]',   -- JSON array of category names
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;

-- Same permissive pattern as every other Talib table: authorization is
-- enforced in the Next.js API layer (own-row only), not in RLS.
DROP POLICY IF EXISTS "Allow anon all access notification_prefs" ON notification_prefs;
CREATE POLICY "Allow anon all access notification_prefs" ON notification_prefs
  FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated all access notification_prefs" ON notification_prefs;
CREATE POLICY "Allow authenticated all access notification_prefs" ON notification_prefs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------- 2. extra index for reminder idempotency lookups ----------
-- (app_notifications already exists from supabase_notifications.sql;
--  this index speeds the "does this reminder already exist?" check.)
CREATE INDEX IF NOT EXISTS idx_app_notifications_user_type
  ON app_notifications(user_id, type);

-- ---------- 3. sanity check ----------
SELECT 'notification_prefs ready' AS status,
       (SELECT COUNT(*) FROM notification_prefs) AS existing_rows;
