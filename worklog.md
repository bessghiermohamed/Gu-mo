# Worklog — Gu-mo (Talib) project

---
Task ID: 1
Agent: main (Super Z)
Task: Restore Gu-mo repo from GitHub (bessghiermohamed/Gu-mo, token provided by user), implement the owner's 4 modification requests, verify, and push.

Work Log:
- Fetched the shared chat link (SPA — unreadable); identified the project via GitHub API using the provided token: bessghiermohamed/Gu-mo — "Talib | طالب" academic portal (Next.js 16 + TS + Tailwind + Supabase/Prisma dual branch), last push 2026-09-03 from previous session.
- Cloned repo, merged into /home/z/my-project (rsync; kept platform .env, dropped clone .git).
- Decoded the 4 requests by matching exact admin-panel tab names: الهيكل (structure), الملامح (features/tracks), السنوات (years), المجموعات (groups), الأفواج (cohorts/regiments), المقررات (courses), السحابة (cloud). All references point at the supervisory board tabs.
- Request 1: merged Structure+Tracks+Years into ONE «الهيكل» tab (inner sub-tabs: المؤسسات/التخصصات/الملامح/السنوات); merged Groups+Cohorts into ONE «المجموعات والأفواج» tab (inner sub-tabs). Pattern reused from TelegramManager inner tabs.
- Request 2: removed «المقررات» tab + ModulesManager from admin panel; ported add/edit/delete course to student-facing Courses screen (EditCourseDialog + guarded delete; gate = canCreateModules, matching API — also fixed old UI/API permission mismatch where reps saw a button that always 403'd).
- Request 3: removed «السحابة» tab + CloudManager; cleaned dead i18n key files.tabCloud (ar/en); cleaned dead imports (BookOpen, Cloud, TestTube2, canManageRoles/canCreateGroups/canCreateModules/canCreateCohorts/canAccessDevSettings, Clock, RefreshCw, Database); tab grid now overview + 7 boxes (grid-cols-4 / sm:grid-cols-7 single clean row); stale-session guard for removed tab values (cloud/modules/cohorts/tracks/years → overview); updated header subtitle + report-source texts.
- Request 4: reporting — added «الإبلاغ عن مشكلة» entry on Profile (حسابي) screen for ALL roles incl. regular STUDENT: ReportIssueDialog with the 4 designed types (wired previously-unused reportIssue.* i18n keys), optional subject, required description, explicit «إرسال التبليغ» button with loading/disabled/success states → POST /api/issues (accepts all logged-in users). Existing flag icons on courses/assignments remain.
- Verification: bun install; bunx eslint on 3 changed files — clean; bunx tsc --noEmit — no NEW errors (3 pre-existing in untouched files: api/announcements/mark-read, api/telegram/setup, course-detail-screen — suppressed in build via ignoreBuildErrors, flagged for future round); bun run build — success; next start smoke test — HTTP 200.
- Wrote تقرير-إصلاحات-الجولة-11.md (repo round-report convention).
- Git: added origin, fetch origin/main, reset --soft origin/main, restored tracked upload/ files (unwritable mount), selectively staged (excluding worklog.md), single commit on top of ee628003, pushed to main with the token.

Stage Summary:
- Deliverable: commit pushed to bessghiermohamed/Gu-mo main — admin panel 13→8 destinations (structure merged, groups+cohorts merged, courses & cloud removed), course CRUD relocated to Courses screen with correct API-mirroring gate, universal report entry with Submit Report button on Profile, UI grid cleanup + i18n cleanup.
- Key decisions: UI-level merge only (no schema/migration — flagged as deferred product decision); capabilities preserved everywhere (review doc §17/§18 compliance); pre-existing tsc errors left untouched and documented.

---
Task ID: 2
Agent: main (Super Z)
Task: Student-app UI polish round 26 — five owner-requested layout/component changes (A–E), UI-only, no backend changes.

Work Log:
- Synced local to origin/main (user had pushed 7 commits elsewhere incl. round-24 notification prefs + reminders + tools); discarded mode-only working-tree noise via core.fileMode false; preserved local worklog.
- Part A: removed القادم قريباً exams widget from home-screen.tsx incl. its dead local fetch state (UpcomingExam/examsState/examsTick); announcements preview + الاختبارات service tile untouched. Commit c471ba4.
- Part B: NEW settings-screen.tsx hosting the round-24 تفضيلات الإشعارات card moved VERBATIM (same state/fetch/toggle/supervisor gating); page.tsx gained SETTINGS route + #/settings hash + gear icon rewired (was: jump to حسابي); profile lost the prefs card, gained الإعدادات link button. Commit c1a615d.
- Part C: settings gained المظهر (الوضع الليلي + نمط الألوان via same useTheme/usePalette hooks as header icons) and حول التطبيق (version-free identity card). Deliberately NOT moved: account deletion (stays in danger zone), language (H-1 hidden), cache clearing (nonexistent/footgun). Commit 2fe99d8.
- Part D: compact services grid — p-4→p-3, icon 44→36px rounded-xl, glyphs 24→20px, mb-3→mb-2, gap 3→2.5; same 2-col grid + icon/label/subtitle structure. Commit 244ee93.
- Part E: profile InfoRow list → 2-col InfoCell key-value grid (bg-muted/50 chips, inline 12px icons, title tooltips); الفوج wide cell keeps amber highlight. Commit 8333d73.
- Verification (390×844, real browser + local SQLite): prisma generate (stale client found — prefs API had been returning available:false from an OLD server still holding port 3000; killed, regenerated, rebuilt); seeded structure; signed up real users through the UI. Confirmed: home has no exams widget & grid fits one screenful; gear→#/settings; 7 toggles as OWNER vs 5 as STUDENT (gating proven both ways via DB role flip); toggle persisted to NotificationPref row + «1 مكتوم» badge; dark mode + palette switches live; back chevron returns; profile info card compact with all 7 fields, no overlaps/clipping. Screenshots in download/verify-390/.
- Pushed 5 commits 9be3f88..8333d73 to main with the stored token.

Stage Summary:
- Deliverable: 5 isolated commits on bessghiermohamed/Gu-mo main — one per part, reviewable independently. Zero API/schema/data-fetch changes (verified: only page.tsx routing + 2 screens + home layout touched). Test artifact: local dev DB has 1 test account (OWNER test-student-26@talib.dev, role restored after STUDENT gating test) — wipe via scripts/seed-acceptance.ts anytime.

---
Task ID: 3
Agent: main (Super Z)
Task: Round 27 — review §7 (personal schedule classes) + §15 (first-run tour) + owner requests: reduce boxes, clean.

Work Log:
- Part F (§7): new PersonalScheduleItem model (per-user, indexed; schema + prisma db push). New /api/schedule/personal GET/POST/PATCH/DELETE — dual-branch (Supabase/prisma), every query scoped to caller id + ownership checks on PATCH/DELETE. Manual tab now merges official rows + amber «شخصية» rows (badge, notes line with StickyNote icon, edit/delete for owner); students get single «حصة شخصية» button, supervisors get «حصة رسمية» + «حصة شخصية» side-by-side; legend line explains the amber rows; PersonalSlotDialog covers add+edit (day/time/type/place/notes + privacy note). download/supabase_personal_schedule.sql for production (IF NOT EXISTS, permissive RLS per repo pattern). Commit a3dcf0f.
- Part G (§15): tour-overlay.tsx — 3 steps (talib-tour-services grid → talib-tour-gear → talib-tour-profile), spotlight ring + dim via huge box-shadow (no deps), scroll/resize tracking, above/below tooltip placement, step dots, تخطّي/التالي/يلا نبدأ. Once per user (localStorage talib-tour-<userId>), only on HOME after onboarding, dismissible. Anchors tagged in home-screen/page.tsx/bottom-nav-bar. Wired into ShellInner next to SonnerToaster. Commit a8072e3.
- Part H: home flattened — 8 service tiles Card→borderless bg-muted/40, announcements per-row Cards→divide-y list + plain-text states, join banners/Telegram/onboarding hint→borderless tinted rounded-2xl; Card import removed. Commit c00eadf.
- Part I: fixed 3 suppressed TS errors (mark-read as-never/skipDuplicates → plain createMany with in-code dedup; telegram/setup select{head,limit}→.limit(1); verify-review2 role cast to UserRole); tsconfig excludes platform skills/; next.config ignoreBuildErrors REMOVED — build now fails on type errors; tsc --noEmit = 0 errors, production build green. cleanup-test-accounts.ts wiped round-26+27 test users (dev DB: 0 users). Commits ede6a2e, ef78128 (title tooltip), c20ad46.
- Verification (390×844 real browser, port 3100, seeded structure): signed up round27-test@talib.dev through the UI, completed 6-step onboarding → tour auto-opened on HOME, all 3 steps + dots + skip verified via screenshots; flag persisted (talib-tour-2: done), reload does NOT re-show. Schedule: added personal class (Mon 08:00–09:30 TD B12 + notes) → amber row + badge + notes rendered; edit room→C20 persisted; delete confirmed → gone. Student gating re-checked by DB role flip (OWNER saw both buttons, STUDENT sees one). Dark mode amber rows legible. scrollWidth=390 (no overflow) on home+schedule; zero console/page errors. Screenshots: download/verify-390/r27-*.png.
- Report: تقرير-إصلاحات-الجولة-27.md (repo convention).

Stage Summary:
- Deliverable: 6 commits a3dcf0f..c20ad46 on local main, one per part + fixes, ready to push.
- Key decisions: personal classes are a SEPARATE table (never mixed with official schedule — §7 wording); tour flag is localStorage-only (UI concern, not academic data); box reduction scoped to HOME (settings/profile keep intentional card structure); ignoreBuildErrors removed now that tsc is clean.
- Production note: run download/supabase_personal_schedule.sql once in Supabase SQL editor (app degrades gracefully until then).

---
Task ID: 4
Agent: main (Super Z)
Task: Add Google AdSense (publisher ca-pub-8081529487869617) + ads strategy advice.

Work Log:
- Verified no CSP headers in project (external script loads freely); Round 27 was already complete on main (a3dcf0f..c20ad46).
- layout.tsx: added next/script loader — src=pagead2.googlesyning...adsbygoogle.js?client=ca-pub-8081529487869617, crossOrigin=anonymous, strategy=afterInteractive (non-blocking, after hydration), client id in ADSENSE_CLIENT const + policy note comment (AdSense=web only, AdMob if ever wrapped in APK).
- public/ads.txt: standard AdSense verification line (google.com, pub-8081529487869617, DIRECT, f08c47fec0942fa0).
- Verification: tsc --noEmit = 0 errors; bun run build green; no UI change (script is invisible).
- Pushed commit beabf1e to main.

Stage Summary:
- Deliverable: AdSense loader live on every page + ads.txt for domain verification. No ad slots placed yet (owner to decide placements after AdSense site approval).

---
Task ID: 5
Agent: main (Super Z)
Task: Add google-adsense-account meta tag + check the public page for AdSense readiness.

Work Log:
- layout.tsx metadata: added other: { "google-adsense-account": ADSENSE_CLIENT } — reuses the existing const (single source of truth).
- Readiness check: robots.txt allows all bots; middleware is pass-through (no edge redirects); page.tsx is a "use client" SPA at the single root URL.
- Built + started prod server on :3210, curl-verified: /ads.txt serves the correct line; <meta name="google-adsense-account" content="ca-pub-8081529487869617"/> renders in head; AdSense loader script present; <title> renders.
- Extracted indexable body text of the served HTML: 15 chars total — "جاري التحميل..." only. Anonymous visitors get a pure client-rendered shell + login screen; zero indexable content.
- Pushed commit 3dfb45b to main.

Stage Summary:
- Meta tag live. Verdict: site is NOT ready for AdSense approval — no public content (login-walled SPA, raw HTML = "Loading..."). Recommendation delivered: build an SSR/SSG public landing page (hero/features/FAQ + mandatory privacy policy) as the approval target; hero-banner assets already exist in public/talib/.

---
Task ID: 6
Agent: main (Super Z)
Task: Build the public, server-rendered website to prepare the site for Google AdSense approval (the blocker identified in task 5).

Work Log:
- Read shared chat context (rounds 1-27 + ads rounds); cloned Gu-mo repo, verified commits 0bb52fe..beabf1e lineage.
- Moved the login-walled SPA from src/app/page.tsx → src/app/app/page.tsx (git mv); updated 8 files importing useShell/ScreenRoute/CourseSummary from @/app/page → @/app/app/page.
- Built the public site: landing / (hero + 8 features + real app screenshots + 3 steps + FAQ preview + ad slot), /features, /guide, /faq, /about, /contact, /privacy, /terms — all SSG, Arabic RTL, same academic design system (emerald/cream/bronze, Cairo font).
- AdSense-critical privacy policy: Google third-party cookies + DoubleClick disclosure, ads settings opt-out link, minors/TFUA note, full user rights (access/export/delete).
- SEO: src/app/sitemap.ts (8 public URLs), src/app/robots.ts replacing static file (allows bots; disallows /app /ads-test /api; sitemap ref), canonical per page, metadataBase in layout, JSON-LD (WebSite + SoftwareApplication + FAQPage).
- Copied 5 real app screenshots to public/talib/screens/ for the landing showcase.
- Real-mode AdUnit placements (slot 4214645931) on /, /features, /guide — serve automatically after Google approval.
- Updated /ads-test + not-found links to /app; kept /ads-test noindex.
- New src/lib/site.ts: SITE_URL (NEXT_PUBLIC_SITE_URL env, fallback https://gu-mo.vercel.app — confirmed real domain from not-found.tsx), SITE_NAME, CONTACT_EMAIL single source.
- Verification: tsc = 0 errors; build green (all public routes static); curl confirms google-adsense-account meta + AdSense loader + canonical + JSON-LD in raw HTML; indexable words: / = 722, /features = 800, /guide = 598, /faq = 697, /about = 434, /contact = 279, /privacy = 807, /terms = 499 (~4,800 total, was 15 chars); /ads.txt + /robots.txt + /sitemap.xml serve correctly.
- Browser 390×844: no horizontal overflow on any page, all images load (lazy below fold), /app SPA login intact; screenshots in download/verify-site/r28-*.png; Arabic report تقرير-إصلاحات-الجولة-28.md.

Stage Summary:
- Deliverable: public AdSense-ready website (8 content pages, ~4,800 words) deployed around the login-walled app at /app. All technical AdSense prerequisites verified live: script, meta, ads.txt, robots, sitemap, content, legal pages, contact, nav, mobile-ready.
- Owner actions: set NEXT_PUBLIC_SITE_URL in Vercel for custom domain; confirm CONTACT_EMAIL in src/lib/site.ts; then submit for AdSense review + Search Console.

---
Task ID: 7
Agent: main (Super Z)
Task: Round 29 — owner email update, configurable ads-test path, remove student calculator, more tools, clarify box boundaries.

Work Log:
- Pulled latest (user's local ads-test removal was NOT pushed — repo still had it; handled here). Updated CONTACT_EMAIL to besseghiermohamed719@gmail.com in src/lib/site.ts (propagates to contact + privacy pages).
- Ads test page: deleted fixed src/app/ads-test/, built src/app/[slug]/page.tsx — renders the test page only when slug === ADS_TEST_PATH env (default "ads-test"), otherwise notFound(); ADS_TEST_REAL=true switches to real ads; page keeps noindex; robots.ts disallows the same env path; .env.example documents both vars. Verified live with default AND custom path (old path 404s, new path 200, all public routes unaffected).
- Removed حاسبة الطالب: deleted grades-screen.tsx, GRADES route/hash/render, nav.grades + grades.* i18n keys (ar+en); home tile replaced by أدواتي (Wrench icon, t("nav.tools")) → new TOOLS route renders TalibFilesScreen initialTab="tools" (#/tools); gpa-tool user-facing strings updated (save toast/button now reference home hero, not the removed screen); public site pages (landing/features/guide/faq) reworded to point the calculator to أدواتي.
- New tools (4 → 7): extract-pdf-tool.tsx (pdf-lib copyPages, "1-3, 5, 8-10" ranges with Arabic-Indic digit normalization + full validation), word-counter-tool.tsx (live words/chars/sentences/paragraphs/reading-time, tashkeel-stripped, paste/copy/clear), study-timer-tool.tsx (pomodoro with SVG ring, timestamp-based ticking, WebAudio beep, long break every 4th session, daily focus total in localStorage). All follow the established tool pattern (privacy banner, back chevron, share/download outputs).
- Box boundaries: subtle borders added to home quick-action tiles (border-border/70, hover deepens), Telegram card + both group banners (tinted borders), onboarding hint, and schedule official class rows (bg-muted/40 + border) to match personal rows.
- Verification: tsc clean, build green; seeded acceptance structure + created account via real signup, walked onboarding + tour, opened all 7 tools at 390×844: word counter stats correct (11 words/3 sentences), timer ticking (24:57 after 3s), GPA tool loads real specialty courses; VLM confirms clear box boundaries; dark mode + no horizontal overflow + no console errors; test account wiped via updated cleanup script. Screenshots download/verify-390/r29-*.png; Arabic report تقرير-إصلاحات-الجولة-29.md.

Stage Summary:
- Deliverables: configurable-path ads test page (ADS_TEST_PATH/ADS_TEST_REAL), calculator consolidated into أدواتي with direct #/tools route from home, 3 new offline tools (7 total), clarified box boundaries across home + schedule.
- Owner actions: set ADS_TEST_PATH in Vercel (path of choice); set ADS_TEST_REAL=true after AdSense approval.
