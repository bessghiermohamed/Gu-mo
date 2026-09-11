/**
 * Shared knowledge freshness module (round 82) — «كتلة الطزاجة».
 *
 * WHY THIS EXISTS: both AI brains (the in-app assistant /api/ai and the
 * Telegram bot brain lib/telegram/bot-chat.ts) answer «what is the latest…?»
 * questions with the TRAINING-CUTOFF facts of whatever model the provider
 * chain picks (Groq's llama-3.3 has a 2023-era cutoff). r81 gave the
 * Telegram brain a per-request freshness block, but its Sept-2026 snapshot
 * was INCOMPLETE (no Fable 5.1) — so when a user asked about
 * «Claude Fable 5.1» the old-cutoff model confidently DENIED its
 * existence, the mirror-image failure of calling 3.5 Sonnet "the latest".
 *
 * r82 CHANGES (verified this round via Anthropic/AWS/Wikipedia/OpenRouter
 * search results):
 *   • Full Sept-2026 Anthropic timeline: Sonnet 5 (Jun 30) → Opus 5
 *     (Jul 24) → Fable 5.1 (Sep 1 — latest GA, most capable), with
 *     Mythos 5.1 beside it (restricted access, not public).
 *   • EXISTENCE RULE: never deny the existence of something you don't
 *     know — say it may be newer than your cutoff instead.
 *   • Single source of truth: /api/ai now appends this same block, so
 *     both brains drift together, never apart.
 *
 * MAINTENANCE: only AI_LANDSCAPE_FACTS below needs periodic editing —
 * the date is computed per request, never cached at module load.
 * PURITY: no imports — safe for both the Next.js route and the pure
 * Telegram brain (bun-testable outside Next.js).
 */

/** تاريخ اليوم (UTC) بصيغة YYYY-MM-DD — يُحسب عند كل طلب لا عند الإقلاع */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

const FRESHNESS_RULES = [
  "معرفتك لها تاريخ قطع ولا تتصفح الإنترنت: إذا سُئلت عن «الأحدث» أو «الجديد» من أي شيء (نماذج ذكاء اصطناعي، إصدارات، أخبار، أسعار، أحداث جارية) فلا تدّعِ أن شيئاً بعينه هو الأحدث ولا تُسمّي إصداراً على أنه الأخير إلا إن ورد صراحة في المعطيات المحدّثة المرفقة.",
  "قاعدة الوجود — لا تنكر ما لا تعرفه: إن ذكر المستخدم نموذجاً أو منتجاً أو شركة أو حدثاً لا تجده في معلوماتك ولا في المعطيات المحدّثة فلا تقل إنه غير موجود ولا تصحّح المستخدم بشأن وجوده؛ قل إنه غالباً أحدث من تاريخ قطع تدريبك ولم يصلك عنه تحديث كافٍ، وأن المرجع الأضمن هو المصدر الرسمي.",
  "اعتمد أولاً على المعطيات المحدّثة المرفقة، وإن لم تجد فيها جواباً فقل بصراحة إن معلوماتك قد تكون قديمة وأن المرجع الأضمن هو المصدر الرسمي.",
  "وأجب دائماً بلغة سؤال المستخدم نفسها حتى وإن كانت هذه القواعد والمعطيات بلغة أخرى.",
].join(" ");

/** هذه الفقرة هي الوحيدة التي تحتاج تحديثاً دورياً (آخر تحديث: 12 سبتمبر 2026) */
const AI_LANDSCAPE_FACTS = [
  "المعطيات المحدّثة (تحديث 12 سبتمبر 2026) عن نماذج الذكاء الاصطناعي الكبرى:",
  "Claude من Anthropic بالترتيب الزمني: Claude Sonnet 5 (30 يونيو 2026)، ثم Claude Opus 5 (24 يوليو 2026) وهو أقوى نماذج سلسلة Opus، وأحدث نموذج متاح للعموم حتى تاريخ هذا التحديث هو Claude Fable 5.1 (1 سبتمبر 2026) وهو الأقوى إلى الآن، وإلى جانبه Claude Mythos 5.1 المتاح لعدد محدود جداً من المؤسسات فقط (ليس متاحاً للعموم).",
  "عائلة Claude 3 (ومنها Claude 3.5 Sonnet) قديمة جداً — صدرت في 2024 — فلا تسمّها أبداً أحدث موديل، ولا تنكر وجود الإصدارات الأحدث المذكورة أعلاه.",
  "GPT من OpenAI: سلسلة GPT-5 هي الحالية، وأحدث إصدار فيها GPT-5.6 (9 يوليو 2026).",
  "Gemini من Google: سلسلة Gemini 3 هي الحالية (صدرت منها خلال 2026 إصدارات 3.5 و3.6 و3.7 و3.8 Flash).",
  "وإن سُئلت عمّا هو أحدث من تاريخ اليوم نفسه فقل بصراحة إنه لم يصلك بعد أي تحديث عنه.",
].join(" ");

/** كتلة الطزاجة الكاملة — تُبنى عند كل طلب فيبقى التاريخ صحيحاً دائماً */
export function freshnessBlock(): string {
  return `تاريخ اليوم: ${todayStamp()}. ${FRESHNESS_RULES} ${AI_LANDSCAPE_FACTS}`;
}
