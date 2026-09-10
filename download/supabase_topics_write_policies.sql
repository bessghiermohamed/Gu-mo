-- =====================================================
-- الجولة 73: سياسات الكتابة على جدول روابط المواضيع
-- Run this ONCE in the Supabase SQL editor (Supabase Dashboard
-- → SQL Editor → New query → paste → Run).
--
-- لماذا هذا الملف؟ (تشخيص حي 2026-09-11)
--   جدول telegram_topics منشأ فعلاً (نفّذ المالك supabase_telegram_topics.sql
--   بنجاح) — لكن ملف r65 منح anon صلاحية SELECT فقط، بينما مسارات
--   الخادم تكتب بمفتاح anon العام. كل INSERT/UPDATE/DELETE كان يُرفض
--   بخطأ 42501 «row-level security»، وكانت رسالة التطبيق تظهر خطأً
--   «جدول المواضيع غير منشأ» لأن نص الخطأ يحوي اسم الجدول.
--
-- ماذا يفعل هذا الملف؟ يمنح anon صلاحيات الكتابة على telegram_topics
-- بنفس نمط telegram_sources و telegram_items (الكتابة المفتوحة على
-- مستوى RLS، والترخيص الفعلي داخل مسارات الخادم عبر الجلسة وصلاحيات
-- المالك/المشرف canManageTopics). إعادة تنفيذه آمنة (idempotent).
-- =====================================================

ALTER TABLE telegram_topics ENABLE ROW LEVEL SECURITY;

-- القراءة (كما في r65 — إعادة إنشاء للتأكد من الوجود)
DROP POLICY IF EXISTS "Allow anon read topics" ON telegram_topics;
CREATE POLICY "Allow anon read topics" ON telegram_topics
  FOR SELECT TO anon USING (true);

-- الكتابة: الإضافة والتعديل والحذف (الإصلاح)
DROP POLICY IF EXISTS "Allow anon insert topics" ON telegram_topics;
CREATE POLICY "Allow anon insert topics" ON telegram_topics
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update topics" ON telegram_topics;
CREATE POLICY "Allow anon update topics" ON telegram_topics
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete topics" ON telegram_topics;
CREATE POLICY "Allow anon delete topics" ON telegram_topics
  FOR DELETE TO anon USING (true);
