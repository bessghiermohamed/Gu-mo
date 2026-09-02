-- =====================================================
-- Talib — Round 10: App Notifications Migration (Supabase / PostgreSQL)
-- =====================================================
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It is SAFE to run even if the table already exists (IF NOT EXISTS guards).
--
-- What it adds (System Review §3/§4/§16):
--   app_notifications table — real per-user notifications
--     * join_new        → sent to supervisors when a student submits a join request
--     * join_approved   → sent to the student when their request is approved
--     * join_rejected   → sent to the student when their request is rejected
--     * report_new      → sent to supervisors when a student files an issue report
--
-- After running this, the bell icon in the app header opens a notifications
-- panel (badged count) instead of jumping straight to announcements.
-- No existing table is modified — zero risk to current data.
-- =====================================================

-- ---------- 1. app_notifications ----------
CREATE TABLE IF NOT EXISTS app_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'generic',   -- join_new | join_approved | join_rejected | report_new | generic
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',        -- JSON string: { requestId, cohortId, ... }
  read_at TIMESTAMPTZ,                    -- NULL = unread
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_read
  ON app_notifications(user_id, read_at);

ALTER TABLE app_notifications ENABLE ROW LEVEL SECURITY;

-- Same permissive pattern as every other Talib table: authorization is
-- enforced in the Next.js API layer (scope checks), not in RLS.
DROP POLICY IF EXISTS "Allow anon all access app_notifications" ON app_notifications;
CREATE POLICY "Allow anon all access app_notifications" ON app_notifications
  FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated all access app_notifications" ON app_notifications;
CREATE POLICY "Allow authenticated all access app_notifications" ON app_notifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------- 2. sanity check ----------
SELECT 'app_notifications ready' AS status,
       (SELECT COUNT(*) FROM app_notifications) AS existing_rows;
