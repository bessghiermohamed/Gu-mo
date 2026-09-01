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
