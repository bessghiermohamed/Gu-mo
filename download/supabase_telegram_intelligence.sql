-- ============================================================
-- الجولة 71 — خط أنابيب ذكاء المحتوى (Content Intelligence)
-- download/supabase_telegram_intelligence.sql
--
-- ماذا يضيف (اختياري لكنه موصى به — التطبيق يعمل بدونه بسلوك
-- ما قبل r71، ويُستكشف وجوده تلقائياً مرة لكل مثيل خادم):
--   1) أعمدة الذكاء في telegram_items:
--      - class_confidence: درجة الثقة 0..100 (مكوناتها في class_meta)
--      - class_status: 'published' | 'review' — قائمة مراجعة إدارية
--        (المكتبة تخفي «review» عن الطلبة حتى اعتماد المشرف؛
--        مساحة الفوج تبقى مرئية دائماً — وعد r67)
--      - class_meta (jsonb): ما استُخرج (سنة/ملمح/فصل/درس) + سبب
--        المطابقة + المحرك/النموذج — يظهر للمشرف في لوحة التنقيح
--   2) جدول ai_events: سجل مراقبة تنسيق النماذج (لوحة الإدارة ←
--      تيليجرام ← سجل الذكاء) — لا يُخزَّن فيه أي سر أبداً.
--
-- التنفيذ: مرة واحدة عبر Supabase Dashboard ← SQL Editor.
-- الملف تراكمي (idempotent): آمن لإعادة التشغيل في أي وقت.
-- تُترك الصفوف القديمة كما هي: class_status NULL يعامل «منشور» —
-- لا يختفي أي محتوى موجود بعد التنفيذ.
-- ============================================================

-- 1) أعمدة الذكاء على telegram_items -------------------------------
alter table public.telegram_items
  add column if not exists class_confidence integer,
  add column if not exists class_status text default 'published',
  add column if not exists class_meta jsonb;

create index if not exists telegram_items_class_status_idx
  on public.telegram_items (class_status)
  where class_status is not null;

-- 2) سجل أحداث الذكاء ----------------------------------------------
create table if not exists public.ai_events (
  id            bigserial primary key,
  stage         text not null,              -- ingest | ingest-update | reclassify | reclassify-source | approve | probe | error
  source_id     integer,
  tg_message_id bigint,
  model         text,                       -- gemini-3.5-flash / llama-3.3-70b-versatile / keywords
  provider      text,                       -- gemini | groq | heuristic
  latency_ms    integer,
  extracted     jsonb,                      -- year/track/semester/lesson/module/item_type/title
  decision      text,                       -- publish | review | skip
  confidence    integer,
  reason        text,                       -- سبب المطابقة/القرار (عربي، للمشرف)
  detail        text,                       -- تفاصيل تقنية إضافية
  created_at    timestamptz not null default now()
);

create index if not exists ai_events_source_idx on public.ai_events (source_id);
create index if not exists ai_events_created_idx on public.ai_events (created_at desc);

-- RLS: السجل للخادم فقط (service role يتجاوز RLS أصلاً) — لا سياسة
-- قراءة عامة إطلاقاً: لا يصل إليه الطالب ولا الزائر.
alter table public.ai_events enable row level security;

-- 3) ملاحظات أمنية ---------------------------------------------------
-- لا يُخزَّن في هذه الأعمدة/الجدول أي سر (توكن/مفتاح) — فقط أسماء
-- النماذج والقرارات والاستخراجات. عمليات الكتابة تتم عبر الخادم
-- (route handlers) بمفاتيح البيئة، أبداً من المتصفح.
