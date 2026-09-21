-- ============================================================================
-- طالب | Talib — FULL SUPABASE REBUILD (الجولة 94)
-- ============================================================================
-- Purpose: rebuild the ENTIRE Talib schema on a fresh Supabase project
--          (qgpzbeqhdidaojrlorpo, eu-west-1) after the accidental deletion of
--          the previous project. Consolidates, in dependency order, every
--          schema file this repo has ever shipped:
--
--   download/supabase_schema.sql               (base, 23 tables + seeds)
--   download/supabase_update_schema.sql        (r?: academic_tracks)
--   download/supabase_round2_fixes.sql         (study_groups, join_requests)
--   download/supabase_course_materials.sql     (r41: library module binding)
--   download/supabase_telegram.sql             (r7: sources + items)
--   download/supabase_telegram_intelligence.sql(r71: AI columns + ai_events)
--   download/supabase_telegram_topics.sql      (r65: topics)
--   download/supabase_topics_write_policies.sql(r73: topics write RLS)
--   download/supabase_bot_config.sql           (r62: bot token storage)
--   download/supabase_notifications.sql        (r10: app_notifications)
--   download/supabase_notification_prefs.sql   (r24: notification_prefs)
--   download/supabase_personal_schedule.sql    (r27: personal_schedule_items)
--   download/supabase_push_subscriptions.sql   (r56: push_subscriptions)
--   download/supabase_report_reporter.sql      (r56: reporter_id)
--   تقرير-الجولة-93.md §SQL                    (r93: review columns + exams.kind)
--
-- HOW TO RUN: paste the whole file into Supabase Dashboard → SQL Editor
-- (https://supabase.com/dashboard/project/qgpzbeqhdidaojrlorpo/sql/new)
-- and run ONCE. It is idempotent — safe to re-run at any time.
--
-- SECURITY MODEL (identical to the old project — do NOT "harden" here):
--   • Base tables: RLS left OFF (the app's Next.js API layer enforces
--     authorization; server routes call Supabase with the anon key).
--   • Newer tables: RLS ON with the same permissive policies their
--     original files created.
--   • ai_events: RLS ON, no policies (server/service-role only).
--   • bot_config: RLS ON, all grants revoked from anon/authenticated
--     (it stores the bot token — service role bypasses RLS).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. BASE TABLES (download/supabase_schema.sql)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS institutions (
  id SERIAL PRIMARY KEY,
  name_ar TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'المدرسة العليا للأساتذة',
  city TEXT NOT NULL DEFAULT 'الجزائر',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS specialties (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  code TEXT NOT NULL,
  icon_name TEXT NOT NULL DEFAULT 'book',
  description TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT 'المدرسة العليا للأساتذة - بوزريعة',
  faculty TEXT NOT NULL DEFAULT 'قسم اللغة والأدب العربي',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_years (
  id SERIAL PRIMARY KEY,
  specialty_id INTEGER NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  year_name TEXT NOT NULL,
  semester INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cohort_groups (
  id SERIAL PRIMARY KEY,
  specialty_id INTEGER NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  sub_group TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(specialty_id, academic_year_id, group_name)
);

CREATE TABLE IF NOT EXISTS module_courses (
  id SERIAL PRIMARY KEY,
  specialty_id INTEGER NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  semester INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  coefficient DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  credits INTEGER NOT NULL DEFAULT 4,
  professor_name TEXT NOT NULL DEFAULT '',
  professor_email TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'أساسي',
  description TEXT NOT NULL DEFAULT '',
  syllabus_topics TEXT NOT NULL DEFAULT '',
  visibility_scope TEXT NOT NULL DEFAULT 'تخصص كامل',
  target_group TEXT NOT NULL DEFAULT 'الكل',
  last_viewed_timestamp INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lectures (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES module_courses(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  pdf_file_name TEXT NOT NULL DEFAULT 'lecture_notes.pdf',
  pdf_url TEXT NOT NULL DEFAULT '',
  pdf_storage_path TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  date TEXT NOT NULL DEFAULT '',
  is_bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
  is_downloaded BOOLEAN NOT NULL DEFAULT FALSE,
  is_cached_offline BOOLEAN NOT NULL DEFAULT TRUE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  last_viewed_timestamp INTEGER NOT NULL DEFAULT 0,
  cached_content_text TEXT NOT NULL DEFAULT '',
  visibility_scope TEXT NOT NULL DEFAULT 'تخصص كامل',
  target_group TEXT NOT NULL DEFAULT 'الكل',
  author_name TEXT NOT NULL DEFAULT 'الممثل',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cached_course_materials (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES module_courses(id) ON DELETE CASCADE,
  module_name TEXT NOT NULL,
  title TEXT NOT NULL,
  material_type TEXT NOT NULL DEFAULT 'محاضرة',
  summary TEXT NOT NULL,
  full_text TEXT NOT NULL,
  key_concepts TEXT NOT NULL DEFAULT '',
  week_number INTEGER NOT NULL DEFAULT 1,
  cached_date TEXT NOT NULL DEFAULT 'مخزن محلياً',
  last_viewed_timestamp INTEGER NOT NULL DEFAULT 0,
  is_offline_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES module_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  description TEXT NOT NULL,
  max_score DOUBLE PRECISION NOT NULL DEFAULT 20.0,
  visibility_scope TEXT NOT NULL DEFAULT 'تخصص كامل',
  target_group TEXT NOT NULL DEFAULT 'الكل',
  student_completions TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id SERIAL PRIMARY KEY,
  specialty_id INTEGER NOT NULL,
  academic_year_id INTEGER NOT NULL,
  cohort_id INTEGER,
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  module_name TEXT NOT NULL,
  type TEXT NOT NULL,
  room TEXT NOT NULL,
  professor TEXT NOT NULL,
  visibility_scope TEXT NOT NULL DEFAULT 'تخصص كامل',
  target_group TEXT NOT NULL DEFAULT 'الكل',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES module_courses(id) ON DELETE CASCADE,
  module_name TEXT NOT NULL,
  title TEXT NOT NULL,
  exam_date TEXT NOT NULL,
  time TEXT NOT NULL,
  room TEXT NOT NULL,
  coefficient DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  is_finished BOOLEAN NOT NULL DEFAULT FALSE,
  visibility_scope TEXT NOT NULL DEFAULT 'تخصص كامل',
  target_group TEXT NOT NULL DEFAULT 'الكل',
  kind TEXT DEFAULT 'اختبار',                       -- r93: اختبار | اختبار قصير | عمل موجه
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_grades (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES module_courses(id) ON DELETE CASCADE,
  module_name TEXT NOT NULL,
  continuous_score DOUBLE PRECISION NOT NULL DEFAULT 14.0,
  exam_score DOUBLE PRECISION NOT NULL DEFAULT 15.0,
  coefficient DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  credits INTEGER NOT NULL DEFAULT 4,
  is_official BOOLEAN NOT NULL DEFAULT FALSE,
  target_score DOUBLE PRECISION NOT NULL DEFAULT 10.0,
  owner_id TEXT NOT NULL DEFAULT 'local',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  date TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'عام',
  specialty_id INTEGER REFERENCES specialties(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  visibility_scope TEXT NOT NULL DEFAULT 'تخصص كامل',
  target_groups TEXT NOT NULL DEFAULT 'الكل',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_profiles (
  id INTEGER PRIMARY KEY DEFAULT 1,
  user_id TEXT NOT NULL DEFAULT 'local',
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  student_id TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT '',
  university TEXT NOT NULL DEFAULT '',
  faculty TEXT NOT NULL DEFAULT '',
  specialty_name TEXT NOT NULL DEFAULT '',
  profile_track TEXT NOT NULL DEFAULT '',
  selected_specialty_id INTEGER NOT NULL DEFAULT 1,
  selected_year_id INTEGER NOT NULL DEFAULT 1,
  selected_cohort_id INTEGER,
  academic_year_name TEXT NOT NULL DEFAULT '',
  semester_name TEXT NOT NULL DEFAULT '',
  group_number TEXT NOT NULL DEFAULT '',
  sub_group TEXT NOT NULL DEFAULT '',
  is_admin_mode BOOLEAN NOT NULL DEFAULT FALSE,
  user_role TEXT NOT NULL DEFAULT 'STUDENT',
  theme_palette TEXT NOT NULL DEFAULT 'ACADEMIC',
  is_configured BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_image_mode TEXT NOT NULL DEFAULT 'manual',
  schedule_image_path TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_notes (
  id SERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  module_name TEXT NOT NULL DEFAULT 'عام',
  created_at TEXT NOT NULL DEFAULT 'اليوم',
  color_hex TEXT NOT NULL DEFAULT '#1B5E4B',
  created_date_time TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS library_references (
  id SERIAL PRIMARY KEY,
  specialty_id INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'كتاب مرجعي',
  description TEXT NOT NULL,
  file_format TEXT NOT NULL DEFAULT 'PDF',
  page_count INTEGER NOT NULL DEFAULT 250,
  download_url TEXT NOT NULL DEFAULT '',
  is_saved_offline BOOLEAN NOT NULL DEFAULT TRUE,
  visibility_scope TEXT NOT NULL DEFAULT 'تخصص كامل',
  module_id INTEGER,                                -- r41: course-bound materials
  storage_path TEXT,                                -- r41: Google Drive fileId
  file_size BIGINT,                                 -- r41: bytes
  review_status TEXT DEFAULT 'approved',            -- r93: pending | approved | rejected
  uploader_id INTEGER,                              -- r93: app_users.id of uploader
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_calendar_events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'محطة رسمية',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id SERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  module_name TEXT NOT NULL,
  session_type TEXT NOT NULL DEFAULT 'أعمال موجهة TD',
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'غائب',
  reason TEXT NOT NULL DEFAULT '',
  max_allowed_absences INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_issue_reports (
  id SERIAL PRIMARY KEY,
  student_name TEXT NOT NULL,
  student_group TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_title TEXT NOT NULL,
  description TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'قيد المراجعة',
  representative_note TEXT NOT NULL DEFAULT '',
  reporter_id BIGINT,                               -- r56: routes resolution notification
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_polls (
  id SERIAL PRIMARY KEY,
  creator_name TEXT NOT NULL,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  votes_a INTEGER NOT NULL DEFAULT 0,
  option_b TEXT NOT NULL,
  votes_b INTEGER NOT NULL DEFAULT 0,
  option_c TEXT NOT NULL DEFAULT '',
  votes_c INTEGER NOT NULL DEFAULT 0,
  user_voted_option TEXT,
  target_group TEXT NOT NULL DEFAULT 'الكل',
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL DEFAULT 'اليوم',
  created_date_time TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  supabase_user_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  specialty_name TEXT NOT NULL DEFAULT '',
  year_name TEXT NOT NULL DEFAULT '',
  group_number TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'STUDENT',
  representative_scope TEXT NOT NULL DEFAULT 'فوج واحد',
  assigned_specialty_id INTEGER NOT NULL DEFAULT 1,
  scope_institution_id INTEGER DEFAULT 1,
  scope_specialty_id INTEGER,
  scope_academic_year_id INTEGER,
  scope_cohort_group_id INTEGER,
  scope_track_id INTEGER,                           -- update_schema
  scope_group_id INTEGER,                           -- round2 (FK added below)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL UNIQUE,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_sessions_user_id ON device_sessions(user_id);

CREATE TABLE IF NOT EXISTS content_upload_logs (
  id SERIAL PRIMARY KEY,
  content_type TEXT NOT NULL,
  target_table TEXT NOT NULL,
  title TEXT NOT NULL,
  uploaded_by_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  cloud_status TEXT NOT NULL DEFAULT 'pending',
  cloud_url TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_read_states (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  announcement_id INTEGER NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, announcement_id)
);

-- ----------------------------------------------------------------------------
-- 2. ACADEMIC TRACKS (download/supabase_update_schema.sql)
-- ----------------------------------------------------------------------------

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

ALTER TABLE cohort_groups ADD COLUMN IF NOT EXISTS track_id INTEGER REFERENCES academic_tracks(id) ON DELETE SET NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS scope_track_id INTEGER REFERENCES academic_tracks(id) ON DELETE SET NULL;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS track_id INTEGER REFERENCES academic_tracks(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3. STUDY GROUPS + JOIN REQUESTS (download/supabase_round2_fixes.sql)
-- ----------------------------------------------------------------------------

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

ALTER TABLE cohort_groups ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES study_groups(id) ON DELETE SET NULL;

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

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS scope_group_id INTEGER REFERENCES study_groups(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 4. COURSE MATERIALS BINDING (download/supabase_course_materials.sql, r41)
-- ----------------------------------------------------------------------------

ALTER TABLE library_references ADD COLUMN IF NOT EXISTS module_id INTEGER;
ALTER TABLE library_references ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE library_references ADD COLUMN IF NOT EXISTS file_size BIGINT;
CREATE INDEX IF NOT EXISTS idx_library_refs_module
  ON library_references (module_id) WHERE module_id IS NOT NULL;

-- r56: reporter routing on issue reports
ALTER TABLE student_issue_reports ADD COLUMN IF NOT EXISTS reporter_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_issue_reports_reporter
  ON student_issue_reports (reporter_id);

-- ----------------------------------------------------------------------------
-- 5. TELEGRAM SOURCES + ITEMS (download/supabase_telegram.sql, r7)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telegram_sources (
  id SERIAL PRIMARY KEY,
  tg_channel_id TEXT NOT NULL UNIQUE,
  tg_username TEXT NOT NULL DEFAULT '',
  title_ar TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'channel', -- channel | group
  kind TEXT NOT NULL DEFAULT 'public',         -- public | private
  institution_id INTEGER REFERENCES institutions(id) ON DELETE SET NULL,
  specialty_id INTEGER NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  track_id INTEGER REFERENCES academic_tracks(id) ON DELETE SET NULL,
  year_id INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
  semester INTEGER,
  module_id INTEGER REFERENCES module_courses(id) ON DELETE SET NULL,
  cohort_id INTEGER REFERENCES cohort_groups(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_update_id INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tg_sources_specialty ON telegram_sources(specialty_id);
CREATE INDEX IF NOT EXISTS idx_tg_sources_module ON telegram_sources(module_id);
CREATE INDEX IF NOT EXISTS idx_tg_sources_cohort ON telegram_sources(cohort_id);

CREATE TABLE IF NOT EXISTS telegram_items (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES telegram_sources(id) ON DELETE CASCADE,
  tg_message_id INTEGER NOT NULL DEFAULT 0,
  media_group_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'text',            -- pdf|doc|ppt|image|video|audio|text|link|other
  title_ar TEXT NOT NULL DEFAULT '',
  caption_text TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  file_id TEXT NOT NULL DEFAULT '',
  file_unique_id TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  link TEXT NOT NULL,
  specialty_id INTEGER NOT NULL DEFAULT 1 REFERENCES specialties(id) ON DELETE CASCADE,
  module_id INTEGER REFERENCES module_courses(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL DEFAULT 'محاضرة',
  origin TEXT NOT NULL DEFAULT 'telegram',      -- telegram | manual
  posted_by TEXT NOT NULL DEFAULT '',
  cohort_id INTEGER REFERENCES cohort_groups(id) ON DELETE CASCADE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ai_classified BOOLEAN NOT NULL DEFAULT FALSE,
  class_confidence INTEGER,                     -- r71 intelligence
  class_status TEXT DEFAULT 'published',        -- r71: published | review
  class_meta JSONB,                             -- r71: extraction metadata
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, tg_message_id)
);
CREATE INDEX IF NOT EXISTS idx_tg_items_module ON telegram_items(module_id);
CREATE INDEX IF NOT EXISTS idx_tg_items_cohort ON telegram_items(cohort_id);
CREATE INDEX IF NOT EXISTS idx_tg_items_specialty ON telegram_items(specialty_id);
CREATE INDEX IF NOT EXISTS idx_tg_items_posted_at ON telegram_items(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tg_items_search ON telegram_items USING gin (to_tsvector('simple', search_text));
CREATE INDEX IF NOT EXISTS telegram_items_class_status_idx
  ON telegram_items (class_status) WHERE class_status IS NOT NULL;

ALTER TABLE telegram_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all access" ON telegram_sources FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE telegram_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all access" ON telegram_items FOR ALL TO anon USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 6. AI EVENTS LOG (download/supabase_telegram_intelligence.sql, r71)
--    RLS ON with NO policies — server (service role) only.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_events (
  id            BIGSERIAL PRIMARY KEY,
  stage         TEXT NOT NULL,
  source_id     INTEGER,
  tg_message_id BIGINT,
  model         TEXT,
  provider      TEXT,
  latency_ms    INTEGER,
  extracted     JSONB,
  decision      TEXT,
  confidence    INTEGER,
  reason        TEXT,
  detail        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_events_source_idx ON ai_events (source_id);
CREATE INDEX IF NOT EXISTS ai_events_created_idx ON ai_events (created_at DESC);
ALTER TABLE ai_events ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 7. TELEGRAM TOPICS (r65) + WRITE POLICIES (r73)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telegram_topics (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES telegram_sources(id) ON DELETE CASCADE,
  tg_thread_id INTEGER NOT NULL,
  title_ar TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  year_id INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
  module_id INTEGER REFERENCES module_courses(id) ON DELETE SET NULL,
  is_general BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, tg_thread_id)
);
CREATE INDEX IF NOT EXISTS idx_tg_topics_source ON telegram_topics(source_id);
CREATE INDEX IF NOT EXISTS idx_tg_topics_module ON telegram_topics(module_id);

ALTER TABLE telegram_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read topics" ON telegram_topics;
CREATE POLICY "Allow anon read topics" ON telegram_topics FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow anon insert topics" ON telegram_topics;
CREATE POLICY "Allow anon insert topics" ON telegram_topics FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon update topics" ON telegram_topics;
CREATE POLICY "Allow anon update topics" ON telegram_topics FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon delete topics" ON telegram_topics;
CREATE POLICY "Allow anon delete topics" ON telegram_topics FOR DELETE TO anon USING (true);

-- ----------------------------------------------------------------------------
-- 8. BOT CONFIG (download/supabase_bot_config.sql, r62) — SECRET TABLE
--    RLS ON, all grants revoked from anon/authenticated.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bot_config (
  id             INTEGER PRIMARY KEY,
  bot_token      TEXT NOT NULL DEFAULT '',
  webhook_secret TEXT NOT NULL DEFAULT '',
  bot_username   TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bot_config FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. NOTIFICATIONS (r10) + PREFS (r24)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'generic',   -- join_new | join_approved | join_rejected | report_new | generic
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_notifications_user_read
  ON app_notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_app_notifications_user_type
  ON app_notifications(user_id, type);
ALTER TABLE app_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all access app_notifications" ON app_notifications;
CREATE POLICY "Allow anon all access app_notifications" ON app_notifications
  FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated all access app_notifications" ON app_notifications;
CREATE POLICY "Allow authenticated all access app_notifications" ON app_notifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id     INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  muted_types TEXT NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all access notification_prefs" ON notification_prefs;
CREATE POLICY "Allow anon all access notification_prefs" ON notification_prefs
  FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated all access notification_prefs" ON notification_prefs;
CREATE POLICY "Allow authenticated all access notification_prefs" ON notification_prefs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 10. PERSONAL SCHEDULE (r27) + PUSH SUBSCRIPTIONS (r56)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS personal_schedule_items (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL DEFAULT '',
  module_name TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'محاضرة',
  room        TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_personal_schedule_items_user
  ON personal_schedule_items(user_id, day_of_week);
ALTER TABLE personal_schedule_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all access personal_schedule_items" ON personal_schedule_items;
CREATE POLICY "Allow anon all access personal_schedule_items" ON personal_schedule_items
  FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated all access personal_schedule_items" ON personal_schedule_items;
CREATE POLICY "Allow authenticated all access personal_schedule_items" ON personal_schedule_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT        NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  endpoint     TEXT          NOT NULL UNIQUE,
  p256dh       TEXT          NOT NULL,
  auth         TEXT          NOT NULL,
  user_agent   TEXT          NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions (user_id);
COMMENT ON TABLE push_subscriptions IS
  'round 56: per-browser Web Push subscriptions for outside-the-tab notifications';

-- ----------------------------------------------------------------------------
-- 11. SEEDS (idempotent)
-- ----------------------------------------------------------------------------

INSERT INTO institutions (name_ar, type, city)
SELECT 'المدرسة العليا للأساتذة - بوزريعة', 'المدرسة العليا للأساتذة', 'الجزائر'
WHERE NOT EXISTS (SELECT 1 FROM institutions);

INSERT INTO specialties (institution_id, name_ar, code, description, institution, faculty)
SELECT 1, 'اللغة والأدب العربي', 'AR-LIT', 'تخصص اللغة والأدب العربي',
       'المدرسة العليا للأساتذة - بوزريعة (ENS)', 'قسم اللغة والأدب العربي'
WHERE NOT EXISTS (SELECT 1 FROM specialties WHERE code = 'AR-LIT');

INSERT INTO academic_years (specialty_id, year_name, semester)
SELECT 1, y.year_name, 1
FROM (VALUES
  ('السنة الأولى (L1)'),
  ('السنة الثانية (L2)'),
  ('السنة الثالثة (L3)'),
  ('السنة الرابعة (L4)'),
  ('السنة الخامسة (L5)')
) AS y(year_name)
WHERE NOT EXISTS (SELECT 1 FROM academic_years a WHERE a.year_name = y.year_name);

INSERT INTO cohort_groups (specialty_id, academic_year_id, group_name)
SELECT 1, ay.id, g.group_name
FROM academic_years ay
CROSS JOIN (VALUES ('الفوج 01'), ('الفوج 02'), ('الفوج 03')) AS g(group_name)
WHERE NOT EXISTS (
  SELECT 1 FROM cohort_groups cg
  WHERE cg.academic_year_id = ay.id AND cg.group_name = g.group_name
);

INSERT INTO academic_tracks (specialty_id, track_name_ar, code) VALUES
  (1, 'أستاذ التعليم الابتدائي (PEP)', 'PEP'),
  (1, 'أستاذ التعليم المتوسط (PEM)', 'PEM'),
  (1, 'أستاذ التعليم الثانوي (PES)', 'PES'),
  (1, 'علوم الإعلام الآلي العامة (INF-GEN)', 'INF-GEN'),
  (1, 'هندسة نظم المعلومات اللوجستية (ISIL)', 'ISIL')
ON CONFLICT (specialty_id, code) DO NOTHING;

-- backfill: first cohort set points at PEP (as the original patch did)
UPDATE cohort_groups cg
SET track_id = t.id
FROM academic_tracks t
WHERE t.code = 'PEP' AND cg.track_id IS NULL
  AND cg.group_name IN ('الفوج 01', 'الفوج 02', 'الفوج 03');

-- backfill: one default study group per (specialty, year, track) + link cohorts
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

INSERT INTO academic_calendar_events (title, event_type, start_date, is_current)
SELECT 'بداية السداسي الأول', 'محطة رسمية', TO_CHAR(NOW(), 'YYYY-MM-DD'), TRUE
WHERE NOT EXISTS (SELECT 1 FROM academic_calendar_events WHERE title = 'بداية السداسي الأول');

INSERT INTO academic_calendar_events (title, event_type, start_date, is_current)
SELECT 'عطلة منتصف السداسي', 'عطلة جامعية', TO_CHAR(NOW() + INTERVAL '7 days', 'YYYY-MM-DD'), FALSE
WHERE NOT EXISTS (SELECT 1 FROM academic_calendar_events WHERE title = 'عطلة منتصف السداسي');

-- ----------------------------------------------------------------------------
-- 12. SANITY CHECK (output visible in SQL Editor)
-- ----------------------------------------------------------------------------

SELECT 'institutions' AS t, COUNT(*) FROM institutions
UNION ALL SELECT 'specialties', COUNT(*) FROM specialties
UNION ALL SELECT 'academic_years', COUNT(*) FROM academic_years
UNION ALL SELECT 'cohort_groups', COUNT(*) FROM cohort_groups
UNION ALL SELECT 'academic_tracks', COUNT(*) FROM academic_tracks
UNION ALL SELECT 'study_groups', COUNT(*) FROM study_groups
UNION ALL SELECT 'app_users', COUNT(*) FROM app_users
UNION ALL SELECT 'bot_config', COUNT(*) FROM bot_config;
