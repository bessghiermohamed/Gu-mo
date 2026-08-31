-- =====================================================
-- Round 7: Telegram Lessons (دروس تيليجرام)
-- Run this ONCE in the Supabase SQL editor (same as the
-- previous schema files), BEFORE using the new section.
--
-- Design: Telegram is a SOURCE of content, not a separate app.
--   telegram_sources = القنوات/المجموعات المربوطة بالبوت
--                     (كل قناة مرتبطة بمقياس أو بفوج)
--   telegram_items  = المنشورات المستوردة (روابط t.me فقط — لا ملفات مخزنة)
--
-- Files are NEVER copied: we store metadata + deep links only
-- (https://t.me/<channel>/<message_id> opens the original).
-- =====================================================

-- 1. المصادر: قنوات عامة أو مجموعات أفواج مربوطة بالبوت
CREATE TABLE IF NOT EXISTS telegram_sources (
  id SERIAL PRIMARY KEY,
  tg_channel_id TEXT NOT NULL UNIQUE,          -- chat id من تيليجرام
  tg_username TEXT NOT NULL DEFAULT '',        -- @username للقنوات العامة
  title_ar TEXT NOT NULL,                      -- اسم للعرض داخل التطبيق
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

-- 2. المنشورات المستوردة (عنصر لكل رسالة تيليجرام أو إضافة يدوية)
CREATE TABLE IF NOT EXISTS telegram_items (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES telegram_sources(id) ON DELETE CASCADE,
  tg_message_id INTEGER NOT NULL DEFAULT 0,
  media_group_id TEXT NOT NULL DEFAULT '',      -- تجميع صور الألبوم
  kind TEXT NOT NULL DEFAULT 'text',            -- pdf|doc|ppt|image|video|audio|text|link|other
  title_ar TEXT NOT NULL DEFAULT '',
  caption_text TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',         -- نسخة مُطبَّعة (بدون تشكيل) للبحث
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  file_id TEXT NOT NULL DEFAULT '',             -- لعرض الصور عبر /api/telegram/file
  file_unique_id TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  link TEXT NOT NULL,                           -- رابط t.me المباشر للمنشور الأصلي
  specialty_id INTEGER NOT NULL DEFAULT 1 REFERENCES specialties(id) ON DELETE CASCADE,
  module_id INTEGER REFERENCES module_courses(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL DEFAULT 'محاضرة',     -- محاضرة|أعمال موجهة TD|تمارين|امتحان|ملخص|كتاب|إعلان|عام
  origin TEXT NOT NULL DEFAULT 'telegram',      -- telegram | manual
  posted_by TEXT NOT NULL DEFAULT '',
  cohort_id INTEGER REFERENCES cohort_groups(id) ON DELETE CASCADE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ai_classified BOOLEAN NOT NULL DEFAULT FALSE, -- صُنِّف عبر Gemini
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, tg_message_id)              -- idempotent webhook upserts
);
CREATE INDEX IF NOT EXISTS idx_tg_items_module ON telegram_items(module_id);
CREATE INDEX IF NOT EXISTS idx_tg_items_cohort ON telegram_items(cohort_id);
CREATE INDEX IF NOT EXISTS idx_tg_items_specialty ON telegram_items(specialty_id);
CREATE INDEX IF NOT EXISTS idx_tg_items_posted_at ON telegram_items(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tg_items_search ON telegram_items USING gin (to_tsvector('simple', search_text));

-- 3. RLS — نفس نمط بقية جداول التطبيق (الوصول عبر مفتاح anon)
ALTER TABLE telegram_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all access" ON telegram_sources FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE telegram_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all access" ON telegram_items FOR ALL TO anon USING (true) WITH CHECK (true);

-- لا بيانات أولية: القنوات تُضاف من لوحة الإدارة (تبويب تيليجرام)
