-- =====================================================
-- Round 65: Telegram Topic Bindings (روابط مواضيع القنوات)
-- Run this ONCE in the Supabase SQL editor (same as the
-- previous schema files), BEFORE managing topic links.
--
-- Purpose: القنوات/المنتديات الكبيرة (مثل ENS) تحتوي مواضيع
-- متعددة (عام، سنة أولى، سنة ثانية، مقياس محدد…). هذا الجدول
-- يربط كل موضوع بنطاقه الأكاديمي فيصنّف البوت منشوراته حتمياً:
--   • موضوع مربوط بمقياس  → كل منشوراته تحت هذا المقياس
--   • موضوع مربوط بسنة    → الترشيح يقتصر على مقاييس تلك السنة
--   • موضوع «عام»         → منشوراته لا تُضاف أصلاً (ليست دراسية)
-- بدون تنفيذ هذا الملف يعمل التطبيق كما في الجولة 64 (بلا روابط
-- مواضيع) — لا ينكسر شيء.
-- =====================================================

CREATE TABLE IF NOT EXISTS telegram_topics (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES telegram_sources(id) ON DELETE CASCADE,
  tg_thread_id INTEGER NOT NULL,               -- message_thread_id من تيليجرام
  title_ar TEXT NOT NULL DEFAULT '',           -- اسم الموضوع للعرض
  link TEXT NOT NULL DEFAULT '',               -- رابط الموضوع (t.me/.../thread)
  year_id INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
  module_id INTEGER REFERENCES module_courses(id) ON DELETE SET NULL,
  is_general BOOLEAN NOT NULL DEFAULT FALSE,   -- موضوع عام — ليس محتوى دراسياً
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, tg_thread_id)
);
CREATE INDEX IF NOT EXISTS idx_tg_topics_source ON telegram_topics(source_id);
CREATE INDEX IF NOT EXISTS idx_tg_topics_module ON telegram_topics(module_id);

-- RLS: بيانات عامة كالمصادر (قراءة فقط للـ anon — الكتابة عبر
-- service role من مسارات الخادم فقط)
ALTER TABLE telegram_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read topics" ON telegram_topics;
CREATE POLICY "Allow anon read topics" ON telegram_topics FOR SELECT TO anon USING (true);
