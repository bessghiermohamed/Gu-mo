-- =====================================================
-- Round 62: bot_config — تغيير بوت تيليجرام من لوحة الإدارة
-- Run this ONCE in the Supabase SQL editor (same as the
-- previous schema files), BEFORE using «تغيير البوت».
--
-- WHY A TABLE: the owner wants to swap the Telegram bot
-- WITHOUT the Vercel dashboard (env var + redeploy). The
-- new bot token is stored in this table from the admin UI.
--
-- SECURITY (different from telegram_sources/items!):
--   those tables hold PUBLIC data → RLS open to anon.
--   THIS table holds the bot TOKEN — a secret. So RLS is
--   enabled with NO anon policy and all anon grants are
--   revoked: the public anon key (baked into the site's
--   JS bundle) can NOT read the token. Only the server,
--   using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS), can.
-- =====================================================

-- 1. الإعدادات: صف واحد (id=1) — توكن البوت الفعّال + سرّ الويبهوك
CREATE TABLE IF NOT EXISTS bot_config (
  id             INTEGER PRIMARY KEY,          -- دائماً 1 (صف واحد)
  bot_token      TEXT NOT NULL DEFAULT '',     -- توكن البوت النشط (@gu_mo_bot…)
  webhook_secret TEXT NOT NULL DEFAULT '',     -- سرّ الويبهوك الخاص بهذا التوكن
  bot_username   TEXT NOT NULL DEFAULT '',     -- @username المخزّن للعرض فقط
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. القفل: RLS مفعّل WITHOUT أي سياسة + سحب كل الصلاحيات عن anon/authenticated
--    (صف فارغ لا يعني الجدول مفقوداً — التطبيق يميّز بالاستعلام نفسه)
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bot_config FROM anon, authenticated;
-- ملاحظة: service role يتجاوز RLS تلقائياً — لا حاجة لأي سياسة له.

-- 3. لا فهارس إضافية: صف واحد فقط.
