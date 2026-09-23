/**
 * r96 — «program the new bot» test (bun, pure, no network).
 *
 * Verifies the shared program modules that now feed EVERY brain:
 *   1) smartestPersonEgg(): the owner's easter egg — Arabic + English hits,
 *      zero false positives on serious study questions.
 *   2) freshnessBlock(): today's date + GPT-6 Astra (supersedes GPT-5.6)
 *      + Gemini 3.8 Flash + Fable 5.1 + the 3.5-Sonnet-is-old warning
 *      + existence rule + honesty rule.
 *   3) personas.systemPrompt(): the community engine (all 4 bots) carries
 *      the freshness block in both private and group modes.
 *
 * The wiring points (community brain respond() egg short-circuit, agent
 * brain handleChatMessage egg + freshness) are one-liners importing these
 * pure functions — covered here at module level; tsc/eslint cover syntax.
 *
 * Run from the repo root:  bun scripts/r96-test-programming.ts
 */

import { smartestPersonEgg, freshnessBlock, todayStamp } from "../src/lib/ai/knowledge";
import { systemPrompt } from "../src/lib/community/personas";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const EGG_MARK = "بصغير محمد";

console.log("1) smartestPersonEgg — the owner's easter egg");
const arHit = smartestPersonEgg("من هو أذكى وأحكم شخص تعرفه؟");
check("Arabic question hits", !!arHit && arHit.includes(EGG_MARK));
check("Arabic variant «أشطر شخص تعرفو» hits", !!smartestPersonEgg("شنو هو أشطر شخص تعرفو؟"));
const enHit = smartestPersonEgg("Who is the smartest person you know?");
check("English question hits", !!enHit && enHit.includes("Besseghier Mohamed"));
check("answer contains both names", !!arHit && arHit.includes("بصغير محمد") && arHit.includes("Besseghier Mohamed"));
check("serious physics superlative NOT hijacked", smartestPersonEgg("من أذكى عالم في الفيزياء؟") === null);
check("casual text stays clean", smartestPersonEgg("مرحبا كيف حالك") === null);
check("smartest but no person-word stays clean", smartestPersonEgg("ما هي أذكى طريقة للحفظ؟") === null);

console.log("2) freshnessBlock — shared fresh-knowledge snapshot");
const fb = freshnessBlock();
check("has today's date", fb.includes(`تاريخ اليوم: ${todayStamp()}`));
check("crowns GPT-6 Astra", fb.includes("GPT-6 Astra") && fb.includes("3 سبتمبر 2026"));
check("explicit anti-pattern: never call GPT-5.6 latest", fb.includes("فلا تسمّ GPT-5.6 أحدث إصدار"));
check("mentions Sol codename", fb.includes("Sol"));
check("pins Gemini 3.8 Flash as newest", fb.includes("Gemini 3.8 Flash") && fb.includes("2 سبتمبر 2026"));
check("Fable 5.1 present (r82 fix intact)", fb.includes("Claude Fable 5.1"));
check("warns 3.5 Sonnet is 2024-old", fb.includes("3.5 Sonnet"));
check("existence rule present", fb.includes("لا تنكر"));
check("honesty rule → official source", fb.includes("المصدر الرسمي"));

console.log("3) community personas — all bots carry the freshness block");
const bot = { id: "gumo", username: "gu_mo_bot", name: "Gu Mo", persona: "sharp" };
const priv = systemPrompt(bot, "@other_bot (Other)", false);
const group = systemPrompt(bot, "@other_bot (Other)", true);
check("private prompt has freshness", priv.includes("تاريخ اليوم:") && priv.includes("GPT-6 Astra"));
check("group prompt has freshness", group.includes("تاريخ اليوم:") && group.includes("Gemini 3.8 Flash"));
check("persona intact (sharp)", priv.includes("the sharp one"));
check("witty persona also fresh", systemPrompt({ ...bot, persona: "witty" }, "", false).includes("GPT-6 Astra"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
