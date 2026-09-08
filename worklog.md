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

---
Task ID: 8
Agent: main (Super Z)
Task: Round 30 — add Vercel Marketplace native add-ons (Web Analytics + Speed Insights) in support of the AdSense launch.

Work Log:
- Investigated Vercel Marketplace (live catalog via browser): third-party integrations (Sentry/Axiom/Resend/Neon…) cannot be installed via API token — browser consent required; native add-ons installable via code.
- Given vck_ token is limited-scope (project API returns not_found / forbidden), chose the GitHub-code route: bun add @vercel/analytics@2.0.1 + @vercel/speed-insights@2.0.0.
- Mounted <Analytics /> + <SpeedInsights /> in src/app/layout.tsx root (after AdSense script) — covers all public pages + /app SPA.
- Verified: tsc 0 errors; next build green; all public routes still SSG; AdSense script/meta/ads.txt untouched.
- Wrote تقرير-إصلاحات-الجولة-30.md; DB add-on skipped (Supabase+Prisma already in stack); one-click links documented for optional third-party add-ons.

Stage Summary:
- Native add-ons wired at root: audience analytics (AdSense traffic evidence) + Core Web Vitals (page-experience signal). Owner: after deploy, click Enable on Project → Analytics tab (free).

---
Task ID: 9
Agent: main (Super Z)
Task: Round 31 — fix files/tools duplication (owner feedback) + Google Drive cloud storage for personal files (owner request: Supabase is small).

Work Log:
- Duplication diagnosis: أدواتي was BOTH a home tile and a tab inside ملفاتي; the TOOLS tile opened the files screen pre-selected on the tools tab (wrong title/subtitle). Verified via live code reading (files-screen.tsx, page.tsx TOOLS/FILES routes, home grid).
- Fix: new standalone TalibToolsScreen (tools-screen.tsx); FILES route renders TalibFilesScreen without initialTab prop; files tabs now المكتبة/ملاحظاتي/سحابتي; #/tools hash unchanged.
- سحابتي (Google Drive): src/lib/drive.ts (GIS OAuth drive.file scope, find-or-create «طالب — Talib» folder, XHR multipart upload with progress, list/download/share-anyone-with-link/delete/quota, localStorage token + silent re-auth + expired-session recovery) + cloud/drive-tab.tsx (connect card with privacy note, quota bar, multi-upload progress, file actions) + 7-step Arabic self-service setup guide when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset.
- Added typescript@5 as real devDependency (previous tsc checks ran through a bogus npx shim — now genuine ./node_modules/.bin/tsc = 0 errors); next build green, public routes still SSG.
- Live verification on production with a real test account (talib.round31.test@example.com — wipe via scripts/cleanup-test-accounts.ts): onboarding walked; ملفاتي tabs = [المكتبة, ملاحظاتي, سحابتي] with the Drive setup guide rendering (7 steps, no console errors); أدواتي = standalone screen with 7 tools + privacy banner; #/tools restores after reload; screenshots download/verify-390/r31-*.png at 390×844.
- Radix note: programmatic .click() does not switch tabs (pointer-event activation) — used real browser clicks for verification.

Stage Summary:
- Tools live in exactly one place (أدواتي screen); ملفاتي owns library/notes/cloud. Personal files now have a 15 GB home in each student's own Google Drive with zero Supabase usage.
- Owner action (one-time, 5 min): create Google OAuth Web Client ID (origins: https://gu-mo.vercel.app) → set NEXT_PUBLIC_GOOGLE_CLIENT_ID in Vercel → Redeploy. In-app guide walks through it.

---
Task ID: 10
Agent: main (Super Z)
Task: Round 32 — publish-to-library: supervisors upload lecture files from THEIR OWN 15 GB Google Drive (owner: "use my Drive, not Supabase's 1GB").

Work Log:
- Design: extends round-31 سحابتي connector — admin links Drive once (same GIS consent), publishes PDF/DOCX/PPTX/images browser→Drive with progress into «📚 مكتبة طالب» subfolder, auto anyone-with-link; students download from المكتبة with zero setup. Supabase stores ONLY the metadata row (~0.4 KB) — zero file bytes.
- drive.ts: findOrCreateLibraryFolder(), getDriveShareLinks() (webContentLink + constructed fallback), uploadToDrive(sourceTag="talib-library").
- library API: POST accepts driveFileId/fileSize with graceful fallback (inserts base row if storage_path/file_size columns absent — publish never fails); GET maps both. Prisma LibraryReference += fileSize?/storagePath?.
- files-screen: AddLibraryItemDialog → two modes (رابط خارجي / رفع ملف (Drive)); missing-client-ID → pointer to سحابتي guide (no duplicated steps); connect card; file picker (title auto-filled, format inferred, size shown); publish with % progress; library cards show size badge + «على Drive» badge + تنزيل button; delete tries Drive cleanup best-effort.
- utils.ts: shared formatBytes() (drive-tab's local fmtSize now delegates).
- Verified: genuine tsc 0 errors; build green; public routes still SSG.

Stage Summary:
- Lectures now flow: admin's 15 GB Drive → whole specialty, students need no account. Vercel 4.5 MB body limit irrelevant (browser→Drive direct). Optional 2-line SQL (file_size/storage_path columns) documented in تقرير-إصلاحات-الجولة-32.md — app works without it (badges hidden).

---
Task ID: 11
Agent: main (Super Z)
Task: Round 33 — owner feedback: (1) no upload button in course materials, (2) Drive disconnect needs a warning, (3) project review + bugfix, (4) repo cleanup with backup-clone procedure then delete the copy.

Work Log:
- Root cause: course detail had 3 tabs only (الدروس/الاختبارات/الواجبات) — no materials UI at all. Added 4th tab «المواد»: module-scoped library view + «إضافة مادة للمقياس» publish-from-Drive button for supervisors; material appears in course tab AND specialty library.
- PublishToLibraryDialog extracted to cloud/publish-dialog.tsx (single source for المكتبة + المواد; moduleId/defaultCategory props); local copy removed from files-screen (−358 lines).
- library API: ?moduleId= filter (needsSchema flag when column absent → graceful empty + hint), module_id insert with same try-full/fallback-base pattern; Prisma LibraryReference.moduleId?.
- سحابتي: disconnect now requires confirmation (files stay in Drive explained in-dialog).
- Review: fixed missing Plus import (would break build); removed dead useI18n in course-detail; eslint clean on changed files; no console.log leftovers; genuine tsc 0 errors; build green.
- Cleanup per owner protocol (upload/تنظيف-وقاعدة-حماية-git.md): per-candidate reference greps (comments only, zero code refs); tool-results/ (6 agent-log files) + 34 verify PNGs removed from git (screenshots preserved outside repo + remain in git history); all 7 download/*.sql kept (md5-unique, no duplicates); upload/, scripts/, Caddyfile, root configs untouched; local env audited (no dev.db; node_modules 1.3G + tsbuildinfo deleted post-push; skills/ = 61M platform infra, kept).
- Backup clone (275 files incl. round-33 commits) → cleaned tree diff = exactly 40 deletions + 2 intended edits; screens-folder rule-10 check: 17 files before/after; backup deleted after verification.

Stage Summary:
- Courses now own their materials: upload inside المقياس via supervisor's 15 GB Drive, students download with zero setup; disconnect is guarded. Repo HEAD clean (275 → 235 tracked files). Optional SQL for full course-linking: ALTER TABLE library_references ADD COLUMN IF NOT EXISTS module_id INTEGER;

---
Task ID: 12
Agent: main (Super Z)
Task: Round 34 — two-tier homepage feature section (visual hierarchy) + owner-requested fixes (typos, duplicate nav, أدواتي description) + new blog (4 Arabic articles).

Work Log:
- Homepage: FEATURES array split into FEATURES_TOP (3 large cards: حاسبة العلامات, الجدول الذكي, أدواتي NEW with Wrench icon + client-side-tools description) and FEATURES_MORE (6 compact single-line rows inside one bordered container, 2-col ≥sm, small muted icon chips, bold inline titles, full descriptions preserved). Tier labels «الأبرز في طالب» / «وأيضاً داخل حسابك المجاني». Counts kept truthful: intro ثماني→تسع خدمات, hero badge ٨→٩ خدمات. Screenshots/ثلاث خطوات/FAQ sections untouched structurally.
- Typos: بووزعادة→بوزريعة ×13 across 7 files (evidence: layout.tsx keyword "ENS Bouzaréah" + about page "الجزائر العاصمة"); guide «زرر القلم»→«زرّي», «لمستواها»→«لمستواك»; landing «المراجرة»→«المراجعة», «رافقك»→«يرافقك».
- Stale أدواتي wording (pre-round-29 "تبويب أدواتي داخل ملفاتي") corrected in /features, /guide, /faq → standalone screen via home card; /features gained section «٤. أدواتي — سبع أدوات تعمل في جهازك دون إنترنت» (sections renumbered ٤→٩); features/guide metadata updated.
- Duplicate nav: removed دخول التطبيق from footer روابط الموقع (sticky header button already always visible); AdSense-required privacy/contact links untouched.
- Blog: src/lib/blog.ts (4 original Arabic articles ~600-800 words: GPA-by-coefficients with numeric example, pomodoro, phone-photos→PDF, weekly review schedule); /blog index (SSG, ar-DZ month names) + /blog/[slug] (SSG via generateStaticParams + dynamicParams=false, Article JSON-LD, mid-article AdUnit, app CTA); المدونة added to header NAV + footer; sitemap includes /blog 0.7 + 4 posts 0.6/monthly.
- Bugfix found during review: missing React key on homepage SCREENS map (eslint error) — key={s.src}.
- Verified: genuine tsc 0 errors; eslint clean on 13 changed files; build green with /blog static ○ and 4 posts SSG ●; prod server + real browser: all public routes 200, /blog/unknown 404, zero بووزعادة across 7 pages, href="/blog" ×3 on homepage, no horizontal overflow at 1280/390 (screenshots download/verify-390/r34-*.png).
- Pitfall logged: agent-browser stale server on port 3344 returned 404 for /blog after rebuild — kill next-server (not just "next start") before re-testing.

Stage Summary:
- Deliverable: homepage feature section now signals hierarchy (3 differentiators prominent, 6 essentials compact), site copy corrected (بوزريعة, أدواتي standalone wording), footer de-duplicated, and a 4-article Arabic blog live for AdSense content depth.
- Owner note: if the Supabase institution row spells the school «بووزعادة», rename it from admin (الهيكل ← المؤسسات) to match.

---
Task ID: 13
Agent: main (Super Z)
Task: Round 36 — re-implement the lost round-35 fixes (session reset wiped them before push): OWNER force-delete, actionable blocked-delete dialogs, visible structure buttons, تغيير المسار الأكاديمي.

Work Log:
- Context recovery: the previous session (round 35) completed + verified all 4 fixes but its environment reset before the push; GitHub main was still at round 34 (d582427) and the bundle/patches died with that session. Owner provided a fresh token; re-implemented from the shared-chat narrative against round 34.
- Force-delete APIs (?force=1, OWNER-only) in institutions/specialties/years — both Supabase + Prisma branches: collect subtree ids, DETACH accounts before the cascade (scopeCohortGroupId/scopeGroupId nulled via relation filters — scopeCohortGroupId is a RESTRICT FK in Prisma; then assignedSpecialtyId re-pointed to a surviving specialty (same institution preferred for specialty deletes) with ALL scope columns cleared; guard: refuse force when the target holds the platform's LAST specialty (schema has no user-without-specialty state). Blocked responses now carry structured counts.
- Admin panel: StructureManager sub-tab + filters LIFTED (controlled Tabs) so dialogs can navigate: «انتقل الآن إلى التخصصات» (pre-filtered to the institution) and «انتقل الآن إلى السنوات» (pre-filtered to the specialty) via preset props with consume-once effects. Blocked-delete dialogs gained count badges + OWNER-only force section (ack checkbox «أفهم أن هذا الحذف شامل ونهائي…» gating «حذف نهائي مع كل المحتوى المرتبط»).
- Visible buttons: all 4 structure lists (institutions/specialties/tracks/years) edit+delete switched ghost→outline bordered icons; delete red-tinted (border-destructive/40 + text-destructive).
- تغيير المسار الأكاديمي: profile button (all roles) → shell startPathChange() → onboarding rendered in mode="change": current path pre-selected once per list (no R12-11 violation — restoring the user's own saved values), amber «مسارك الحالي» banner from /api/profile/details, «إلغاء والعودة إلى حسابي» escape, «حفظ المسار الجديد» finish; completion refreshes session → back to PROFILE with toast.
- Parity fixes: /api/profile/details Prisma branch now returns track/year/group/cohort names (was "—"); site.ts SITE_URL empty-string env now falls back (trim+||).
- Race fixed during verification: panel mount fetch (unfiltered) raced the preset/auto-filter fetch and overwrote it (showed 2 specialties under a 1-institution filter) — added latest-request-wins seq guards to specialties/years/tracks fetches.
- Verified: genuine tsc 0 errors; eslint clean (9 changed files); build green (public routes still SSG). Real-browser 390×844 walkthrough on local SQLite: signup OWNER → onboarding → change-path (banner + preselection + L3 change persisted to DB + cancel path) → admin structure: blocked institution delete (counts + jump + ack + force) → force executed: whole subtree wiped (2→1 institutions, 10→5 years, 20→10 cohorts), OWNER account survived re-pointed to surviving specialty with scopes cleared → year force delete (1 group + 2 cohorts wiped) → detached-user change-path shows «غير محدد بعد» gracefully. scrollWidth=390, no console errors. Screenshots download/verify-390-r36/ (local-only per round-33 rule).
- Cleanup: test user fully wiped (users: 0), acceptance structure re-seeded clean.

Stage Summary:
- Deliverable: round-35's four owner complaints re-implemented and verified end-to-end (APIs both branches + dialogs + buttons + change-path), plus 3 parity/robustness fixes (profile-details names, SITE_URL empty env, fetch race) — commits on main with the owner's token.
- Key decisions: force-delete detaches accounts, NEVER deletes them; last-specialty state deliberately protected; force limited to OWNER even on years (supervisors keep normal delete only); change-mode preselection restores saved values once (explicit-tap rule intact).

---
Task ID: 14
Agent: main (Super Z)
Task: Round 37 — «تغيير المسار الأكاديمي» restricted to OWNER-only (3 layers) + smart institution-name abbreviation in حسابي (Arabic + Latin names).

Work Log:
- Owner request: (1) path change is a platform-owner power — round 36's all-roles button must become OWNER-only; (2) long institution names in حسابي cut mid-word by CSS «…» — abbreviate to the distinctive last name, also for English-letter names.
- OWNER-only enforcement, 3 layers: profile-screen button gated `role === "OWNER"`; shell `startPathChange` guard (defense in depth); onboarding-screen sends explicit `mode: "change"|"initial"` and `/api/onboarding/complete` returns 403 «تغيير المسار الأكاديمي متاح للمالك فقط» for non-OWNER change-mode (initial onboarding stays open to every role — round-9 membership-preservation untouched).
- New `src/lib/abbreviate.ts` → `abbreviateOrgName(name, max=16)`: short names untouched; Arabic → type-initial (ignoring «ال») + last meaningful word («المدرسة العليا للأساتذة - بوزريعة» → «م. بوزريعة»); Latin → accent-normalized initials + last name («Lycée Frères Bousouf» → «L.F. Bousouf», tight fallback «ENSD Bouzaréah»); parenthesised suffixes («(القرار 105)») never picked as the last name; mixed-script treated Arabic-style. Full name preserved in the cell's `title` via new InfoCell `fullValue` prop — display-only, zero schema change.
- Verified: 12/12 abbreviation unit cases (scripts/test-abbreviate.ts, bun); genuine tsc 0 errors; eslint clean (5 changed files); build green (public routes still SSG). Real-browser 390×844 walkthrough (local Prisma/SQLite): OWNER onboarded → حسابي shows button + «م. بوزريعة» cell (title = full name) → change wizard opens with current path marked «مُحدد» + cancel works; STUDENT onboarded (mode=initial passes) → حسابي has NO button + cell «ج. للآداب»; API probes: student+mode=change → 403, owner+mode=change (own ids) → 200 ok. scrollWidth=390, no console errors. Screenshots download/verify-390-r37/ (local-only per round-33 rule).
- Cleanup: owner37/student37 test accounts wiped (users: 0, structure intact 2/2/10); first-run tour + fixed-inset-0 overlays dismissed via تخطّي during walkthrough (round-36 pitfall pattern: stale overlays block clicks).
- Committed 3×: cb18377 (server+shell+mode enforcement), 61ded6b (profile screen: OWNER-only button + abbreviation + util + test/cleanup scripts), 68dfb2d (Arabic report تقرير-إصلاحات-الجولة-37.md).

Stage Summary:
- Deliverable: path switching is now an OWNER-only power enforced server-side (not just hidden UI), and the حسابي institution cell reads «م. بوزريعة»-style abbreviations with the official name in the tooltip — Arabic and English-letter names both covered.
- Key decisions: abbreviation is display-only (no DB/schema change); max=16 chars fits the 390px 2-col cell; initial onboarding deliberately NOT restricted (new-device flow must keep working) — only the explicit change-mode is guarded.

---
Task ID: 15
Agent: main (Super Z)
Task: Round 38 — group acceptance reflects instantly (stale-session fix, 3 sync points) + publish dialog defaults to «رفع ملف (Drive)» (owner's Drive-correction).

Work Log:
- Owner request: (1) after acceptance into a group the cohort should appear linked to the account and «تصفح المجموعات والأفواج» should disappear — in reality the fresh details API already showed the cohort while the STALE session (refresh only on login) kept the browse button visible; (2) «when uploading a file it doesn't go to my Drive — make the file upload button the one that opens, not uploads to the Supabase server».
- Session freshness, 3 sync points: AuthProvider gained a throttled (15s) visibilitychange refresh; shell bell onClick fires refresh() (the moment the student reads «تم قبول طلبك»); profile-screen refreshes once per mount via syncedOnceRef guard (ref guard essential — the details fetch effect depends on [user] and refresh() replaces the user object identity).
- Publish dialog: default mode flipped «link»→«upload», mode buttons reordered (رفع ملف (Drive) first); verified the Drive pipeline was ALREADY zero-server-bytes (browser→Drive, anyone-with-link, metadata row only — round 32 code) and that NEXT_PUBLIC_GOOGLE_CLIENT_ID IS baked into the production bundle (extracted real client id 811607156192-... from deployed chunk 92b25c8f8db299d5.js) — so uploads to Drive work on prod today; the dialog just opened on the link form and read as server-storage.
- Verified: tsc 0 errors; eslint clean (4 changed files); build green. Real-browser 390×844 with PARALLEL sessions (agent-browser --session student): student joins cohort 01 → owner approves from لوحة الإشراف (DB: scopeCohortGroupId=21, groupNumber=«الفوج 01») → student WITHOUT reload opens bell (approval notification visible) → حسابي: browse button GONE + «الفوج 01» cell; publish dialog opens in upload mode (local amber no-clientId card = UploadMode branch; prod has the id). scrollWidth=390, no console errors. Screenshots download/verify-390-r38/.
- Cleanup: owner38/student38 + join request wiped (users: 0, join_requests: 0); scripts/cleanup-test-accounts-r38.ts committed.
- Pitfall (repeat of round 33): stale `next-server` survived on :3000 serving the REBUILT .next → chunk-hash mismatch → "client-side exception" on load. Always `pkill -f next-server` before `next start` after a rebuild.

Stage Summary:
- Deliverable: cohort acceptance (and any admin-side role/scope change) now lands in the student's UI without reload (bell/حسابي/visibility sync); the file-publish dialog leads with the real Drive upload, eliminating the «it stores on the server» misread.
- Key decisions: no schema/API changes — both fixes are client-side session hygiene + default-mode flip; visibility refresh throttled to 15s to stay cheap; production env verified correct so no Vercel action needed.

---
Task ID: 16
Agent: main (Super Z)
Task: Round 39 — real actions inside the course interior (lessons/materials/exams/assignments tabs), per owner's "there isn't a single button inside the course; make materials references, not just words".

Work Log:
- Diagnosis of course-detail-screen.tsx: lessons had only a ghost ExternalLink icon; materials lost their button entirely when downloadUrl was empty; exams/assignments tabs were 100% static cards (zero buttons, description clamped at 3 lines with no recovery).
- الدروس: TgItem mirror gained mimeType/fileId (API already returned them); new LessonCard component renders image thumbnails via /api/telegram/file proxy (telegram-screen pattern, per-item imgError fallback), a VISIBLE outline «فتح» button per item, and formatted file size.
- المواد: title itself is now the reference link (primary color + underline on hover) when downloadUrl exists; added «نسخ رابط» clipboard button; URL-less materials honestly badge «بدون رابط»; canManage gets edit (full EditMaterialDialog mirroring files-screen's EditLibraryItemDialog, PATCH /api/library) + delete (confirm dialog, DELETE /api/library?id=).
- الاختبارات: every user gets «أضف إلى جدولي» → POST /api/schedule/personal with type «امتحان», weekday derived from examDate (getDay()+1, Sun=1..Sat=7), room/time copied, full date preserved in notes; button flips to «أُضيف إلى جدولي» with green check (per-mount state). canManage gets edit (EditExamDialog, module fixed, PATCH /api/exams) + delete confirm (DELETE /api/exams?id=).
- الواجبات: done-toggle sharing the assignments screen's localStorage key talib-assignments-completed (checked here = checked there); «التفاصيل» dialog with the FULL description (fixes the 3-line clamp) + formatted due date + max score; «تبليغ» report-issue dialog (same /api/issues flow); canManage gets edit (PATCH /api/assignments) + delete confirm.
- Meta strip: 4th column shows المواد count.
- Follow-through fix (schedule-screen.tsx + ar/en.json): exam pushed to a FRIDAY/SATURDAY was saved to the personal schedule but invisible there — the day grid rendered only keys 1-5. Weekend cards now render ONLY when day 6/7 has items (official or personal); added schedule.friday/saturday i18n keys. This keeps the button's toast promise «تجده في شاشة الجدول» true.
- Exams/assignments dates inside the course now display via formatDateAr instead of raw ISO.
- Verified: tsc 0 errors; eslint clean (2 changed screens); build green (public routes still SSG). Real-browser 390×844 PARALLEL sessions on local SQLite: OWNER saw and exercised every button (material edit actually saved + toast; throwaway exam deleted via UI confirm, API-verified; exam pushed to personal schedule, DB row dayOfWeek=7 room/time/type correct; assignment toggle + details dialog with full 3-line description). STUDENT session saw consumption-only buttons (فتح/نسخ/تفاصيل/تبديل/تبليغ/أضف إلى جدولي, zero manage icons) and pushed the exam to their OWN schedule (separate userId row). Weekend «السبت» card appeared on the schedule screen for both. scrollWidth=390 both sessions, zero console errors. Screenshots download/verify-390-r39/ (local-only per round-33 rule).
- Cleanup: scripts/r39-seed.ts (ids/seed/cleanup modes; Exam model needs moduleName — required field). Wiped owner39/student39 + course + all dependent rows + personal schedule rows → users 0, content tables 0, acceptance structure intact (2/2/10/6/20).
- Committed: a277d59 (feature, 5 files) + 4f5a021 (report تقرير-إصلاحات-الجولة-39.md); pushed cc590d5..4f5a021.
- Deploy check: prod chunk 7028f5105e4e1203.js contains «جدولي» AND «بدون رابط» — round-39 code live on gu-mo.vercel.app.

Stage Summary:
- Deliverable: the course interior is now interactive end-to-end — every tab carries visible, role-appropriate actions (students: open/copy/download/details/toggle/report/add-to-schedule; supervisors: full edit/delete in place), and materials behave as real references instead of dead words.
- Key decisions: no schema/API changes (all verbs already existed server-side); assignment done-state deliberately stays device-local under the shared key (parity with existing behavior); weekend day cards render on-demand so empty weeks stay 5-day; image thumbnails reuse the existing Telegram proxy (no new storage surface).

---
Task ID: 17
Agent: main (Super Z)
Task: Round 40 — course-level Drive upload row (per owner: "in some courses there are no upload buttons? … my drive becomes a shared space, available to any student").

Work Log:
- Verified round 38/39 state first (worklog tasks 15/16 already delivered both) — this round addresses the NEW message.
- Diagnosis: Drive publish pipeline existed since round 32/33 (browser → supervisor's Drive → anyone-with-link → metadata row; zero bytes on Supabase) but the trigger lived ONLY in the المواد tab while courses open on الدروس — supervisors saw "no upload button".
- course-detail-screen.tsx: supervisor-only card ABOVE the content tabs in every course («رفع ملف لهذا المقياس» + compact «رفع ملف (Drive)» trigger via new triggerClassName prop on PublishToLibraryDialog; moduleId auto-bound) with one-line storage story «إلى Google Drive الخاص بك — مساحة مشتركة يحمّل منها الطلبة الملفات مباشرة، دون أن يُخزَّن شيء على السيرفر»; materials empty hint now points at the header button.
- publish-dialog.tsx: triggerClassName prop (default w-full keeps files-screen unchanged); UploadMode footer rewritten to the shared-space model (Drive يصبح مساحة مشتركة / ولا يُخزَّن أي بايت على Supabase).
- Prod schema probe attempt: no Supabase URL/key extractable from deployed chunks (config lives in a lazy chunk, no buildManifest access) — skipped; API's graceful fallback covers both cases, one-time ALTER SQL documented in the round report.
- Verified: tsc 0; eslint clean; build green. Real-browser 390×844 parallel sessions (local SQLite): OWNER saw the upload card on ALL 4 tabs of the seeded course (count=1 per tab), both buttons coexist in المواد, dialog opens on upload mode (amber no-clientId card locally — prod has the id, verified r38). STUDENT: zero upload/add buttons across all tabs, still sees the seeded material as a clickable reference. scrollWidth=390 both, zero console errors. Screenshots download/verify-390-r40/.
- Cleanup: r39-seed cleanup + r40 account deletion → users 0, courses 0.
- Committed f26d331 (3 files) + report تقرير-إصلاحات-الجولة-40.md; pushed 4f5a021..f26d331.
- Deploy check: prod chunk a06bd8ef0c3d1e8c.js contains «مساحة مشتركة» AND «رفع ملف لهذا المقياس» — round 40 live on gu-mo.vercel.app.

Stage Summary:
- Deliverable: every course now shows a permanent supervisor-only Drive upload card above the tabs (no more "some courses have no upload buttons"), and the UI states the storage model explicitly: the supervisor's own Drive is the students' shared download space, Supabase stores metadata only.
- Key decisions: no API/schema changes (pipeline was already Drive-direct since round 32); header card reuses PublishToLibraryDialog course-scoped; students remain upload-blind by design.

---
Task ID: 18
Agent: main (Super Z)
Task: Round 41 — course uploads must land at the course, not the library (owner: "why did we create a course and upload section if they aren't going to be uploaded to the course location?").

Work Log:
- Confirmed the leak: files-screen general library listed course-scoped rows; POST /api/library silently dropped module_id on un-migrated prod DBs (base-row fallback); all uploads shared one «مكتبة طالب» Drive folder.
- /api/library GET: course rows (moduleId != null) excluded from the general list (Prisma + Supabase, graceful unfiltered retry when column absent). POST: strict course-scoping in BOTH branches — missing module_id → needsSchema + COURSE_SCHEMA_SQL, nothing saved; library-wide uploads keep the tolerant fallback. Prisma GET/POST also detect "no such column" (was silently swallowed).
- drive.ts: findOrCreateCourseFolder — «📘 {course name}» per-course subfolder under the app folder, moduleId tagged in appProperties; course uploads use it (source tag talib-course), library uploads keep «📚 مكتبة طالب».
- publish-dialog: courseName prop; dynamic footer (course folder vs library), submit label «نشر إلى المقياس», course-branded toast, NeedsSchemaCard (copyable SQL + «نفّذته — أعد المحاولة») wired into BOTH link and upload modes. Course-detail المواد tab schema card replaced by the same card (copy + retry refetch). files-screen library empty-state clarifies course files live at the course. download/supabase_course_materials.sql added (3 columns + index).
- Verified (tsc 0, build green, 390×844 real browser): library shows ONLY the general reference while the course shows exactly its 3 materials; physically dropped the SQLite moduleId column → tab + dialog needsSchema cards render, POST creates ZERO rows (DB-verified); restored column → «نفّذته — أعد المحاولة» saved the row course-scoped (moduleId=5) + toast; final API split: general → only lib row, ?moduleId=5 → only course rows. scrollWidth 390, zero console errors. Screenshots download/verify-390-r41/. Cleaned all test data (users 0, courses 0, library 0).
- Committed 6ac2638 (6 files) + report تقرير-إصلاحات-الجولة-41.md; pushed caf8650..6ac2638. Prod chunk 6fa9452f237b1ea5.js contains «نشر إلى المقياس» + «لا علاقة له بالمكتبة العامة» + talib-course tag — live.

Stage Summary:
- Deliverable: a material uploaded inside a course now lives ONLY at the course (app tab + its own «📘 course» Drive folder, students download direct); it can never leak into the general library, and an un-migrated DB surfaces a self-service one-time SQL card instead of silently demoting the upload.
- Key decisions: strict-fail over silent-fallback for course rows (the owner's trust issue was exactly the silent path); NeedsSchemaCard duplicated nowhere (exported, reused by tab + dialog); lessons untouched (Telegram mirrors, always course-internal by design).
- Owner action (one-time): run download/supabase_course_materials.sql in Supabase SQL editor (same snippet the in-app card offers).

---
Task ID: 19
Agent: main (Super Z)
Task: Round 41 follow-up bugfix — uploaded course materials invisible to the course's own students (owner-provided DB facts: row id=10 module_id=9 correct, student scoped 6/8 same as course 9, yet the student's المواد tab empty).

Work Log:
- Traced both query paths end-to-end: student المواد tab (course-detail-screen.tsx line 313) and the upload read-back hit the SAME GET /api/library?moduleId=N; all three briefed suspects ruled out by reading (no renamed field, no published/draft flag anywhere in the model, no route/component mismatch). The only role-dependent input is getCurrentUser().assignedSpecialtyId.
- ROOT CAUSE: POST /api/library stamped specialty_id with the UPLOADER's assignedSpecialtyId instead of the course's module_courses.specialty_id, while the student GET intersected specialty_id = viewer AND module_id = N — any course upload by a manager of another specialty (routinely OWNER: /api/courses GET lists only the viewer's specialty but POST lets OWNER create cross-specialty) strands the row where no student can ever see it (and since r41 part 1, the general library hides module rows too). The uploader's read-back "worked" only because the same wrong specialty sat on both sides of their own query.
- Local reproduction over real HTTP sessions (scripts/r41-repro.ts): OWNER at specialty 5 created a course in specialty 6, uploaded → row specialtyId=5/moduleId=7, owner read-back 1 item, student 0 items — exact prod pattern. (Setup: seed-acceptance re-run — the DB had been wiped by r40 cleanup; first-user-OWNER signup logic needs a clean users table, so the script now pre-cleans accounts.)
- Fix (both Supabase + Prisma branches of GET and POST): POST resolves module_courses.specialty_id, 400 if course missing, 403 if non-OWNER uploader is outside the course's specialty (same rule as courses PATCH/DELETE), stamps the row + notification with the COURSE's specialty; GET with moduleId authorizes against the course (OWNER reads any course, others must match the course's specialty) then filters by module_id ALONE — which also heals already-stranded rows (prod #10) with zero data migration.
- Extended verification (scripts/r41-verify.ts) all green: stranded wrong-specialty row visible to students after fix; cross-specialty admin POST → 403 + read → 0; legit supervisor row stamped 6; general library hides course rows for everyone. tsc 0, eslint clean, next build green (note: scripts/*.ts need `export {}` — bare top-level consts collide in tsc's global scope during build type-check).
- Deployed: commit 43a9f2c pushed (115976e..43a9f2c); PRODUCTION end-to-end verified (scripts/r41-prod-verify.ts): throwaway student onboarded into spec 6/year 8 on gu-mo.vercel.app → GET /api/library?moduleId=9 returns #10 «محاضرات نحو» — the exact reported scenario now works live; general library shows only legit specialty-wide rows; test account deleted via /api/auth/delete.
- Report: download/تقرير-إصلاح-ظهور-المواد-للطلبة.md; optional data-hygiene UPDATE appended to download/supabase_course_materials.sql (re-stamp legacy rows; visibility does NOT require it).

Stage Summary:
- Deliverable: course materials uploaded by ANY authorized manager are now visible to the course's students — the write path stamps the course's specialty, the read path authorizes via the course (OWNER bypass), and legacy stranded rows heal automatically with no migration.
- Key decisions: authorize module-scoped reads against the COURSE (not the row's specialty) so healing needs no data fix; keep the specialty filter on general-library reads (tenancy intact there); cross-specialty upload write-access stays OWNER-only exactly like courses PATCH/DELETE.

---
Task ID: 20
Agent: main (Super Z)
Task: Round 42 — unblock production deploy (Vercel: scripts/r41-prod-verify.ts:13 TS2451 "Cannot redeclare block-scoped variable 'name'") + decide whether scripts/ belongs in the prod TS build at all.

Work Log:
- Root cause: the file has no top-level import/export → tsc treats it as a global script; `const name` collides with the DOM lib global `window.name`. The r41 scripts that predated it only escaped by luck; any future sloppy script could block prod deploys the same way.
- Fix 1 (in-file): renamed `name` → `studentName` at its 3 uses (declaration, signup body, onboarding body).
- Fix 2 (structural, the more appropriate one): added "scripts" to tsconfig.json "exclude" — all 19 files under scripts/ are one-time dev/ops tooling (seeds, cleanups, probes, verifications), zero are app runtime; `next build` no longer type-checks them, so this bug class can never block prod again. Scripts remain runnable via bun (transpiles independently of tsconfig). Grep-verified no src/ file imports from scripts/.
- Verified: tsc --noEmit 0 errors; next build green (route table intact, public pages still SSG); pushed 301689c..5328596; Vercel deploy success confirmed via GitHub commit status API; live health check clean.
- Deliberately did NOT re-run r41-prod-verify.ts against prod: the fix it verifies (43a9f2c) was already deployed and end-to-end verified in Task 19; this round only unblocked the pipeline.
- Report: تقرير-إصلاحات-الجولة-42.md.

Stage Summary:
- Deliverable: production deploys are green again, and dev-only scripts are structurally out of the prod build forever (tsconfig exclude) — the exact failure class reported is now impossible.
- Key decisions: both fixes together (rename keeps the file valid even if ever re-included; exclusion is the systemic guard). No app code touched — zero runtime changes this round.

---
Task ID: 21
Agent: main (Super Z)
Task: Round 43 — implement the GitHub-research picks: useful additions to أدواتي + first AI capability (owner: "take useful items that can be added to my tools, and if there are any projects that offer artificial intelligence capabilities, bring those too").

Work Log:
- Found أدواتي already at 7 tools (r29/r31: GPA, image→PDF, compress PDF, merge, extract pages, word counter, pomodoro) — extended to 10 with the vetted MIT/Apache libraries from the r42 research.
- ضغط الصور: browser-image-compression (MIT) in a web worker, 3 presets, ≤20 images, honest "الأصل أفضل" rule when output ≥ input.
- صورة إلى نص (OCR): tesseract.js (Apache-2.0) fully on-device (image NEVER uploaded); engine+lang data download once from CDN (stated in-UI), ara / ara+eng / fra / eng, staged Arabic progress labels, result copy/download/share.
- المساعد الذكي: task-based AI (لخّص / اشرح / اختبرني / اسأل حرّاً) — new /api/ai route, plain-REST provider chain GROQ_API_KEY → GEMINI_API_KEY → 200 {needsConfig:true} (same convention as library needsSchema). Guards: session auth, 8000-char text cap, per-IP 5s cooldown + 60/day in-memory cap (valid requests only), 45s timeout, Arabic prompts with anti-hallucination instruction. Role-aware config card (owner sees env setup, students see قريباً). Violet accent + «جديد» + «يحتاج إنترنت» badge — the first ONLINE tool, visually separated from the offline file tools.
- Home tile subtitle updated («حاسبة، PDF، صورة إلى نص، مساعد ذكي»).
- Local functional probe (scripts/r43-api-probe.ts over bun dev + fresh SQLite via scripts/r43-seed-min.ts): anonymous 401 → signup 200 → authed {needsConfig:true} → validation 400 → self-delete 200. ALL PASS. Probe caught a real ordering bug (rate limiter burned cooldown on invalid requests → 429 instead of 400) — fixed: validation runs before rateLimited().
- tsc 0, eslint clean, build green (68 pages). dev.db/.env.local gitignored (verified). Report: تقرير-الجولة-43.md.

Stage Summary:
- Deliverable: أدواتي now 10 tools — 9 fully offline/on-device + the platform's first AI feature (Arabic task-based study assistant) with honest privacy notes everywhere and a zero-breakage activation path (add GROQ_API_KEY in Vercel → card auto-becomes the working tool).
- Key decisions: task-based AI over free chat (cheaper, safer, better Arabic quality control); Groq-first provider chain with Gemini fallback; OCR engine via CDN instead of vendoring megabytes; rate-limit only valid requests.
- Owner action (one-time, free): set GROQ_API_KEY (console.groq.com) and/or GEMINI_API_KEY (aistudio.google.com/apikey) in Vercel env vars.

---
Task ID: 22
Agent: main (Super Z)
Task: Round 44 — fix the permanent «تعذّر الحصول على إجابة الآن» failure (root cause: no real provider fallback + GROK/GROQ key mixup) and redesign المساعد الذكي as a ChatGPT/DeepSeek-style conversation (owner: "add speech bubbles, make it like ChatGPT and DeepSeek").

Work Log:
- Diagnosed r43's /api/ai: the documented provider chain never existed in code — `groqKey ? callGroq() : callGemini()` meant any value in GROQ_API_KEY (incl. the owner's xai- Grok key) 502'd the request with Gemini never tried; plus hardcoded gemini-2.0-flash which 404s on this key (proven in the Telegram pipeline probe).
- NEW src/lib/ai/providers.ts: real attempt chain (Groq → Gemini → xAI), per-failure classification (auth skips the whole provider, model/server errors try the next model, rate skips to next provider), key-format auto-detection (xai- key misplaced in GROQ_API_KEY is re-routed to x.ai as a working third provider), model chains env-overridable (GROQ_MODEL/GEMINI_MODEL/XAI_MODEL; Gemini chain = the live-verified one from classify.ts).
- Rewrote /api/ai as a chat endpoint: multi-turn {messages} in, SSE stream out (meta → delta* → error? → [DONE]) with stream:false JSON fallback; auth + validation before rate limit (r43 lesson); per-USER limits (3s gap, 150/day) instead of per-IP; 60s maxDuration; needsConfig convention kept; role-aware Arabic errors (OWNER gets key-format hints).
- Rewrote ai-assistant-tool.tsx as a full-screen RTL conversation: speech bubbles (violet user / muted assistant with gradient avatar), session sidebar (new-chat, titles, relative time, delete; static on desktop, sliding drawer + backdrop on mobile), live token streaming with typing dots + pulsing cursor + stop button (keeps partial), markdown rendering (react-markdown + remark-gfm — both MIT, added remark-gfm@4.0.1), copy + regenerate + retry-in-error-bubble, suggestion chips preserving the 4 r43 workflows as composer prefills, device-local history in localStorage (talib-ai-chat-v1-<userId>, 40 sessions, zero DB load), updated needsConfig card with the GROK≠GROQ explainer.
- tools-tab.tsx desc + home tile subtitle updated; r44 probe (scripts/r44-api-probe.ts) + cleanup script added.
- Verification: tsc 0 · eslint clean · build green (68 pages). Local probe over next start + seeded SQLite: anon 401 → signup 200 → empty 400 → assistant-last 400 → {needsConfig:true} without keys AND graceful Arabic SSE error event with dummy keys (chain walk proven live: Groq auth-rejected → provider skipped → Gemini models exhausted) → self-delete 200. ALL PASS. Real-browser UI test at 1280px + 390×844: empty state, suggestions, send, error bubble + retry, session appears in sidebar, history survives reload, mobile drawer, back button (screenshots in download/r44-*.png). Test accounts wiped (dev DB: 0 users).
- Report: تقرير-الجولة-44.md.

Stage Summary:
- Deliverable: المساعد الذكي is now a real chat product — bubbles, history sidebar, streaming, stop/regenerate/copy — and the «service busy» outage is structurally impossible: every key combination the owner may configure routes to a valid provider or degrades with an honest Arabic message.
- Key decisions: SSE streaming server-side with rAF-throttled client rendering; history stays device-local (privacy + zero Supabase load); Grok key mixup handled by auto-detection instead of documentation alone; provider errors classified so students never see raw hints (owner-only).
- Owner action (2 min): put a gsk_ key from console.groq.com in GROQ_API_KEY (or leave the xai- key there — it auto-routes), keep GEMINI_API_KEY, optionally add XAI_API_KEY, redeploy.

---
Task ID: 23
Agent: main (Super Z)
Task: Round 45 — remove all filler/uninformative UI text (owner: «in the course section it says "Your course materials are here", in the timetable "Your class schedule is here" — not an explanation, not helpful — remove all of this unnecessary text»).

Work Log:
- Live-inspected the whole app with a throwaway OWNER account (agent-browser 430×932) + r45-seed.ts sample data; catalogued every screen's header area. Found ONE recurring pattern: a subtitle <p> under each screen <h1> that restates the title or says «X في مكان واحد».
- Removed the subtitle from 13 screens: courses («تصفّح مقرراتك حسب السداسي»), schedule (mode-conditional «...في مكان واحد» / «ارفع صورة جدولك الخاص» / «سجل غياباتك...»), exams, files («...في مكان واحد»), announcements, assignments (literal title duplicate), group, profile, settings («اضبط التطبيق على مقاسك» + «...في مكان واحد» line in the about card), admin (tab list as prose), tools, telegram, and the 8 home service-tile captions («واجبات وتكليفات» under «الواجبات» etc. — QuickAction.subtitle field deleted entirely).
- Deliberately KEPT: empty states that explain workflow («ستظهر الواجبات هنا عند نشرها من طرف الإدارة»), the orange personal-classes legend, the telegram-lessons feature captions (non-obvious feature), Drive-upload explainer, the first-run tour (feature, shown once), and all public marketing/guide pages.
- Verified: tsc 0 · eslint clean (13 files) · build green (68 routes). Real-browser re-check of every modified screen — all start straight with content after the title. Screenshots download/r45/. Test account + sessions wiped from dev.db.
- Report: تقرير-الجولة-45.md. Commits e3f4da8 (feature) + report commit — LOCAL ONLY: push failed (could not read Username for github.com) — the r44 GitHub token died with the old session; no stored credentials. NOT deployed yet.

Stage Summary:
- Deliverable: every app screen now opens title → content with zero restating filler; home grid is icon+label only.
- Blocker: needs a fresh GitHub token (fine-grained or classic with repo scope) to push 2 commits to bessghiermohamed/Gu-mo main — Vercel deploys automatically on push.

---
Task ID: 24
Agent: main (Super Z)
Task: Round 49 — redesign the AdSense ad experience (owner: "redesign AdSense + feedback on un-redesigned elements").

Work Log:
- Restored context: shared chat link is auth-walled (blank SPA render, API 401), so identified project via GitHub API with the fresh token: bessghiermohamed/Gu-mo, last activity r47 today. Cloned (shallow), read worklog + r45/r46 reports: app interior already redesigned (filler removal, Facebook-blue identity, tools section); the AD element was still the original bare AdUnit.
- Audited all 6 placements (landing, features, blog list, blog post, guide, hidden ads-test page): no reserved height (CLS), no visible ad label, 5 different container wraps, no loading state, and unfilled units leave permanent dead bordered boxes (site ads currently unfilled — account under review).
- KEY LIVE DISCOVERY: an UNFILLED AdSense unit still contains a visible ~280px measurement iframe — "iframe exists" is NOT proof of a served ad; data-ad-status (filled/unfilled) is the only trustworthy signal. Documented in code.
- NEW src/components/ads/ad-slot.tsx: unified Facebook-theme card (rounded-2xl border bg-card) with tiny «إعلان» label row + Megaphone icon, reserved min-height (110/140px anti-CLS), pulsing skeleton, data-ad-status-driven state machine (loading/filled/empty) + 5s timeout for never-loaded script, 0fr/1fr grid-rows smooth collapse for unfilled units (aria-hidden, zero dead boxes), live MutationObserver with late-fill recovery (collapsed slot re-expands if an ad arrives later — never hides a served impression), adTest/showSlotId owner diagnostics, dark-mode via tokens (verified #242526/#B0B3B8).
- src/lib/ads.ts: added ADSENSE_SLOT_MIMO constant (magic "4214645931" was repeated in 6 files).
- Refactored all 6 placements to <AdSlot> (landing now aligned to the FAQ column max-w-3xl; features/blog-post/guide in-content mt-2; blog list mt-10; ads-test page uses adTest+showSlotId, kept its amber header). Deleted ad-unit.tsx (grep: zero remaining importers).
- ESLint fix during verify: react-hooks/set-state-in-effect → moved initial status sync into rAF.
- Verification: tsc 0 · eslint clean (8 files) · next build green (68/68). Real-browser on production build (caught EADDRINUSE serving a stale build mid-verify — killed old next-server, re-verified on the correct build): skeleton+label visible at load; unfilled → grid 0px + aria-hidden on landing/blog at 1280 & 390px (scrollWidth 390, no overflow); manual data-ad-status="filled" simulation on a collapsed slot → re-expanded 326px (late-fill path proven); dark-mode tokens match FB palette; ads-test page renders (localhost unfilled — Google serves only registered domains; prod will show test creative); zero page console errors. Screenshots download/r48/.
- Wrote تقرير-الجولة-48.md; committed and pushed to origin/main with the session token.

Stage Summary:
- Deliverable: the ad element is now a designed product surface — labeled, space-reserved (CLS-safe), skeleton-loaded, theme-aware, consistent across all six placements, and self-collapsing when unfilled (the current live state), with recovery when ads start serving.
- Key decisions: trust data-ad-status only (measurement-iframe trap); no new placements (density policy); no new env gating (scope); per-placement slot ids + EEA consent flagged to owner as follow-ups in the report.

---
Task ID: 25
Agent: main (Super Z)
Task: Round 50 — design feedback on every element not yet redesigned (second half of the r49 request: "redesign AdSense + feedback on the rest").

Work Log:
- Restored local runtime from scratch: .env (SQLite), prisma db push, seed-acceptance structure + r45-seed + new scripts/r50-seed.ts (OWNER account via real signup API + onboarding complete + assignments incl. one overdue, library refs, grades, personal schedule row, course material; fixed seed field mismatches against the real schema: Assignment/ LibraryReference/ StudentGrade/ PersonalScheduleItem/ CachedCourseMaterial/ AppUser scopeCohortGroupId FKs; moved seeded courses/schedule to year 2 so the OWNER's scoping shows them).
- Fresh production build + real browser session (390×844 + 1280×800, light + dark): 51 screenshots across the 12 public pages, login, all 6 onboarding steps (fresh STUDENT account through the real UI), 14 app screens, notifications sheet, courses empty state, desktop views — download/r50/.
- VLM design review in 12 structured batches against the r47/r48 design-language reference (skeletons, 52px targets, gradient headers, date blocks) — download/r50-vlm/; every critical claim re-verified in code (announcements raw ISO date confirmed at line 168; 32px icon buttons h-8 w-8 confirmed; assignments 20px toggle confirmed; native <select> in exam dialogs confirmed; schedule vertical day-list with full-height empty-day cards confirmed).
- Found + FIXED two objective bugs: (1) announcements rendered raw ISO "2026-09-07" while exams/assignments format ar-DZ → added the same formatDate helper; (2) [slug]/page.tsx exported static ads-test metadata so every 404 URL showed «اختبار الإعلانات | طالب» in the tab → converted to generateMetadata with per-slug title (404 now shows the site default title; /ads-test keeps its own).
- Wrote تقرير-الجولة-50.md: full per-element design feedback (public site 12 elements, login+onboarding, 12 app screens + notifications sheet, desktop experience, dark mode), systemic-pattern table (spinner vs skeleton, 32px vs 52px, muted text-xs dates vs visible date blocks, native select), and a P0-P3 priority matrix proposing r51 (8-screen calibration sweep), r52 (schedule day-tabs + pivot), r53 (public reading experience), r54 (admin panel), r55 (desktop sidebar/tables).
- Verified: tsc 0 · eslint clean on both changed files · next build green (68/68) · live browser shows «7 سبتمبر 2026» and correct 404 title.

Stage Summary:
- Deliverable: the design-feedback half of the r49 request is complete — a prioritized, evidence-backed review of every un-redesigned element (51 screenshots + 12 VLM batches + code-verified findings), plus the two objective bugs fixed in passing.
- Key decisions: review-only for design (redesign order is the owner's call — the report proposes r51-r55 sequence by users-affected × effort); fixes limited to bug-level changes (date formatting, metadata leak) that don't pre-decide any design direction.

---
Task ID: 26
Agent: main (Super Z)
Task: Round 56 — six owner requests from the shared-session feedback: (1) login screen should offer CREATE ACCOUNT first for first-time visitors (login was the auto-enabled default) and the serial-number note at the bottom must be deleted; (2) settings felt like pure حسابي duplicates — wants genuinely new settings; (3) the المساعد الذكي section design «doesn't suggest its existence»; (4) filing a report never notifies the reporter when it's resolved; (5)+(6) notifications outside the browser — enabled automatically, or permission asked in the fourth session.

Work Log:
- Restored context from the shared chat link (agent-browser over the SPA): identified repo bessghiermohamed/Gu-mo at r55, cloned, rebuilt env (bun install, prisma db push, r52-seed + r55-seed-cohort, dev server).
- Login screen (login-screen.tsx): first-visit detection via localStorage «talib-remembered-email» → default mode is now SIGNUP (create-account listed first, primary-styled) for brand-new devices; returning devices default to LOGIN. Smart one-tap cross-switching: failed login («لا يوجد حساب») surfaces «إنشاء حساب بهذه البيانات», registered-email signup surfaces «سجّل الدخول» — both keep the typed name/email. Serial-number note DELETED; replaced by the actionable switch hint.
- Report resolution (schema + api/issues + notifications.ts + notifications-sheet.tsx): StudentIssueReport gains reporterId (Prisma + download/supabase_report_reporter.sql, idempotent; legacy rows fall back to full_name match); PATCH now reads pre-update status and calls new notifyReportResolved → «تم حل تبليغك» / «أُعيد تبليغك للمراجعة», only on real status CHANGE; report_resolved type is never-muteable (own-action outcome), got CheckCheck icon + emerald color, and taps deep-link HOME.
- Web Push («إشعارات خارج المتصفح»): new public/sw.js (push + notificationclick: focus-or-open /app); src/lib/push.ts (VAPID web-push sender, public key baked-in + env-overridable, private key server-only, prunes 404/410 endpoints, silent no-op without key); /api/push/subscribe GET/POST/DELETE with push_subscriptions table (Prisma + download/supabase_push_subscriptions.sql, upsert on endpoint); src/lib/push-client.ts (register/subscribe, session counter, 4th-session pre-prompt decision, activatePushWithPrompt); createNotifications now fans every insert out as Web Push per user (fanOutPush).
- Client integration (app/app/page.tsx + push-permission-prompt.tsx): pushBoot once per authenticated visit AFTER onboarding — permission already granted → auto-subscribe silently (the owner's «تلقائياً»); else sessions are counted and from the 4th visit a designed slide-up pre-prompt appears («لا تفوّت نتيجة تبليغك…») with تفعيل/ليس الآن (dismissal remembered; settings toggle remains). VAPID keypair generated; private key written to .env.local (gitignored) and handed to the owner for Vercel (VAPID_PRIVATE_KEY) — same pattern as GROQ_API_KEY.
- Settings (settings-screen.tsx + font-scale.ts + layout.tsx): removed the حسابi duplicates (account card's academic grid + 3 shortcut buttons; المساعدة والدعم card); ADDED: حجم الواجهة والخط (root font 16/18/20px, persisted, applied on boot from the shell), نمط العرض فاتح/داكن/تلقائي (enableSystem=true in layout so «تلقائي» really follows the OS), الإشعارات خارج المتصفح status row with تفعيل, and بيانات جهازك (wipe AI chat history + assignment-completion cache with confirm dialog).
- المساعد الذكي discoverability: home-screen hero card (violet gradient + echo-bubble decor + «اسأل الآن» CTA + 3 quick chips) with a deep-link mechanism (sessionStorage talib-open-ai + window event) that opens the chat DIRECTLY, chips prefill the composer (talib-ai-prefill); tools-tab featured card redesigned with a mini chat-bubble conversation preview + «ابدأ محادثة» CTA; tools-tab also listens for the open-ai event so taps while already on أدواتي work.
- eslint.config.mjs: public/** added to ignores — vendored pdf.worker.min.mjs was polluting the error count since r31 (7 phantom errors).
- Verification (real browser, agent-browser): first-visit login defaults to حساب جديد + returning device defaults to دخول + both switch-hint directions work with preserved credentials; signup → onboarding flows; mandatory tour completed (7 stops); home AI card renders mobile+desktop, light+dark; chip «اشرح ببساطة» deep-links into the chat with the composer prefilled; settings shows the new sections and NOT the removed cards; font scale toggles 16↔18px and persists; تلقائي theme resolves via enableSystem; 4th-session prompt appears at count=4 (simulated) and closes on both buttons; wipe dialog renders; report → resolve → reporter receives «تم حل تبليغك» in the sheet (CheckCheck icon) and tap navigates HOME. Server pipeline: fake subscription POSTed → saved → web-push send on resolution → 404 prune (subs=0). Headless Chromium auto-denies Notification.permission so the OS-level toast couldn't be photographed — documented honestly. tsc 0 errors, eslint 0 errors (4 pre-existing warnings untouched), next build green 69/69 (new route /api/push/subscribe). Screenshots in download/r56/.
- Test data cleaned: throwaway account, test report, test notifications and push subscriptions wiped; r52 seed accounts kept.

Stage Summary:
- Deliverable: all six owner requests implemented and browser-verified — first-timers land on CREATE ACCOUNT (login is no longer the auto-enabled default; serial-number text deleted), settings gained four genuinely-new controls (font size, auto theme, push status, device-data wipe) while the حسابي duplicates were removed, المساعد الذكي now announces itself from the home screen with a one-tap deep link into a prefilled chat, report resolution notifies the reporter (always delivered, both resolve+reopen), and notifications work outside the browser: Web Push with auto-enable when permission is granted + a designed permission ask in the 4th session + manual control in settings.
- Key decisions: VAPID public key baked into the bundle (safe by design) with the private key as a one-time owner env action — everything degrades silently without it; reporter_id column nullable with full_name fallback so legacy reports still resolve; push fan-out per-user inside createNotifications so every existing emitter (join/content/reminder/report) gains outside-browser delivery for free.
- Owner actions (one-time, free): (1) set VAPID_PRIVATE_KEY in Vercel env — value delivered with the round report; (2) run download/supabase_push_subscriptions.sql and download/supabase_report_reporter.sql in the Supabase SQL editor (idempotent); redeploy. Without them the app still works identically minus real push + reporter resolution routing (falls back to name matching).

**Post-commit status (r56):** commit `b091120` is LOCAL ONLY — push failed (no
GitHub credentials in this session; same class of blocker as r45). NOT deployed
yet. Needs a fresh fine-grained/classic token with repo scope to push to
bessghiermohamed/Gu-mo main — Vercel deploys automatically on push.

---
Task ID: 27
Agent: main (Super Z)
Task: Round 57 — owner's 3 feedback items after reviewing r56 + «Check that changes have been uploaded» verification request.

Work Log:
- UPLOAD CHECK (the direct ask): git fetch + ls-remote proved origin/main = 5961052 — both r56 commits (b091120 + worklog 5961052) ARE on GitHub; the previous session's "push failed" blocker was resolved since (remote URL carries a working token; fetch/push verified this session). Prod chunk grep confirmed the LIVE build is r56 («محادثة دراسية بالعربية» banner string present in served JS; «الرقم التسلسلي» match is a false positive — it legitimately lives in profile/admin screens).
- r57 implementation found COMPLETE but UNCOMMITTED in the working tree (context ran out before commit last session): (1) course-detail description card renders only when description?.trim() (owner: «المقاييس التي لا وصف لها لا تحتاج بطاقة الوصف») + whitespace-pre-wrap; (2) home-screen violet AI banner removed entirely (owner: «أزل بانر المساعد الذكي من الواجهة»); (3) dead r56 bridge code removed from tools-tab (talib-open-ai listener) + ai-assistant-tool (talib-ai-prefill effect) — assistant remains reachable via its featured card in أدواتي; composer always opens empty.
- Restored env: shell DATABASE_URL=file:/home/z/my-project/db/custom.db persisted with the db file (in-sync, schema pushed); .env rewritten to match; prisma client regenerated (was stale from r56 schema).
- Quality gates: tsc 0 · eslint 0 on the 4 files · next build ✓ 69/69.
- Browser verification (agent-browser, 390×844): seeded via r52-seed.mjs + r55-seed-cohort.mjs (OWNER-COOKIE captured); completed the r55 mandatory 7-station tour; logged in as r52-student@test.dz — home shows NO المساعد الذكي text/section (light+dark); course البلاغة (description blanked for the test): no وصف المقياس card at all; course النحو والتطبيق: card renders with real description; tools → ابدأ محادثة opens AI chat with empty composer; sessionStorage clean of bridge keys. 7 screenshots in download/r57/.
- Committed r57 as 3ce8c22 (4 files, +21/−126) and PUSHED to GitHub: 5961052..3ce8c22 main -> main (exit 0).
- Deploy poll: prod still served r56 build during the first ~12 min of polling (banner string count=1 in served chunks); background poller left running (/tmp/r57-deploy-poll.log). r57 adds NO new env vars — Vercel needs nothing from the owner except possibly a Redeploy click if the auto-build stays queued.
- Wrote تقرير-الجولة-57.md (full Arabic report: the 3 fixes, quality table, upload/deploy status).

Stage Summary:
- Deliverable: upload status CONFIRMED — r56 fully on GitHub AND live in production; r57 (the 3 owner feedback fixes) implemented, verified, committed (3ce8c22) and pushed this session; Vercel auto-deploy pending at report time (no owner env actions needed for r57).
- Key decisions: banner removal kept the assistant reachable ONLY via the أدواتي featured card (single entry point, no duplication); description card hidden entirely for empty descriptions instead of showing a muted placeholder; dead bridge code deleted rather than left dormant.
- Artifacts: تقرير-الجولة-57.md, download/r57/ (7 screenshots), commit 3ce8c22 on origin/main.

---
Task ID: 27 (addendum)
Agent: main (Super Z)
Task: Deployment confirmation for r57.

Work Log:
- GitHub commit-status API (token from remote URL) on 3ce8c22: Vercel context, state success, "Deployment has completed", created 2026-09-08T18:20:46Z (~2 min after the 18:18:57Z push).
- Root-caused the misleading polls: HTML-referenced chunk names are shell-only and identical across builds; SPA screens live in runtime-loaded chunks (ff1a16fafef87110, b7785251e8fc532c, c4aee7da87df8ccc). Also the first marker string «محادثة دراسية بالعربية» was ambiguous (matches the surviving tools card, not just the removed banner).
- Decisive live check (gu-mo.vercel.app runtime chunks): banner-only string «قبل الامتحان» ABSENT, bridge key talib-ai-prefill ABSENT, tools card strings («ابدأ محادثة», «ويجيب أسئلتك») PRESENT → r57 is serving in production. Pre-push build was confirmed r56 via the r56-only «لا تفوّت نتيجة تبليغك» string.
- Production end-to-end probe: signed up r57probe-verify@test.dz through the real prod signup (fresh browser, «حساب جديد» default = r56 behavior intact), onboarding blocked at specialty step («لا توجد بيانات» — prod data state, not a code issue), probe account DELETED via /api/auth/delete (200). Report updated with the confirmed-deployment section.

---
Task ID: 28
Agent: main (Super Z)
Task: Round 58 — owner request: «Provides offline status when logging in without internet».

Work Log:
- Login screen (login-screen.tsx): new useOnlineStatus hook (navigator.onLine + online/offline events, SSR-safe init) drives an animated amber banner (pulsing dot + WifiOff + «أنت غير متصل بالإنترنت» + actionable hint) with role=status / aria-live=polite; submit guard returns the offline-specific toast instead of firing a doomed request; offline→online transition fires a «عاد الاتصال» toast (ref-guarded so it never fires on mount).
- Auth provider (auth-provider.tsx): signIn/signUp catches now classify — browser-known offline → t("auth.errorOffline"), otherwise the existing errorNetwork wording; signOut wrapped in try/catch so offline signout still lands the user on the login screen (previously threw an unhandled rejection and did nothing).
- i18n: 4 new keys (offlineTitle/offlineHint/errorOffline/backOnline) in BOTH ar.json and en.json.
- Quality gates: tsc 0 · eslint 0 on changed files · next build ✓ 69/69.
- Browser verification with REAL offline emulation (agent-browser set offline on): banner appears instantly with full text; offline submit → precise toast, button returns without spinner; back online → banner animates out + recovery toast; online login regression → #/home; offline signout from settings → login screen WITH banner. 5 screenshots in download/r58/ (light/dark/desktop/toast/offline-signout). Two disturbances during testing (dev-server crash under offline hot-reload; mandatory tour re-appearing after storage reset) were re-run cleanly and are not product issues.

Stage Summary:
- Deliverable: the login flow now communicates connection state — a persistent live offline banner on the login screen, a precise offline message on submit attempts (no dead spinner), error classification in the auth provider, a hardened offline signout path, and ar/en strings. No new env vars, no schema changes, no owner actions needed.
- Key decisions: banner uses warning-amber (data is safe, just waiting) not destructive-red; requests are NOT fired when the browser knows it's offline; onLine-but-dead-portal still goes through the fetch and keeps the generic network error; scope kept to the login flow (offline shell/PWA caching is a separate feature decision).

---
Task ID: 28 (addendum)
Agent: main (Super Z)
Task: r58 deployment confirmation.

Work Log:
- GitHub commit-status on 1412618: Vercel "Deployment has completed" (~90 s after push).
- Live verification (gu-mo.vercel.app served chunks): all three new r58 strings present — «أنت غير متصل بالإنترنت», «لا يمكن الدخول الآن», «عاد الاتصال بالإنترنت» → the r58 build is serving in production.

Stage Summary:
- r58 is LIVE: offline status banner, submit guard, error classification, and hardened offline signout are all in production. No owner actions required.

---
Task ID: 29
Agent: main (Super Z)
Task: Round 59 — owner feedback: «المساعد الذكي يحتاج تحسينًا — جرّب التحدث معه وطرح سؤال علمي».

Work Log:
- Live quality probe (scripts/r59-ai-probe.mjs, self-cleaning signup→chat→delete on gu-mo.vercel.app) asking 3 real scientific questions (physics w/ calculation, chemistry, biology). Diagnosis: the ANSWER CONTENT was good (Gemini gemini-3.5-flash via the r44 chain) but (a) answers systematically carry LaTeX — $F = m \times a$, $H^+$, $m/s^2$ — and the chat UI (ReactMarkdown+GFM only) has NO math renderer, so students saw raw dollar-sign code; (b) every answer ended with the same repeated «تذكر دائماً مراجعة مطبوعاتك…» footer (system-prompt phrasing side effect).
- Fix 1 — math rendering: added katex + remark-math + rehype-katex; MarkdownContent now runs [remarkGfm, remarkMath(singleDollar)] + [rehypeKatex(throwOnError:false, strict:"ignore", errorColor #c2410c)] and imports katex.min.css; new .ai-markdown CSS (globals.css) forces LTR direction + overflow-x scroll for display math, 1.08em sizing inside RTL bubbles. Safe against partial-stream frames.
- Fix 2 — system prompt (api/ai/route.ts): explicit instruction that the UI renders LaTeX (write $…$ inline / $$…$$ display, never in code fences) and a ban on repetitive closing paragraphs (the "review your course" habit).
- Gates: tsc 0 · eslint 0 · next build ✓ 69/69.
- Visual verification without local AI keys: agent-browser fetch monkey-patch (scripts/r59-fetch-patch.js) streams the REAL captured production physics answer as genuine SSE → math typeset correctly in light AND dark (VLM-verified screenshots download/r59/ai-chat-math-light.png / ai-chat-math-dark.png); no console errors.
- Deployment hiccup: push of 98a0e71 produced NO Vercel status at all for 20 min (integration never started a build; r58 commit shows success for comparison). An empty retrigger commit 16b7749 was pushed → «Deployment has completed» in ~75 s.
- Production verification: probe re-run — answers now use LaTeX systematically ($$F = m \times a$$ display, $H^+$, $2n$) with NO repeated footer; served JS chunk contains ai-markdown and two served CSS chunks contain katex; probe account deleted (200).

Stage Summary:
- Deliverable: scientific answers in المساعد الذكي now render as real typeset math (KaTeX, RTL-safe, stream-safe) instead of raw LaTeX code, and answers no longer end with the same repetitive reminder. No schema changes, no new env vars, no owner actions needed.
- Key decisions: render LaTeX properly rather than forcing plain-text math (fractions/units/subscripts benefit); keep singleDollar math since that's what the providers emit; errorColor orange (#c2410c) so a rare malformed fragment stays visible but non-destructive; deployment retrigger via empty commit when Vercel skips a push (status API with zero statuses = build never started).

---
Task ID: 30
Agent: main (Super Z)
Task: Round 60 — owner report: «Something I consider important is offline» — full production health audit.

Work Log:
- Site: every public page (/ , /about, /features, /faq, /guide, /privacy, /terms, /contact, /blog, /app) returns 200; no 5xx anywhere; 401s only on auth-gated APIs (expected).
- Auth pipeline on prod: signup → session → delete all verified via throwaway accounts (200s).
- المساعد الذكي backend: r59 probe re-run (3 scientific questions) + 1 non-stream probe — ALL answered by gemini-3.5-flash with the r59 prompt (LaTeX present, repetitive footer gone).
- r59 client assets on prod: ai-markdown present in served JS chunk; katex in 2 served CSS chunks; KaTeX woff2/woff fonts resolve 200.
- End-to-end UI reproduction (the decisive test): served the PRODUCTION build locally, logged in on the seeded local DB, and proxied /api/ai to the REAL production backend with a REAL prod session (scripts/r60-ai-proxy.js, CORS-safe local relay). Real streamed answer about سرعة الضوء rendered in the production-build chat with typeset KaTeX (E=mc²), zero console/page errors, no error bubble. (An initial «تعذّر الاتصال» bubble during this test was proven to be a CORS artifact of the cross-origin test rig — the proxy eliminated it and the same question then answered fine.)
- Login screen on the real prod origin: renders correctly with NO false offline banner (r58 hook verified sound: init true + syncs with navigator.onLine on mount).
- Telegram/announcements/notifications/schedule/courses endpoints healthy; reminders are client-poll by design (no cron needed); sw.js does no asset caching (no stale-build risk); probe account deleted (200) and all session artifacts removed.

Stage Summary:
- Result: NOTHING is detectably offline — site, auth, AI backend, r59 math UI (real end-to-end), fonts, Telegram/notifications endpoints all verified live from this environment. The report must refer to something specific to the owner's device/network/account/session or an intermittent provider failure (e.g., Gemini free-tier 429 at his usage hours — the chain currently has only Gemini effectively serving, so a project-wide quota error exhausts it).
- Owner reply needed: exact symptom (which screen, which message/screenshot) before any further fix; candidate hardening if it turns out to be assistant flakiness: one automatic in-chain retry with backoff on rate/server errors + a single silent UI retry on network-kind failures.
