/**
 * r88 — إزالة «المساعد الذكي» (bun, no Next.js, no network).
 *
 * The owner asked: remove the Smart Assistant chatbot, keep دفتر طالب.
 * This round is a REMOVAL, so the checks are structural + regression:
 *
 *   A) Structural removal — no live reference to the assistant anywhere
 *      in src/ (component, route, card, search entry, settings copy,
 *      bot fallback copy). Documented-history comments (r88 notes) are
 *      whitelisted explicitly.
 *   B) دفتر طالب kept intact — component, API route, lib module and its
 *      key exports all present and importable.
 *   C) Shared infra still wired — providers chain untouched, knowledge.ts
 *      still imported by the Telegram brain only, KaTeX CSS still served
 *      to the notebook via .ai-markdown.
 *   D) tools-tab contract — 9 grid tools, no "ai" id, notebook routing
 *      + search matching intact.
 *   E) Settings wipe contract — notebook keys + orphaned assistant keys
 *      + assignments memory are all wiped.
 *
 * Run from the repo root:  bun scripts/r88-check.ts
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

section("A) إزالة بنيوية — لا أي إشارة حية للمساعد الذكي في src/");

/** Comments that legitimately mention the assistant as HISTORY (r88 notes)
 *  — matched as substrings; anything outside this whitelist fails. */
const HISTORY_ALLOW = [
  // tools-tab header: documents the removal itself
  "Round 88 (owner: «احذف المساعد الذكي وأبقِ دفتر طالب»): the Smart",
  "Round 43: 7 → 10",
  "privacy contract) plus المساعد الذكي: the first ONLINE tool.",
  // settings: wipe note + dialog (orphaned legacy data) + intentional wipe code
  "r88: the assistant is gone — its orphaned talib-ai-chat-v1-* keys\n        // are still wiped",
  "key.startsWith(\"talib-ai-chat-v1-\")",
  "أثر\n                محادثات المساعد القديمة إن وُجد",
  "أثر\n          محادثات المساعد القديمة (r88 أزال المساعد)",
  // notebook header: convention provenance
  "needsConfig بعُرف r44 (المساعد سابقاً ثم الدفتر بعد r88)",
  // home-screen comment
  "round 88 removed\n          the assistant itself (owner: «احذف المساعد الذكي»)",
  // bot-chat history comments
  "كانت تُستعمل هنا وفي «المساعد الذكي» /api/ai\n// معاً حتى أزال r88 المساعد فبقيت للبوت",
  "(r81 — كانت نفس مفاجأة «المساعد الذكي» r80)",
  // knowledge.ts history
  "the in-app assistant did until r88 removed it",
  // globals.css provenance
  "(دفتر طالب since r88)",
];

const FORBIDDEN = [
  "AiAssistantTool",
  "ai-assistant-tool",
  "talib-ai-chat-v1-", // only allowed inside settings wipe + its comment
  "المساعد الذكي",
  'fetch("/api/ai"', // exact route call (notebook uses /api/ai/notebook — not matched)
  "matchesAI",
  "setActiveTool(\"ai\")",
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
check("no live assistant references remain", structuralBad === 0, `${structuralBad} found`);

const removedFiles = [
  "src/components/talib/tools/ai-assistant-tool.tsx",
  "src/app/api/ai/route.ts",
];
for (const f of removedFiles) {
  check(`deleted ${f}`, !existsSync(join(ROOT, f)));
}
check("kept /api/ai/notebook route", existsSync(join(ROOT, "src/app/api/ai/notebook/route.ts")));

// ---------------------------------------------------------------------------
// B) دفتر طالب kept intact
// ---------------------------------------------------------------------------

section("B) دفتر طالب محفوظ بتمامه");

check("notebook component exists", existsSync(join(ROOT, "src/components/talib/tools/notebook-tool.tsx")));
check("notebook lib exists", existsSync(join(ROOT, "src/lib/ai/notebook.ts")));

const notebookLib = read("src/lib/ai/notebook.ts");
for (const fn of [
  "normalizeArabicText",
  "chunkContent",
  "retrieveExcerpts",
  "buildStudyCorpus",
  "corpusBlock",
  "buildChatSystem",
]) {
  check(`notebook lib exports ${fn}`, notebookLib.includes(`export function ${fn}`) || notebookLib.includes(`export const ${fn}`));
}

const notebookRoute = read("src/app/api/ai/notebook/route.ts");
check("notebook route serves chat + artifacts", notebookRoute.includes("chat") && notebookRoute.includes("artifact") || notebookRoute.includes("action"));
check("notebook route keeps needsConfig convention", notebookRoute.includes("needsConfig"));

const notebookTool = read("src/components/talib/tools/notebook-tool.tsx");
check("notebook UI hits its own API", notebookTool.includes('fetch("/api/ai/notebook"'));
check("notebook UI keeps localStorage per-user storage", notebookTool.includes('talib-notebook-v1-'));
check("notebook UI renders KaTeX via .ai-markdown", notebookTool.includes("ai-markdown"));

// ---------------------------------------------------------------------------
// C) Shared infra still wired
// ---------------------------------------------------------------------------

section("C) البنية المشتركة سليمة");

const botChat = read("src/lib/telegram/bot-chat.ts");
check("Telegram brain still imports freshnessBlock", botChat.includes('from "@/lib/ai/knowledge"'));
check("Telegram brain keeps its fallback text (assistant-free wording)", botChat.includes("خدمة الذكاء الاصطناعي غير متاحة حالياً") && !AI_FALLBACK_MENTIONS_ASSISTANT(botChat));
check("providers chain untouched", existsSync(join(ROOT, "src/lib/ai/providers.ts")));
check("html-studio (r85) untouched", existsSync(join(ROOT, "src/lib/ai/html-studio.ts")));
check("study-tools (r86) untouched", existsSync(join(ROOT, "src/lib/ai/study-tools.ts")));
check("knowledge.ts untouched as a module", existsSync(join(ROOT, "src/lib/ai/knowledge.ts")));

function AI_FALLBACK_MENTIONS_ASSISTANT(text: string): boolean {
  const m = text.match(/AI_FALLBACK_TEXT\s*=\s*"([^"]+)"/);
  return m ? m[1].includes("المساعد الذكي") : false;
}

// ---------------------------------------------------------------------------
// D) tools-tab contract
// ---------------------------------------------------------------------------

section("D) عقد أدواتي — ٩ أدوات شبكية + بطاقة الدفتر المميزة فقط");

const toolsTab = read("src/components/talib/tools/tools-tab.tsx");
const toolIds = [...toolsTab.matchAll(/id: "(gpa|images|compress|merge|extract|counter|timer|compress-img|ocr|notebook|ai)"/g)].map((m) => m[1]);
check("exactly 9 grid tools registered", toolIds.filter((id) => id !== "notebook").length === 9, `got ${toolIds.length}`);
check("no «ai» tool id anywhere", !toolIds.includes("ai"));
check("notebook featured card still routes", toolsTab.includes('setActiveTool("notebook")'));
check("notebook search matching intact", toolsTab.includes("دفتر طالب مصادر ملخص صوتي"));
check("assistant render branch gone", !toolsTab.includes("activeTool === \"ai\""));
check("no unused icon imports (Sparkles/MessageCircle)", !toolsTab.includes("Sparkles") && !toolsTab.includes("MessageCircle"));

// ---------------------------------------------------------------------------
// E) Settings wipe contract
// ---------------------------------------------------------------------------

section("E) عقد مسح بيانات الجهاز في الإعدادات");

const settings = read("src/components/talib/screens/settings-screen.tsx");
check("wipes notebook data", settings.includes('key.startsWith("talib-notebook-v1-")'));
check("still wipes orphaned assistant chats", settings.includes('key.startsWith("talib-ai-chat-v1-")'));
check("still wipes assignments memory", settings.includes('"talib-assignments-completed"'));
check("card copy mentions the notebook, not the assistant", settings.includes("دفتر طالب (مصادرك وحديثه ومخرجاته)"));

// ---------------------------------------------------------------------------

console.log(`\n===== r88: ${pass} passed, ${fail} failed =====`);
if (fail > 0) process.exit(1);
