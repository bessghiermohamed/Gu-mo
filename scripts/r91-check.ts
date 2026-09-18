/**
 * r91 — إزالة «استوديو المولّدات» (bun, no Next.js, no network).
 *
 * The owner asked: Delete Generator Studio (r89's web generation card).
 * This round is a REMOVAL, so the checks are structural + regression:
 *
 *   A) Structural removal — no live reference to the web studio anywhere
 *      in src/ (lib/ai/studio, /api/ai/studio, studio-tool, استوديو
 *      المولّدات, STUDIO_ exports, chatWithProvider). Documented-history
 *      comments (r91 notes) are whitelisted explicitly.
 *   B) What must remain — the six bot generators (r85/r86: html-studio +
 *      study-tools + bot wiring) and دفتر طالب (r87) untouched; providers
 *      chain intact without the dead chatWithProvider (callAttempt kept).
 *   C) tools-tab contract — 9 grid tools, no "studio" id, no Wand2, no
 *      matchesStudio; notebook featured card + search still wired.
 *   D) API surface — /api/ai/notebook alive, /api/ai/studio absent.
 *   E) r90 ads gate untouched (cross-round insurance): ads.txt literal,
 *      AdsenseGate in layout, isAdsAllowedHost in lib/ads.
 *
 * Run from the repo root:  bun scripts/r91-check.ts
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
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
const SRC = join(ROOT, "src");
function read(p: string): string {
  return readFileSync(join(ROOT, p), "utf8");
}

// ---------------------------------------------------------------------------
// A) Structural removal — walk every file under src/ and forbid live refs
// ---------------------------------------------------------------------------

section("A) إزالة بنيوية — لا أي إشارة حية لاستوديو المولّدات في src/");

/** Comments that legitimately mention the studio as HISTORY (r91 note)
 *  — matched as substrings; anything outside this whitelist fails. */
const HISTORY_ALLOW = [
  // tools-tab header: documents the removal itself
  "Round 91 (owner: «Delete Generator Studio»): استوديو المولّدات (r89)\n * is REMOVED entirely — component, /api/ai/studio route, lib/ai/studio\n * module, featured card, search entry, and the now-unused\n * chatWithProvider helper in providers. The six bot generators (r85/\n * r86) and دفتر طالب (r87) are untouched and remain the online study\n * surface. History: r89 preserved in git (c0d51b0).",
];

/** Live-reference tokens that must not appear anywhere in src/.
 *  NOTE: html-studio (r85 bot HTML studio) is a DIFFERENT feature — the
 *  tokens below cannot match its import path «lib/ai/html-studio». */
const FORBIDDEN = [
  "lib/ai/studio\"",
  "from \"../lib/ai/studio\"",
  "api/ai/studio",
  "studio-tool",
  "استوديو المولّدات",
  "STUDIO_",
  "chatWithProvider",
  "matchesStudio",
  'key="studio"',
  "setActiveTool(\"studio\")",
  '"studio"',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const srcFiles = walk(SRC).filter((f) => /\.(ts|tsx|css)$/.test(f));
let structuralBad = 0;
for (const file of srcFiles) {
  const text = readFileSync(file, "utf8");
  const rel = file.slice(ROOT.length + 1);
  // strip whitelisted history snippets first, then look for live refs
  let scrubbed = text;
  for (const allow of HISTORY_ALLOW) scrubbed = scrubbed.split(allow).join("");
  for (const token of FORBIDDEN) {
    if (scrubbed.includes(token)) {
      structuralBad++;
      console.error(`  ✗ live reference «${token}» in ${rel}`);
    }
  }
}
check(`scanned ${srcFiles.length} files under src/`, srcFiles.length > 50);
check("no live studio references remain", structuralBad === 0, `${structuralBad} found`);

section("A+) الملفات المحذوفة غائبة فعلاً");
for (const p of [
  "src/lib/ai/studio.ts",
  "src/app/api/ai/studio/route.ts",
  "src/components/talib/tools/studio-tool.tsx",
  "scripts/r89-check.ts",
  "تقرير-الجولة-89.md",
]) {
  check(`غائب: ${p}`, !existsSync(join(ROOT, p)));
}

// ---------------------------------------------------------------------------
// B) ما يجب أن يبقى — أدوات البوت والدفتر وسلسلة المزوّدين
// ---------------------------------------------------------------------------

section("B) الباقي سليم — بوت r85/r86 ودفتر r87 وproviders");

const botModules = [
  ["src/lib/ai/html-studio.ts", "runHtmlStudio"],
  ["src/lib/ai/study-tools.ts", "runDiagramStudio"],
  ["src/lib/ai/study-tools.ts", "runTranslateStudio"],
  ["src/lib/ai/study-tools.ts", "runAnalyzeStudio"],
  ["src/lib/ai/study-tools.ts", "runDetectStudio"],
  ["src/lib/ai/study-tools.ts", "runReviewStudio"],
];
for (const [p, fn] of botModules) {
  const t = read(p);
  check(`${fn} حي في ${p.replace("src/lib/ai/", "")}`, t.includes(`export async function ${fn}`) || t.includes(`export function ${fn}`) || t.includes(fn));
}
const botChat = read("src/lib/telegram/bot-chat.ts");
check("البوت موصول بأدوات r85/r86", botChat.includes("html-studio") && botChat.includes("study-tools"));
check("البوت لا يعرف الاستوديو المحذوف", !botChat.includes("api/ai/studio") && !botChat.includes("استوديو المولّدات"));

const notebook = read("src/lib/ai/notebook.ts");
check("دفتر طالب: الوحدة النقية باقية", notebook.length > 1000);
check(
  "دفتر طالب: المسار الحي باقٍ",
  existsSync(join(ROOT, "src/app/api/ai/notebook/route.ts")) && existsSync(join(ROOT, "src/components/talib/tools/notebook-tool.tsx"))
);

const providers = read("src/lib/ai/providers.ts");
check("providers: chatComplete باقية", providers.includes("export async function chatComplete"));
check("providers: callAttempt المشتركة باقية (تستعملها chatComplete)", providers.includes("callAttempt") && !providers.includes("chatWithProvider"));
check("providers: سلسلة المزوّدين كما هي", providers.includes("buildAttempts"));

// ---------------------------------------------------------------------------
// C) عقد tools-tab — ٩ أدوات شبكية وبطاقة دفتر وحيدة وبحث مطبّع
// ---------------------------------------------------------------------------

section("C) tools-tab — «أدواتي» بعد الحذف");
const tab = read("src/components/talib/tools/tools-tab.tsx");
check("لا هوية studio في ToolId", !tab.includes("| \"studio\""));
check("لا استيراد StudioTool", !tab.includes("studio-tool"));
check("لا أيقونة Wand2", !tab.includes("Wand2"));
check("لا matchesStudio في البحث", !tab.includes("matchesStudio"));
check("noResults مطبّع على الدفتر والشبكة", tab.includes("const noResults = !matchesNotebook && gridTools.length === 0;"));
check("توجيه الدفتر باقٍ", tab.includes("activeTool === \"notebook\"") && tab.includes("<NotebookTool"));
check("تسع أدوات شبكية", (tab.match(/id: "/g) ?? []).length === 9, `${(tab.match(/id: "/g) ?? []).length}`);
check("البطاقة المميزة واحدة + قالب الشبكة (فتحا <motion.button فقط)", (tab.match(/<motion\.button/g) ?? []).length === 2, `${(tab.match(/<motion\.button/g) ?? []).length}`);
check("البطاقة المميزة هي الدفتر", tab.includes('key="notebook"') && !tab.includes('key="studio"'));

// ---------------------------------------------------------------------------
// D) سطح الـ API — الدفتر حي والاستوديو غائب
// ---------------------------------------------------------------------------

section("D) سطح API");
check("api/ai/notebook مسجّل", existsSync(join(ROOT, "src/app/api/ai/notebook/route.ts")));
check("api/ai/studio غائب", !existsSync(join(ROOT, "src/app/api/ai/studio")));

// ---------------------------------------------------------------------------
// E) بوابة r90 الإعلانية لم تُمسّ (تأمين عابر للجولات)
// ---------------------------------------------------------------------------

section("E) بوابة r90 الإعلانية كما هي");
check(
  "ads.txt حرفياً",
  read("public/ads.txt").trim() === "google.com, pub-8081529487869617, DIRECT, f08c47fec0942fa0"
);
const layout = read("src/app/layout.tsx");
check("layout: AdsenseGate ولا pagead2", layout.includes("<AdsenseGate />") && !layout.includes("pagead2"));
const ads = read("src/lib/ads.ts");
check("lib/ads: البوابة باقية", ads.includes("isAdsAllowedHost") && ads.includes("ADS_PRIMARY_HOST"));
check(
  "scripts/r90-check.ts باقٍ",
  existsSync(join(ROOT, "scripts/r90-check.ts"))
);

console.log(`\n=== r91: ${pass}/${pass + fail} ===`);
if (fail > 0) process.exit(1);
