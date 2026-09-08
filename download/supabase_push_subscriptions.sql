-- round 56 — إشعارات خارج المتصفح (Web Push)
-- One-time SQL: run in Supabase SQL editor. Creates the push_subscriptions
-- table that stores each browser's Web Push subscription (endpoint + keys).
-- The service worker (public/sw.js) + VAPID keys complete the pipeline.
-- The app works WITHOUT this table (push silently skipped), but outside-
-- browser notifications need it.
create table if not exists push_subscriptions (
  id           bigserial primary key,
  user_id      bigint        not null references app_users (id) on delete cascade,
  endpoint     text          not null unique,
  p256dh       text          not null,
  auth         text          not null,
  user_agent   text          not null default '',
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

create index if not exists idx_push_subs_user on push_subscriptions (user_id);

comment on table push_subscriptions is
  'round 56: per-browser Web Push subscriptions for outside-the-tab notifications';
