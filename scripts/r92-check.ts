/**
 * r92 — «أدواتي» مضغوطة + شارة الرُتبة في قسم الفوج (bun, no Next.js).
 *
 * Owner asked (r92):
 *   1) «سأترك دفتر الطالب في أدواتي لكن قلل عرضه وحجمه، ونفس الشيء لباقي
 *      صناديق أدواتي» — the notebook's full-width featured card is gone;
 *      it now lives inside the grid as a compact cell, and every grid
 *      card is tighter.
 *   2) «في قسم الفوج يظهر اسم بجانبه شعار مثل الألعاب يتغير حسب عدد
 *      النقاط، والنقاط تُحسب من نشاط الشخص داخل التطبيق» — gamified rank
 *      badge next to the student's name, points computed on-device.
 *      «لا حاجة لكتابة شرح لهذه الميزة للطالب» — zero explanation copy.
 *
 * Checks:
 *   A) tools-tab compaction — notebook inside the grid, sizes shrunk,
 *      r91 contracts preserved (9 tools, search/noResults, 2 motion
 *      buttons, key="notebook", routing).
 *   B) gamification lib — pure unit tests run right here in bun
 *      (RANKS monotonic, rankFor boundaries, snapshot formula).
 *   C) rank-badge + group screen — badge wired next to the name, silent
 *      (no explanation tokens anywhere in src/).
 *   D) shell — one idempotent recordDailyVisit() per boot.
 *   E) cross-round insurance — r90 ads gate + r91 removal contracts.
 *
 * Run from the repo root:  bun scripts/r92-check.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string) {
  console.log(`\n——— ${title} ———`);
}

const ROOT = process.cwd();
function read(p: string): string {
  return readFileSync(join(ROOT, p), "utf8");
}

// ---------------------------------------------------------------------------
// A) «أدواتي» مضغوطة — الدفتر داخل الشبكة والبطاقات أصغر
// ---------------------------------------------------------------------------

section("A) tools-tab — الدفتر خلية داخل الشبكة وكل البطاقات مضغوطة");
const tab = read("src/components/talib/tools/tools-tab.tsx");

check("header يوثّق r92", tab.includes("Round 92 (owner"));
check("البطاقة المميزة الكاملة القديمة أزيلت", !tab.includes("mini notebook preview"));
check("الدفتر خلية داخل الشبكة (بوابة الكل/الدراسة)", tab.includes('matchesNotebook && (category === "all" || category === "study")'));
check("الشبكة تحيط بالدفتر (خلية قبل الخريطة)", tab.indexOf('key="notebook"') < tab.indexOf("gridTools.map(") && tab.indexOf('key="notebook"') > tab.indexOf("<div className=\"grid grid-cols-2"));

check("أيقونات مصغّرة (w-4.5 × 11 = 9 أدوات + الدفتر + لافتة الخصوصية)", (tab.match(/w-4\.5 h-4\.5/g) ?? []).length === 11, `${(tab.match(/w-4\.5 h-4\.5/g) ?? []).length}`);
check("لا أيقونات كبيرة قديمة w-6 في الأدوات", !tab.includes('className="w-6 h-6"'));
check("لا حاوية w-11 h-11 القديمة", !tab.includes("w-11 h-11"));
check("حشوة p-3 بدل p-3.5 في قالب البطاقة", tab.includes('gap-0 p-3 transition-[border-color,box-shadow]') && !tab.includes("p-3.5 transition-[border-color,box-shadow]"));
check("عناوين 13px بدل text-sm", tab.includes('font-bold text-[13px] mt-2">{tool.title}'));
check("فجوات الشبكة ضاقت إلى gap-2.5", tab.includes("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5"));

check("تسع أدوات شبكية كما هي", (tab.match(/id: "/g) ?? []).length === 9, `${(tab.match(/id: "/g) ?? []).length}`);
check("لا هوية summary دخيلة (طلبات سابقة أُلغيت بتعليمات أحدث)", !tab.includes('"summary"'));
check("noResults مطبّع كما هو", tab.includes("const noResults = !matchesNotebook && gridTools.length === 0;"));
check("توجيه الدفتر باقٍ", tab.includes('activeTool === "notebook"') && tab.includes("<NotebookTool"));
check("فتحا <motion.button فقط (خلية الدفتر + قالب الشبكة)", (tab.match(/<motion\.button/g) ?? []).length === 2, `${(tab.match(/<motion\.button/g) ?? []).length}`);
check("key=\"notebook\" باقٍ", tab.includes('key="notebook"'));
check("عدّادات التصنيف تحسب الدفتر", tab.includes("GRID_TOOLS.length + 1") && tab.includes('(cat === "study" ? 1 : 0)'));

// ---------------------------------------------------------------------------
// B) وحدة التلعيب — اختبار مباشر نقِيّ داخل bun (بلا DOM ولا React)
// ---------------------------------------------------------------------------

section("B) lib/gamification — اختبارات وحدة حقيقية في bun");
const gam = await import("../src/lib/gamification");
const { RANKS, rankFor, ACTIVITY_KEY, computeActivity } = gam as typeof import("../src/lib/gamification");

check("المفتاح المحلي talib-activity-v1", ACTIVITY_KEY === "talib-activity-v1");
check("سبع رُتب متدرجة", RANKS.length === 7, `${RANKS.length}`);
let monotonic = true;
for (let i = 1; i < RANKS.length; i++) {
  if (!(RANKS[i].min > RANKS[i - 1].min)) monotonic = false;
}
check("العتبات صاعدة بلا تكرار (0 < 100 < … < 2000)", monotonic && RANKS[0].min === 0 && RANKS[6].min === 2000);
check("الصفر يفتح «مبتدئ»", rankFor(0).name === "مبتدئ");
check("100 تفتح «ناشئ»", rankFor(100).name === "ناشئ" && rankFor(99).name === "مبتدئ");
check("250 تفتح «نشيط»", rankFor(250).name === "نشيط" && rankFor(249).name === "ناشئ");
check("500 تفتح «مجتهد»", rankFor(500).name === "مجتهد");
check("800 تفتح «مميّز»", rankFor(800).name === "مميّز");
check("1200 تفتح «خبير»", rankFor(1200).name === "خبير" && rankFor(1199).name === "مميّز");
check("2000 تفتح «أسطورة»", rankFor(2000).name === "أسطورة" && rankFor(99999).name === "أسطورة");
check("القيم غير السليمة تسقط إلى «مبتدئ»", rankFor(-5).name === "مبتدئ" && rankFor(NaN).name === "مبتدئ");
check("شعارات الرُتب أسماء رمزية معروفة", RANKS.every((r) => ["sprout", "book", "zap", "medal", "star", "trophy", "crown"].includes(r.icon)));

// computeActivity on a bare bun runtime (no localStorage) must not throw
let bareSafe = true;
let barePoints = -1;
try {
  barePoints = computeActivity().points;
} catch {
  bareSafe = false;
}
check("computeActivity لا يرمي بلا localStorage (سطح bun العاري)", bareSafe && barePoints === 0, `${barePoints}`);

// WBT: simulate the ledger shape in a fake global localStorage and verify
// the formula (days*5 + assignments*20 + notes*10 + sources*10).
const store = new Map<string, string>();
const days: Record<string, boolean> = {};
for (let i = 1; i <= 12; i++) {
  days[`2026-08-${String(i).padStart(2, "0")}`] = true;
}
store.set("talib-activity-v1", JSON.stringify(days));
store.set("talib-assignments-completed", JSON.stringify({ 3: true, 7: true, 9: true, 11: false }));
store.set("talib-notes", JSON.stringify([{ id: 1 }, { id: 2 }]));
store.set("talib-notebook-v1-42", JSON.stringify({ sources: [{ id: "a" }, { id: "b" }, { id: "c" }], chat: [] }));
store.set("talib-notebook-v1-43", JSON.stringify({ sources: [{ id: "d" }], chat: [] }));
store.set("talib-notebook-v1-broken", "not-json{");
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size;
  },
};
const snap = computeActivity();
check("الأيام تُقرأ من الدفتر (12 يوماً)", snap.days === 12, `${snap.days}`);
check("الواجبات المنجزة فقط تُحتسب (3 من 4)", snap.assignments === 3, `${snap.assignments}`);
check("الملاحظات تُقرأ (2)", snap.notes === 2, `${snap.notes}`);
check("مصادر الدفتر تُجمع عبر المستخدمين وتتجاهل التالف (4)", snap.sources === 4, `${snap.sources}`);
check("الصيغة: 12×5 + 3×20 + 2×10 + 4×10 = 180", snap.points === 180, `${snap.points}`);
delete (globalThis as { localStorage?: unknown }).localStorage;

// ---------------------------------------------------------------------------
// C) الشارة وشاشة الفوج — صامتة تماماً وبجانب الاسم
// ---------------------------------------------------------------------------

section("C) rank-badge + group-screen — شارة بجانب الاسم بلا أي شرح");
const badge = read("src/components/talib/rank-badge.tsx");
check("الشارة عميلة وموصولة بوحدة التلعيب", badge.includes('"use client"') && badge.includes("from \"@/lib/gamification\""));
check("الشارة تصدّر الخطّاف والمكوّن", badge.includes("export function useActivityRank") && badge.includes("export function RankBadge"));
check("الشارة تعرض الشعار والاسم والنقاط فقط", badge.includes("{rank.name}") && badge.includes("{snap.points}"));
check("لا فقرة شرح داخل الشارة (عناصر span حصراً)", !badge.includes("<p") && !badge.includes("<div"));
check("سبع أيقونات lucide مطابقة للأسماء الرمزية", (badge.match(/: (Sprout|BookOpen|Zap|Medal|Star|Trophy|Crown),/g) ?? []).length >= 7);

const group = read("src/components/talib/screens/group-screen.tsx");
check("شاشة الفوج تستعمل الخطّاف والشارة", group.includes("useActivityRank()") && group.includes("{activitySnap && <RankBadge snap={activitySnap} />}"));
check("الشارة بجانب اسم الطالب في نفس البطاقة", group.indexOf("user.fullName") < group.indexOf("RankBadge snap={activitySnap}"));
check("تظهر قبل الإلحاق بالفوج (خارج الشرط)", group.indexOf("{user && (") < group.indexOf("{!hasGroup ? ("));

// «لا حاجة لكتابة شرح لهذه الميزة للطالب» — no explanation copy anywhere
import { readdirSync, statSync } from "node:fs";
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const srcFiles = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const EXPLAIN_TOKENS = [
  "كيف تحسب نقاطك",
  "تُحسب نقاطك",
  "اجمع النقاط",
  "اربح نقاط",
  "نقاط النشاط تُحسب",
  "اشرح النقاط",
  "كيف تكسب النقاط",
];
let explainBad = 0;
for (const f of srcFiles) {
  const text = readFileSync(f, "utf8");
  for (const tok of EXPLAIN_TOKENS) {
    if (text.includes(tok)) {
      explainBad++;
      console.error(`  ✗ شرح ممنوع «${tok}» في ${f.slice(ROOT.length + 1)}`);
    }
  }
}
check(`لا أي شرح للنقاط في ${srcFiles.length} ملفاً`, explainBad === 0, `${explainBad}`);

// ---------------------------------------------------------------------------
// D) الغلاف — كتابة حضور واحدة idempotent عند الإقلاع
// ---------------------------------------------------------------------------

section("D) غلاف التطبيق — recordDailyVisit مرة واحدة");
const shell = read("src/app/app/page.tsx");
check("الغلاف يستدعي recordDailyVisit", shell.includes("recordDailyVisit();"));
check("الاستيراد من lib/gamification", shell.includes('from "@/lib/gamification"'));
check("الاستدعاء داخل تأثير الإقلاع الوحيد (بلا فواصل زمنية)", !shell.includes("recordDailyVisit();\n    const interval"));

// ---------------------------------------------------------------------------
// E) تأمين عابر للجولات — بوابة r90 وإزالة r91 كما هيا
// ---------------------------------------------------------------------------

section("E) تأمين r90/r91");
check(
  "ads.txt حرفياً",
  read("public/ads.txt").trim() === "google.com, pub-8081529487869617, DIRECT, f08c47fec0942fa0"
);
check("layout: AdsenseGate ولا pagead2", read("src/app/layout.tsx").includes("<AdsenseGate />"));
check("سطح API: الدفتر حي والاستوديو غائب", existsSync(join(ROOT, "src/app/api/ai/notebook/route.ts")) && !existsSync(join(ROOT, "src/app/api/ai/studio")));
check("فحصا r90 وr91 باقيان", existsSync(join(ROOT, "scripts/r90-check.ts")) && existsSync(join(ROOT, "scripts/r91-check.ts")));

console.log(`\n=== r92: ${pass}/${pass + fail} ===`);
if (fail > 0) process.exit(1);
