<!-- Auto-deploy test: Mon Aug 31 16:57:09 UTC 2026 -->

# Gu-mo — Talib (ENS Bouarezah student platform)

Next.js 16 App Router + Supabase + Vercel. Arabic RTL-first.

## ⚠️ Development Constitution — READ BEFORE ANY CHANGE

**[`docs/comprehensive-system-review.md`](docs/comprehensive-system-review.md)** is
BINDING for every feature, bug fix, and refactor in this repository. In short:

1. **Think in whole systems, not isolated features** — every change must define
   visibility (role/scope), placement, all states (empty/loading/pending/success/
   error/disabled), all actions (add/edit/delete/accept/reject/cancel/retry),
   permissions (read/create/edit/delete/approve), data relationships
   (institution → specialty → track → year → group → subgroup → course),
   edge cases, UX, and consistency.
2. **Analyze before coding** — purpose, target users, UI location, permissions,
   states, dependencies, and whether existing elements should be removed /
   replaced / merged / relocated instead of preserved.
3. **Enforce logic at the data/API layer** — never merely hide it in the UI
   (e.g. group-assignment destinations are filtered to the student's own
   academic scope server-side).
4. Companion policies: `upload/تنظيف-وقاعدة-حماية-git.md` (cleanup + git
   protection), `upload/قواعد-عمل-موجهة-للأداة.md` (tool work rules).

## 🚀 Deployment — pending Supabase migrations

After pulling new code, apply any **new** `download/supabase_*.sql` file once via
the Supabase Dashboard → SQL Editor. Current migration state:

| SQL file | What it adds | Required for |
| --- | --- | --- |
| `supabase_schema.sql` | base schema | first deploy |
| `supabase_round2_fixes.sql` | groups + join_requests | join-request feature |
| `supabase_update_schema.sql` | round 3+ updates | later features |
| `supabase_telegram.sql` | Telegram integration | Telegram screens |
| **`supabase_notifications.sql`** | **`app_notifications` table — round 10** | **notifications (§3/§4/§16)** |

All migration files are idempotent (`IF NOT EXISTS` guards) and safe to re-run.
Until `supabase_notifications.sql` is applied, the app keeps working — the bell
panel simply stays empty and notification inserts fail silently server-side.
