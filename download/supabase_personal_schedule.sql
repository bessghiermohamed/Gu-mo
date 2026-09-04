-- =====================================================
-- Talib — Round 27: Personal Schedule Migration (Supabase / PostgreSQL)
-- =====================================================
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It is SAFE to run even if the table already exists (IF NOT EXISTS guards).
--
-- What it adds (review §7 — manual personal classes):
--   personal_schedule_items table — the student's PRIVATE timetable:
--   classes they add for themselves (day / time / course / location /
--   optional notes). Deliberately separate from schedule_items (which
--   stays the OFFICIAL specialty schedule managed by supervisors) so
--   personal entries can never be mistaken for official ones.
--
-- Until this table exists, the app degrades gracefully: the personal
-- endpoint returns an empty list and the official schedule keeps working.
-- No existing table is modified — zero risk to current data.
-- =====================================================

-- ---------- 1. personal_schedule_items ----------
CREATE TABLE IF NOT EXISTS personal_schedule_items (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,                 -- 1: الأحد … 5: الخميس
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL DEFAULT '',
  module_name TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'محاضرة',   -- محاضرة / TD / TP
  room        TEXT NOT NULL DEFAULT '',         -- المكان / القاعة
  notes       TEXT NOT NULL DEFAULT '',         -- ملاحظات شخصية اختيارية
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE personal_schedule_items ENABLE ROW LEVEL SECURITY;

-- Same permissive pattern as every other Talib table: authorization is
-- enforced in the Next.js API layer (own-rows only), not in RLS.
DROP POLICY IF EXISTS "Allow anon all access personal_schedule_items" ON personal_schedule_items;
CREATE POLICY "Allow anon all access personal_schedule_items" ON personal_schedule_items
  FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated all access personal_schedule_items" ON personal_schedule_items;
CREATE POLICY "Allow authenticated all access personal_schedule_items" ON personal_schedule_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------- 2. index: the only access pattern is "my rows, by day" ----------
CREATE INDEX IF NOT EXISTS idx_personal_schedule_items_user
  ON personal_schedule_items(user_id, day_of_week);

-- ---------- 3. sanity check ----------
SELECT 'personal_schedule_items ready' AS status,
       (SELECT COUNT(*) FROM personal_schedule_items) AS existing_rows;
