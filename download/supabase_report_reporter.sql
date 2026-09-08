-- round 56 — الإشعارات عند حل التبليغ (owner: «أبلّغ ولا يصلني إشعار عند الحل»)
-- One-time SQL: run in Supabase SQL editor. Adds the reporter's user id to
-- each issue report so the resolution notification can be routed to them.
-- Idempotent: safe to run twice. Legacy rows stay NULL — the app falls back
-- to matching app_users.full_name for those.
alter table student_issue_reports
  add column if not exists reporter_id bigint;

comment on column student_issue_reports.reporter_id is
  'round 56: user id of the reporter — routes the report_resolved notification';

-- Optional index (cheap, helps nothing today but future-proof for per-user lookups)
create index if not exists idx_issue_reports_reporter
  on student_issue_reports (reporter_id);
