-- Talib Schema for Supabase PostgreSQL
-- Mirrors Prisma schema

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
  scope_institution_id INTEGER,
  scope_specialty_id INTEGER,
  scope_academic_year_id INTEGER,
  scope_cohort_group_id INTEGER,
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

-- Seed initial data
INSERT INTO institutions (name_ar, type, city) VALUES
  ('المدرسة العليا للأساتذة - بوزريعة', 'المدرسة العليا للأساتذة', 'الجزائر')
ON CONFLICT DO NOTHING;

INSERT INTO specialties (institution_id, name_ar, code, description, institution, faculty) VALUES
  (1, 'اللغة والأدب العربي', 'AR-LIT', 'تخصص اللغة والأدب العربي', 'المدرسة العليا للأساتذة - بوزريعة (ENS)', 'قسم اللغة والأدب العربي')
ON CONFLICT DO NOTHING;

INSERT INTO academic_years (specialty_id, year_name, semester) VALUES
  (1, 'السنة الأولى (L1)', 1),
  (1, 'السنة الثانية (L2)', 1),
  (1, 'السنة الثالثة (L3)', 1),
  (1, 'السنة الرابعة (L4)', 1),
  (1, 'السنة الخامسة (L5)', 1)
ON CONFLICT DO NOTHING;

-- Create 3 cohorts per year
INSERT INTO cohort_groups (specialty_id, academic_year_id, group_name) VALUES
  (1, 1, 'الفوج 01'), (1, 1, 'الفوج 02'), (1, 1, 'الفوج 03'),
  (1, 2, 'الفوج 01'), (1, 2, 'الفوج 02'), (1, 2, 'الفوج 03'),
  (1, 3, 'الفوج 01'), (1, 3, 'الفوج 02'), (1, 3, 'الفوج 03'),
  (1, 4, 'الفوج 01'), (1, 4, 'الفوج 02'), (1, 4, 'الفوج 03'),
  (1, 5, 'الفوج 01'), (1, 5, 'الفوج 02'), (1, 5, 'الفوج 03')
ON CONFLICT DO NOTHING;

INSERT INTO academic_calendar_events (title, event_type, start_date, is_current) VALUES
  ('بداية السداسي الأول', 'محطة رسمية', TO_CHAR(NOW(), 'YYYY-MM-DD'), TRUE),
  ('عطلة منتصف السداسي', 'عطلة جامعية', TO_CHAR(NOW() + INTERVAL '7 days', 'YYYY-MM-DD'), FALSE)
ON CONFLICT DO NOTHING;
