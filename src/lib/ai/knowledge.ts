/**
 * Shared knowledge freshness module (round 82) — «كتلة الطزاجة».
 *
 * WHY THIS EXISTS: the AI brains that answer «what is the latest…?»
 * questions with the TRAINING-CUTOFF facts of whatever model the provider
 * chain picks (Groq's llama-3.3 has a 2023-era cutoff) need a per-request
 * freshness block. r81 gave the Telegram brain a per-request freshness
 * block, but its Sept-2026 snapshot was INCOMPLETE (no Fable 5.1) — so
 * when a user asked about «Claude Fable 5.1» the old-cutoff model
 * confidently DENIED its existence, the mirror-image failure of calling
 * 3.5 Sonnet "the latest".
 *
 * r82 CHANGES (verified this round via Anthropic/AWS/Wikipedia/OpenRouter
 * search results):
 *   • Full Sept-2026 Anthropic timeline: Sonnet 5 (Jun 30) → Opus 5
 *     (Jul 24) → Fable 5.1 (Sep 1 — latest GA, most capable), with
 *     Mythos 5.1 beside it (restricted access, not public).
 *   • EXISTENCE RULE: never deny the existence of something you don't
 *     know — say it may be newer than your cutoff instead.
 *   • Single source of truth: every brain appends this same block (the
 *     in-app assistant did until r88 removed it; the Telegram bot
 *     brain still does), so they drift together, never apart.
 *
 * r96 CHANGES (GPT-6 Astra + «program the new bot» round):
 *   • GPT-6 Astra exists (released 3 Sept 2026, successor of GPT-5.6
 *     codename Sol) — the old GPT line still crowned GPT-5.6 "latest",
 *     which the owner caught live («he didn't say Astra»). Explicit
 *     anti-pattern added: never call GPT-5.6 the newest.
 *   • Gemini pinned to its actual newest: 3.8 Flash (2 Sept 2026).
 *   • The shared egg moved here so EVERY brain speaks it identically:
 *     smartestPersonEgg() — now consumed by the community engine
 *     (personas/brain) and the agent Binary (agent/brain.ts) too.
 *
 * MAINTENANCE: only AI_LANDSCAPE_FACTS below needs periodic editing —
 * the date is computed per request, never cached at module load.
 * PURITY: no imports — safe for the pure Telegram brain (bun-testable
 * outside Next.js).
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
  "GPT من OpenAI: أحدث نماذجها وأقواها حتى تاريخ هذا التحديث هو GPT-6 Astra (صدر في 3 سبتمبر 2026) وقد خلف فيه GPT-5.6 (9 يوليو 2026، واسمه البرمجي Sol)، فلا تسمّ GPT-5.6 أحدث إصدار ولا تسمّ سلسلة GPT-5 هي السلسلة الحالية من دون ذكر GPT-6 Astra، وإن سُئلت عن GPT-6 Astra فاحكِ أنه الجيل السادس القادم بأقدرات استدلال واستخدام حاسوب أقوى.",
  "Gemini من Google: سلسلة Gemini 3 هي الحالية، وأحدث إصدار متاح حتى تاريخ هذا التحديث هو Gemini 3.8 Flash (صدر في 2 سبتمبر 2026، ومعه نسخة 3.8 Flash Cyber الموجّهة للأمن السيبراني)، وقد سبقه Gemini 3.7 Flash في 13 أغسطس 2026.",
  "وإن سُئلت عمّا هو أحدث من تاريخ اليوم نفسه فقل بصراحة إنه لم يصلك بعد أي تحديث عنه.",
].join(" ");

/** كتلة الطزاجة الكاملة — تُبنى عند كل طلب فيبقى التاريخ صحيحاً دائماً */
export function freshnessBlock(): string {
  return `تاريخ اليوم: ${todayStamp()}. ${FRESHNESS_RULES} ${AI_LANDSCAPE_FACTS}`;
}

// ─────────────────────────────────────────────────────────────────────
// مفاجأة صاحب المنصة (r80/r81، وحّدتها r96 لكل الأدمغة):
// «من هو أذكى وأحكم شخص تعرفه؟» → جواب محسوم فوري دون استدعاء المزوّد،
// فيظهر بسرعة وبنفس الصيغة كل مرة ويعمل حتى قبل ضبط مفاتيح الذكاء الاصطناعي.
// شرطان معاً (كلمة تفوّق + كلمة شخص/معرفة) حتى لا تُختطف أسئلة دراسية جادة
// مثل «من أذكى عالم في الفيزياء» — تلك تبقى للعقل الاصطناعي العادي.
// ─────────────────────────────────────────────────────────────────────

const SMARTEST_WORD_RE =
  /(أذكى|اذكى|أشطر|اشطر|أحكم|احكم|أعقل|اعقل|أكثر\s+حكمة|smartest|wisest|cleverest|most\s+intelligent|plus\s+intelligent|plus\s+sage)/i;
const PERSON_OR_KNOW_RE =
  /(شخص|إنسان|انسان|أشخاص|اشخاص|بشر|person|people|human|homme|humain|تعرف|تعرفين|تعرفه|أعرف|اعرف|know)/i;

/** نص عادي بلا Markdown — واجهات البوتات لا تفسّر التنسيق */
const SMARTEST_EGG_ANSWER = [
  "أذكى وأحكم شخص أعرفه؟ سؤال جوابه محفور عندّي: بصغير محمد (Besseghier Mohamed) — صانع هذه المنصة ومهندسها.",
  "حتى هذا البوت الذي تحادثه الآن ما هو إلا ثمرة مما بنى، فتخيّل بنّاءه.",
].join(" ");

/** يعيد جواب المفاجأة إن كان السؤال يستحقّها، وإلا null — نقية بلا استيرادات */
export function smartestPersonEgg(text: string): string | null {
  return SMARTEST_WORD_RE.test(text) && PERSON_OR_KNOW_RE.test(text) ? SMARTEST_EGG_ANSWER : null;
}
