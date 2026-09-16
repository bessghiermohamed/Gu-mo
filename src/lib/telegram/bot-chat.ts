/**
 * Bot brain (round 62, r81 knowledge refresh, r85 html studio, r86 study tools) — «بوت الترتيب الذكي».
 *
 * When someone messages the bot PRIVATELY (@gu_mo_bot), the bot:
 *   1. /start / /help → welcome & guide (no AI needed).
 *   2. /html → the HTML studio (r85): a complete Arabic RTL page from a
 *      short description via the two-pass generate-critique pipeline —
 *      four archetypes × five critique dimensions, one refine round max,
 *      delivered as an .html document. Own quotas (20s gap, 8/day),
 *      owner's credentials/phishing guard BEFORE any provider call,
 *      zero storage.
 *   3. /مخطط /ترجم /تحليل /كشف /مراجعة → the study tools (r86), inspired
 *      by generation-platform services (Alborihi AI et al.) on the same
 *      provider chain: Mermaid diagrams (.mmd file, syntax-checked with
 *      one correction round), academic translation with auto language
 *      detection (ar→fr, non-ar→ar), Arabic language analysis (correction,
 *      tashkeel, i'rab, morphology, meanings), honest probabilistic
 *      AI-writing detection with tangible signals (never a proof), and
 *      Karpathy-style code review (real bugs only, improved version when
 *      it earns one). Generation tools guard (studyGuard) BEFORE any
 *      provider call; own quotas: diagram 15s/12 per day, light tools
 *      10s/24 per day. Zero storage everywhere.
 *   4. Text → a real THINKING answer via the same provider chain as the
 *      in-app assistant (lib/ai/providers — Groq → Gemini → xAI chain),
 *      with short conversation memory per chat.
 *   5. File/photo/video → the bot SORTS it: classifies the content into
 *      the academic item types (محاضرة/امتحان/تمارين…) with a clean
 *      Arabic title — same classifier the channel pipeline uses, vision
 *      OCR included for photos. Nothing is stored: classification only.
 *
 * r81 KNOWLEDGE REFRESH: both system roles now end with a freshness block
 * (today's date + never-claim-latest honesty rules + a Sept-2026 snapshot
 * of the major AI model families) — the bot used to answer with 2024-era
 * facts (e.g. calling Claude 3.5 Sonnet the latest model), because the
 * chain models have old training cutoffs. Also: the owner's
 * smartest-person easter egg, same as the in-app /api/ai (r80).
 * r82: the freshness block moved to the shared src/lib/ai/knowledge.ts —
 * now ALSO used by /api/ai — with the verified Sept-2026 lineup (Fable 5.1
 * is the latest GA Claude) plus an explicit never-deny-existence rule.
 *
 * PRIVACY: private messages are NEVER ingested into telegram_items and
 * NEVER logged to the DB — the conversation lives in memory for this
 * process only (same stance as the in-app assistant).
 *
 * PURITY: imports only pure modules (bot-api / classify / providers /
 * html-studio) — unit-testable with bun + patched fetch, outside Next.js.
 *
 * Never throws; failures degrade to a friendly fallback message.
 */

import { classifyItem } from "./classify";
import { isAiConfigured, chatComplete, type ChatMessage } from "@/lib/ai/providers";
import { freshnessBlock } from "@/lib/ai/knowledge";
import {
  parseHtmlCommand,
  credentialsGuard,
  runHtmlStudio,
  htmlHelpText,
  htmlCaption,
  HTML_ERROR_TEXT,
  HTML_PROMPT_MAX,
  type HtmlStudioResult,
} from "@/lib/ai/html-studio";
import {
  parseDiagramCommand,
  runDiagramStudio,
  diagramHelpText,
  diagramCaption,
  diagramFileName,
  studyGuard,
  DIAGRAM_ERROR_TEXT,
  DIAGRAM_PROMPT_MAX,
  type DiagramStudioResult,
  parseTranslateCommand,
  runTranslateStudio,
  translateHelpText,
  TRANSLATE_ERROR_TEXT,
  TRANSLATE_PROMPT_MAX,
  parseAnalyzeCommand,
  runAnalyzeStudio,
  analyzeHelpText,
  ANALYZE_ERROR_TEXT,
  ANALYZE_PROMPT_MAX,
  parseDetectCommand,
  runDetectStudio,
  formatDetectMessage,
  detectHelpText,
  DETECT_ERROR_TEXT,
  DETECT_PROMPT_MAX,
  parseReviewCommand,
  runReviewStudio,
  reviewHelpText,
  REVIEW_ERROR_TEXT,
  REVIEW_PROMPT_MAX,
} from "@/lib/ai/study-tools";
import {
  sendMessageText,
  sendMessageReply,
  sendTyping,
  sendDocumentWith,
  downloadFileBase64With,
} from "./bot-api";
import type { TgMessage } from "./types";

// ---------------------------------------------------------------------------
// Prompts & static texts (Arabic — the app's language)
// ---------------------------------------------------------------------------

/** هوية البوت في المحادثة الخاصة — نسخة تيليجرام من SYSTEM_ROLE بتطبيق /api/ai */
const TELEGRAM_SYSTEM_ROLE = [
  "أنت «بوت طالب (Talib)»، رفيق دراسة لطالب جامعي جزائري، تخدمه عبر محادثة تيليجرام.",
  "أجب دائماً بالعربية الفصحى المبسطة بأسلوب ودود ودقيق، وبلا مقدمات زائدة وبلا إيموجي.",
  "نظّم إجاباتك بفقرات قصيرة، واستخدم عناوين وقوائم مختصرة عند الحاجة، ووضّح المصطلحات التقنية بالعربية مع إبقائها بالإنجليزية/الفرنسية بين قوسين إن كانت كذلك.",
  "واجهة تيليجرام لا تعرض LaTeX: اكتب الرياضيات والرموز نصاً عادياً واضحاً (مثال: F = m × a أو E = mc²) ولا تستخدم علامات الدولار للمعادلات.",
  "إن كان السؤال غامضاً فاسأل سؤالاً توضيحياً واحداً قبل الإجابة، وإذا كان خارج نطاق الدراسة فنبّه الطالب بلطف.",
  "إن لم تعرف الجواب بدقة فقل ذلك بصراحة ولا تخترع معلومات، ولا تُنهِ إجاباتك بعبارة ختامية متكررة.",
].join(" ");

// ---------------------------------------------------------------------------
// r82 — تحديث معرفة البوت: كتلة الطزاجة صارت وحدة مشتركة واحدة
// (src/lib/ai/knowledge.ts) تُستعمل هنا وفي «المساعد الذكي» /api/ai معاً:
// تاريخ اليوم يُحسب عند كل طلب + قواعد الصدق في «الأحدث» + قاعدة الوجود
// (عدم إنكار ما هو أحدث من تدريب النموذج) + معطيات 12 سبتمبر 2026
// المُتحقَّق منها — أحدث Claude متاح للعموم هو Fable 5.1 (1 سبتمبر 2026).
// ---------------------------------------------------------------------------

/** دور النظام الكامل للمحادثة الخاصة = الدور الأساسي + كتلة الطزاجة */
function privateSystemRole(): string {
  return `${TELEGRAM_SYSTEM_ROLE} ${freshnessBlock()}`;
}

// ---------------------------------------------------------------------------
// مفاجأة صاحب المنصة (r81 — نفس مفاجأة «المساعد الذكي» في /api/ai r80):
// «من هو أذكى وأحكم شخص تعرفه؟» → جواب محسوم فوري دون استدعاء المزوّد،
// فيظهر بسرعة وبنفس الصيغة كل مرة ويعمل حتى قبل ضبط مفاتيح الذكاء الاصطناعي.
// شرطان معاً (كلمة تفوّق + كلمة شخص/معرفة) حتى لا تُختطف أسئلة دراسية جادة
// مثل «من أذكى عالم في الفيزياء» — تلك تبقى للعقل الاصطناعي العادي.
// ---------------------------------------------------------------------------

const SMARTEST_WORD_RE =
  /(أذكى|اذكى|أشطر|اشطر|أحكم|احكم|أعقل|اعقل|أكثر\s+حكمة|smartest|wisest|cleverest|most\s+intelligent|plus\s+intelligent|plus\s+sage)/i;
const PERSON_OR_KNOW_RE =
  /(شخص|إنسان|انسان|أشخاص|اشخاص|بشر|person|people|human|homme|humain|تعرف|تعرفين|تعرفه|أعرف|اعرف|know)/i;

/** نص عادي بلا Markdown — واجهة هذا البوت لا تفسّر التنسيق */
const SMARTEST_EGG_ANSWER = [
  "أذكى وأحكم شخص أعرفه؟ سؤال جوابه محفور عندّي: بصغير محمد (Besseghier Mohamed) — صانع هذه المنصة ومهندسها.",
  "حتى هذا البوت الذي تحادثه الآن ما هو إلا ثمرة مما بنى، فتخيّل بنّاءه.",
].join(" ");

function smartestPersonEgg(text: string): string | null {
  return SMARTEST_WORD_RE.test(text) && PERSON_OR_KNOW_RE.test(text) ? SMARTEST_EGG_ANSWER : null;
}

const WELCOME_TEXT = [
  "أهلاً بك! أنا بوت «طالب | Talib» — منصة الطلبة الجامعيين في الجزائر.",
  "",
  "ماذا أستطيع أن أفعل من أجلك؟",
  "• أجيب عن أسئلتك الدراسية والعلمية — اكتب سؤالك مباشرة وسأفكّر فيه وأجيبك.",
  "• أدوات دراسية سريعة: /ترجم (ترجمة أكاديمية)، /تحليل (نحو وصرف)، /مخطط (Mermaid)، /كشف (تقدير كتابة آلية)، /مراجعة (مراجعة كود)، /html (صفحة ويب).",
  "• أرسل لي ملفاً أو صورة (درس، تمرين، امتحان…) وسأخبرك بنوعه وعنوانه المناسب — هذا «الترتيب الذكي» نفسه الذي أستعمله في قنوات المنصة.",
  "• في القنوات الجامعية المرتبطة بالمنصة أرتّب المنشورات تلقائياً (محاضرات، تمارين، امتحانات…) داخل تطبيق طالب.",
  "",
  "تطبيق المنصة: gu-mo.vercel.app",
  "وكل ما ترسله هنا يبقى بينك وبيني — لا يُحفظ أي شيء منه.",
].join("\n");

const HELP_TEXT = [
  "كيف تستعمل البوت؟",
  "",
  "• سؤال دراسي؟ اكتبه مباشرة (بالعربية أو الفرنسية) وسأجيبك خطوة بخطوة.",
  "• /ترجم <نص> — ترجمة أكاديمية أمينة: تلقائية (عربي→فرنسي والعكس) أو بلغة صريحة: /ترجم en النص.",
  "• /تحليل <نص عربي> — تصحيح، تشكيل، إعراب، صرف، معاني في جواب واحد.",
  "• /مخطط <فكرة> — مخطط Mermaid جاهز (انسيابي، خريطة ذهنية، تسلسل…) يصلك ملفاً .mmd — اختر النوع: /مخطط ذهنية <فكرتك>.",
  "• /كشف <نص ≥ ١٢٠ حرفاً> — تقدير احتمالي صادق أن النص مولّد آلياً + إشارات ونصيحة (تقدير لا دليل).",
  "• /مراجعة <كود> — مراجعة كودك: مشاكل حقيقية، تبسيط، نسخة محسّنة إن استحق.",
  "• /html <وصف> — صفحة ويب عربية كاملة (بطاقة مراجعة، صفحة درس، ملخص امتحان…) تصلك ملفاً.",
  "• ملف أو صورة ولا تعرف ما هي بالضبط؟ أرسلها وسأصنّفها: محاضرة، أعمال موجهة TD، تمارين، امتحان، ملخص، كتاب… مع عنوان مقترح.",
  "• لسماع المنشورات المرتبة في قنواتك الجامعية: افتح تطبيق طالب ← دروس تيليجرام.",
  "",
  "ملاحظة: الرسائل الصوتية غير مدعومة بعد — اكتب سؤالك نصاً.",
].join("\n");

const VOICE_UNSUPPORTED =
  "الرسائل الصوتية غير مدعومة بعد — اكتب سؤالك نصاً وسأجيبك فوراً.";

const AI_FALLBACK_TEXT =
  "المساعد الذكي غير متاح حالياً (خدمة الذكاء الاصطناعي غير مضبوطة أو مثقلة مؤقتاً). جرّب بعد قليل — أو اطرح سؤالك داخل تطبيق طالب في «المساعد الذكي».";

const RATE_LIMIT_TEXT =
  "انتظر بضع ثوانٍ بين كل رسالة ورسالة — أحتاج وقتاً قليلاً للتفكير.";

const RATE_LIMIT_DAILY_TEXT = "وصلت إلى حد الاستخدام اليومي للبوت — جرّب غداً.";

const NO_CONTENT_TEXT = "أرسل لي سؤالاً نصياً أو ملفاً/صورة لأصنّفه — ويمكنك كتابة /help في أي وقت.";

// ---------------------------------------------------------------------------
// Guards: rate limiting + conversation memory (in-memory, best-effort)
// ---------------------------------------------------------------------------

const MIN_GAP_MS = 3_000; // فاصل أدنى بين الرسائل لكل مستخدم
const DAILY_CAP = 40; // رسائل الذكاء الاصطناعي لكل مستخدم يومياً
const MEMORY_TTL_MS = 30 * 60 * 1000; // ذاكرة المحادثة: ٣٠ دقيقة
const MEMORY_TURNS = 8; // آخر ٨ أدوار تُرسل كسياق
const MAX_CHATS = 2000;

// استوديو HTML (r85): كل طلب صفحة = ٢ إلى ٤ نداءات مزوّد — أثقل بكثير من
// رسالة دردشة، فلحدود مستقلة تليق بذلك: فاصل ٢٠ ثانية وسقف ٨ صفحات يومياً.
const HTML_GAP_MS = 20_000;
const HTML_DAILY_CAP = 8;
const htmlUsers = new Map<number, { last: number; day: string; count: number }>();

// الأدوات الدراسية (r86): مخطط (نداء إلى نداءان) والأدوات الخفيفة الأربع
// (نداء واحد) — لكل عائلة حدودها المستقلة عن الدردشة وعن /html.
const DIAGRAM_GAP_MS = 15_000;
const DIAGRAM_DAILY_CAP = 12;
const diagramUsers = new Map<number, { last: number; day: string; count: number }>();
const LIGHT_TOOLS_GAP_MS = 10_000;
const LIGHT_TOOLS_DAILY_CAP = 24;
const lightToolUsers = new Map<number, { last: number; day: string; count: number }>();

const HTML_GAP_TEXT = "انتظر ~٢٠ ثانية بين كل صفحة وأخرى — بناء الصفحة ونقدها يحتاج وقتاً وحصة أثقل من الدردشة.";
const HTML_DAILY_TEXT = "وصلت إلى حد الصفحات اليومي (٨) — عُد غداً أو استعمل النتائج التي بناها لك اليوم.";

function htmlLimitCheck(userId: number): string | null {
  return limitCheck(
    userId,
    htmlUsers,
    HTML_GAP_MS,
    HTML_DAILY_CAP,
    "انتظر ~٢٠ ثانية بين كل صفحة وأخرى — بناء الصفحة ونقدها يحتاج وقتاً وحصة أثقل من الدردشة.",
    "وصلت إلى حد الصفحات اليومي (٨) — عُد غداً أو استعمل النتائج التي بناها لك اليوم."
  );
}

const DIAGRAM_GAP_TEXT = "انتظر ~١٥ ثانية بين كل مخطط وآخر — بناء المخطط وفحص صياغته يحتاج وقتاً وحصة.";
const DIAGRAM_DAILY_TEXT = "وصلت إلى حد المخططات اليومي (١٢) — عُد غداً أو استعمل المخططات التي بناها لك اليوم.";
const LIGHT_GAP_TEXT = "انتظر بضع ثوانٍ بين كل أداة وأخرى — كل طلب يستهلك حصة ذكاء اصطناعي حقيقية.";
const LIGHT_DAILY_TEXT = "وصلت إلى حد الأدوات اليومي (٢٤) — عُد غداً أو استعمل نتائج اليوم.";

function diagramLimitCheck(userId: number): string | null {
  return limitCheck(userId, diagramUsers, DIAGRAM_GAP_MS, DIAGRAM_DAILY_CAP, DIAGRAM_GAP_TEXT, DIAGRAM_DAILY_TEXT);
}

function lightToolLimitCheck(userId: number): string | null {
  return limitCheck(userId, lightToolUsers, LIGHT_TOOLS_GAP_MS, LIGHT_TOOLS_DAILY_CAP, LIGHT_GAP_TEXT, LIGHT_DAILY_TEXT);
}

/** عدة الفحص المشتركة (r86 — استُخلصت من htmlLimitCheck): تعدّل الخريطة في مكانها. */
function limitCheck(
  userId: number,
  store: Map<number, { last: number; day: string; count: number }>,
  gapMs: number,
  dailyCap: number,
  gapText: string,
  dailyText: string
): string | null {
  const now = Date.now();
  const day = dayStamp();
  const rec = store.get(userId) ?? { last: 0, day, count: 0 };
  if (rec.day !== day) {
    rec.day = day;
    rec.count = 0;
  }
  const gapOk = now - rec.last >= gapMs;
  rec.count += 1;
  rec.last = now;
  store.set(userId, rec);
  if (rec.count > dailyCap) return dailyText;
  if (gapOk) return null;
  return gapText;
}

// رافقة اختبار (r86) — تُستعمل في scripts/r86-check.ts لضبط الحصص بين
// الفحوص: الخرائط في الذاكرة لكل نسخة، والفحص المتسلسل يحتاج صفحة بيضاء.
export function __resetToolLimits(): void {
  htmlUsers.clear();
  diagramUsers.clear();
  lightToolUsers.clear();
}
export { limitCheck as __limitCheck };

function safeFileName(title: string): string {
  const base = (title || "talib-page")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "-")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  return `${base || "talib-page"}.html`;
}

/** يفحص صلاحية المفاتيح مرة واحدة لكل أداة — رسالة صادقة موحدة. */
async function ensureAiForTool(token: string, chatId: number): Promise<boolean> {
  if (isAiConfigured()) return true;
  await sendMessageText(token, chatId, AI_FALLBACK_TEXT);
  return false;
}

/** منع التكرار للرسائل الطويلة: كيف تُعرض معلومات الوصف المرفوض في كل أداة */
function promptLengthWhy(reason: "short" | "long", max: number): string {
  return reason === "short"
    ? "النص قصير جداً — اكتب جملة أو أكثر تشرح طلبك."
    : `النص طويل جداً — الخلاصة أصدق من الإحالة: اكتب الجوهر في ${max} حرفاً كحد أقصى.`;
}

const users = new Map<number, { last: number; lastNotice: number; day: string; count: number }>();
const chats = new Map<number, { messages: ChatMessage[]; at: number }>();

function dayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** يفحص الحد؛ يرجّع رسالة التحديد إن وُجدت، أو "" للتجاهل الصامت، أو null إن سمح بالمرور */
function rateLimitCheck(userId: number): string | null {
  const now = Date.now();
  const rec = users.get(userId) ?? { last: 0, lastNotice: 0, day: dayStamp(), count: 0 };
  if (rec.day !== dayStamp()) {
    rec.day = dayStamp();
    rec.count = 0;
  }
  const gapOk = now - rec.last >= MIN_GAP_MS;
  rec.count += 1;
  rec.last = now;
  users.set(userId, rec);
  if (users.size > 5000) {
    for (const [k, v] of users) {
      if (now - v.last > 24 * 60 * 60 * 1000) users.delete(k);
    }
  }
  if (rec.count > DAILY_CAP) return RATE_LIMIT_DAILY_TEXT;
  if (gapOk) return null;
  if (now - rec.lastNotice < 10_000) return ""; // حذّرنا قبل قليل — تجاهل بصمت
  rec.lastNotice = now;
  return RATE_LIMIT_TEXT;
}

function rememberTurn(chatId: number, role: "user" | "assistant", content: string) {
  const now = Date.now();
  const entry = chats.get(chatId) ?? { messages: [], at: now };
  entry.messages.push({ role, content: content.slice(0, 6000) });
  if (entry.messages.length > MEMORY_TURNS * 2) entry.messages = entry.messages.slice(-MEMORY_TURNS * 2);
  entry.at = now;
  chats.set(chatId, entry);
  if (chats.size > MAX_CHATS) {
    for (const [k, v] of chats) {
      if (now - v.at > MEMORY_TTL_MS) chats.delete(k);
    }
  }
}

function conversationFor(chatId: number): ChatMessage[] {
  const entry = chats.get(chatId);
  if (!entry || Date.now() - entry.at > MEMORY_TTL_MS) return [];
  return entry.messages.slice(-MEMORY_TURNS);
}

// ---------------------------------------------------------------------------
// Content classification for files/photos sent in private
// ---------------------------------------------------------------------------

async function classifyAndReply(msg: TgMessage, token: string): Promise<"handled-classify" | "handled-fallback"> {
  const caption = (msg.caption ?? msg.text ?? "").trim();
  let fileName = "";
  let sizeBytes = 0;
  let imageBase64: string | undefined;
  let imageMime: string | undefined;
  let kind = "other";

  if (msg.photo?.length) {
    kind = "image";
    const largest = msg.photo[msg.photo.length - 1];
    sizeBytes = largest.file_size ?? 0;
    if (isAiConfigured() && token && largest.file_id) {
      const dl = await downloadFileBase64With(token, largest.file_id);
      if (dl) {
        imageBase64 = dl.base64;
        imageMime = dl.mime;
      }
    }
  } else if (msg.document) {
    fileName = msg.document.file_name ?? "";
    kind = kindFromFile(msg.document.mime_type ?? "", fileName);
  } else if (msg.video) {
    fileName = msg.video.file_name ?? "";
    kind = "video";
  } else if (msg.audio) {
    fileName = msg.audio.file_name ?? "";
    kind = "audio";
  }

  await sendTyping(token, msg.chat.id);
  const cls = await classifyItem({
    kind,
    caption,
    fileName,
    ...(imageBase64 ? { imageBase64, imageMimeType: imageMime } : {}),
    context: "رسالة خاصة إلى البوت — صنّف لعرض النوع والعنوان فقط",
  });

  // r71: نفس عقل خط الأنابيب — نعرض أيضاً ما فهمه عن السنة/الممح/الدرس
  const lines = [
    `التصنيف الذكي: ${cls.itemType}`,
    `العنوان المقترح: ${cls.title || "—"}`,
  ];
  const scopeBits: string[] = [];
  if (cls.extracted.yearOrdinal) scopeBits.push(cls.extracted.yearOrdinal === 1 ? "السنة الأولى" : cls.extracted.yearOrdinal === 2 ? "السنة الثانية" : "السنة الثالثة");
  if (cls.extracted.trackCode) scopeBits.push(`ملمح ${cls.extracted.trackCode === "PEP" ? "ابتدائي" : cls.extracted.trackCode === "PEM" ? "متوسط" : "ثانوي"} (${cls.extracted.trackCode})`);
  if (cls.extracted.semester) scopeBits.push(`الفصل ${cls.extracted.semester}`);
  if (scopeBits.length > 0) lines.push(`المستوى المفهوم: ${scopeBits.join(" · ")}`);
  if (cls.extracted.lessonHint) lines.push(`الدرس المفهوم: ${cls.extracted.lessonHint}`);
  if (cls.aiClassified) lines.push(`(صُنِّف عبر ${cls.engine === "gemini" ? "Gemini" : cls.engine === "groq" ? "Groq" : "تحليل محلي"})`);
  lines.push("", "هذا التصنيف للعرض فقط — لم يُحفظ الملف ولن يظهر لأحد. يمكنك سؤالي عن محتواه الآن.");
  const sent = await sendMessageText(token, msg.chat.id, lines.join("\n"));
  return sent ? "handled-classify" : "handled-fallback";
}

function kindFromFile(mime: string, fileName: string): string {
  const m = (mime || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  if (m.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|bmp)$/.test(name)) return "image";
  if (m.startsWith("video/") || /\.(mp4|mkv|avi|mov|webm)$/.test(name)) return "video";
  if (m.startsWith("audio/") || /\.(mp3|ogg|m4a|opus|wav)$/.test(name)) return "audio";
  if (m.includes("presentation") || /\.(ppt|pptx|odp)$/.test(name)) return "ppt";
  if (m.includes("word") || m.includes("document") || /\.(doc|docx|odt|rtf|txt)$/.test(name)) return "doc";
  return "other";
}

// ---------------------------------------------------------------------------
// Group/forum brain (round 63) — «البوت الذكي داخل مجموعة ENS»
//
// المجموعات والمنتديات صاخبة: البوت لا يتدخل إلا إذا خُوطب صراحة —
//   • منشن صريح (@gu_mo_bot …)
//   • ردّ على رسالة كتبها البوت نفسه
//   • أمر /ask أو /اسأل
// وبخلاف ذلك يبقى صامتاً كلياً (لا سبام، لا استنزاف). الردّ يسقط في
// الموضوع (topic) نفسه الذي طُرح فيه السؤال، ويحترم نفس حدود الاستخدام
// والمهلات الخاصة — بلا أي تخزين، تماماً كالمحادثات الخاصة.
// ---------------------------------------------------------------------------

const GROUP_SYSTEM_ROLE = [
  "أنت «بوت طالب (Talib)» داخل مجموعة طلابية جامعية جزائرية على تيليجرام، وخوطبتَ صراحة.",
  "أجب بالعربية الفصحى المبسطة بإيجاز حاسم: جملة أو جملتان إلى ثلاث كحد أقصى — النقاش داخل المجموعات سريع ولا يحتمل المقالات.",
  "لا مقدمات ولا تحيات ولا إيموجي: ادخل في صلب الجواب مباشرة. وإن احتاج السؤال تفصيلاً أطول فأجب بالخلاصة ثم اقترح مراسلتك خاصاً للتفصيل.",
  "واجهة تيليجرام لا تعرض LaTeX: اكتب الرياضيات نصاً عادياً واضحاً (مثل F = m × a).",
  "إن لم تعرف الجواب بدقة فقل ذلك بصراحة ولا تخترع معلومات.",
].join(" ");

/** دور النظام الكامل للمجموعات = دور المجموعة + كتلة الطزاجة نفسها */
function groupSystemRole(): string {
  return `${GROUP_SYSTEM_ROLE} ${freshnessBlock()}`;
}

const GROUP_PING_BACK =
  "أنا هنا — اكتب سؤالك بجوار اسمي وسأجيبك فوراً، أو راسلني خاصاً لتفصيل أوسع.";

/** هل خوطب البوت في هذه الرسالة الجماعية؟ (منشن / ردّ على البوت / أمر) */
export function isBotAddressed(msg: TgMessage, botUsername: string): boolean {
  const rawText = (msg.text ?? msg.caption ?? "").trim();
  const uname = (botUsername || "").replace(/^@/, "").toLowerCase();
  if (!rawText) return false;

  // 1) ردّ على رسالة كتبها البوت نفسه
  if (msg.reply_to_message?.from?.is_bot) return true;

  // 2) أمر موجَّه للبوت
  const firstWord = rawText.split(/\s+/, 1)[0]?.replace(/@.+$/, "") ?? "";
  if (firstWord === "/ask" || firstWord === "/اسأل" || firstWord === "/سؤال") return true;

  // 3) منشن صريح في النص أو في كيانات الرسالة
  if (uname && rawText.toLowerCase().includes(`@${uname}`)) return true;
  if (msg.entities?.some((e) => e.type === "mention")) {
    // كيان mention موجود — تأكد أنه يخصنا لا بوتاً آخر
    if (uname) {
      for (const e of msg.entities) {
        if (e.type !== "mention" || e.offset == null || e.length == null) continue;
        const mentioned = rawText.substr(e.offset, e.length).toLowerCase();
        if (mentioned === `@${uname}`) return true;
      }
    }
  }
  return false;
}

/** يستخرج نص السؤال بعد إزالة المنشن وأوامر الاستدعاء */
function groupQuestionText(msg: TgMessage, botUsername: string): string {
  const uname = (botUsername || "").replace(/^@/, "");
  let text = (msg.text ?? msg.caption ?? "").trim();
  if (uname) text = text.replace(new RegExp(`@${uname}\\b`, "gi"), "").trim();
  text = text.replace(/^\/(ask|اسأل|سؤال)(@\S+)?\s*/i, "").trim();
  return text.slice(0, 6000);
}

export type GroupChatOutcome = "handled-group-ai" | "handled-group-ping" | "group-rate-limited" | "ignored";

/**
 * يعالج رسالة جماعية خوطب فيها البوت. يُستدعى فقط إذا كان isBotAddressed
 * صحيحاً. لا يرمي استثناءً أبداً ولا يخزّن شيئاً.
 */
export async function handleGroupMessage(
  msg: TgMessage,
  token: string,
  botUsername: string
): Promise<GroupChatOutcome> {
  try {
    const chatId = msg.chat.id;
    const threadId = msg.message_thread_id ?? 0;
    const replyTo = msg.message_id;
    const question = groupQuestionText(msg, botUsername);

    // حدود الاستخدام نفسها الخاصة — الفرد الذي يستنزف في المجموعة يُوقف مثله تماماً
    if (msg.from?.id) {
      const limited = rateLimitCheck(msg.from.id);
      if (limited !== null) {
        if (limited) {
          await sendMessageReply(token, chatId, limited, { replyToMessageId: replyTo, messageThreadId: threadId });
        }
        return "group-rate-limited";
      }
    }

    // منشن مجرد بلا سؤال — ردّ قصير يدعو لصياغة السؤال
    if (!question) {
      await sendMessageReply(token, chatId, GROUP_PING_BACK, { replyToMessageId: replyTo, messageThreadId: threadId });
      return "handled-group-ping";
    }

    // مفاجأة المالك أولاً (r81): جواب محسوم بلا ذكاء اصطناعي وبلا تكلفة
    const egg = smartestPersonEgg(question);
    if (egg) {
      await sendMessageReply(token, chatId, egg, { replyToMessageId: replyTo, messageThreadId: threadId });
      rememberTurn(chatId, "user", question);
      rememberTurn(chatId, "assistant", egg);
      return "handled-group-ai";
    }

    if (!isAiConfigured()) {
      await sendMessageReply(token, chatId, AI_FALLBACK_TEXT, { replyToMessageId: replyTo, messageThreadId: threadId });
      return "ignored";
    }

    await sendTyping(token, chatId);
    // ذاكرة المجموعة: سياق قصير جداً (آخر ٤ أدوار) — يكفي لسؤال متابعة دون تضخيم
    const history = conversationFor(chatId).slice(-4);
    const messages: ChatMessage[] = [...history, { role: "user", content: question }];
    try {
      const { answer } = await chatComplete(groupSystemRole(), messages);
      const sent = await sendMessageReply(token, chatId, answer, { replyToMessageId: replyTo, messageThreadId: threadId });
      rememberTurn(chatId, "user", question);
      if (sent) rememberTurn(chatId, "assistant", answer);
      return sent ? "handled-group-ai" : "ignored";
    } catch {
      await sendMessageReply(token, chatId, AI_FALLBACK_TEXT, { replyToMessageId: replyTo, messageThreadId: threadId });
      return "ignored";
    }
  } catch {
    return "ignored"; // البوت لا يرمي استثناءً أبداً — الويبهوك يبقى 200
  }
}

// ---------------------------------------------------------------------------
// استوديو HTML (r85) — أمر /html في المحادثة الخاصة
//
// خط الممرّين نفسه الذي يعرضه مولّد HTML في منصات التوليد (توليد تحت قيود
// نمط ← نقد خماسي الأبعاد ← تحسين واحد كحد أقصى) — بمفاتيح المنصة نفسها
// وسلسلة المزوّدين نفسها، بلا أي خدمة خارجية ولا أي تخزين. ميزانية وقت
// صارمة (٥٢ ثانية) لتبقى داخل سقف الدالة (٦٠ ث) حتى مع جولة التحسين.
// ---------------------------------------------------------------------------

const HTML_DEADLINE_MS = 52_000;

export async function handleHtmlCommand(msg: TgMessage, token: string): Promise<PrivateChatOutcome> {
  const chatId = msg.chat.id;
  const rest = (msg.text ?? "").trim().replace(/^\/html(@\S+)?\s*/i, "");

  const parsed = parseHtmlCommand(rest);
  if (parsed.kind === "help") {
    await sendMessageText(token, chatId, htmlHelpText());
    return "handled-command";
  }
  if (parsed.kind === "bad-prompt") {
    const why =
      parsed.reason === "short"
        ? "الوصف قصير جداً — اكتب جملة أو أكثر تشرح ماذا تريد في الصفحة."
        : `الوصف طويل جداً — الخلاصة أصدق من الإحالة: اكتب الجوهر في ${HTML_PROMPT_MAX} حرفاً كحد أقصى.`;
    await sendMessageText(token, chatId, why);
    return "handled-fallback";
  }

  // حرس المالك الأمني — قبل أي مزوّد وقبل احتساب أي حصة
  const refused = credentialsGuard(parsed.prompt);
  if (refused) {
    await sendMessageText(token, chatId, refused);
    return "handled-fallback";
  }

  // حدود الاستخدام الخاصة بالاستوديو (غير حدود الدردشة)
  if (msg.from?.id) {
    const limited = htmlLimitCheck(msg.from.id);
    if (limited) {
      await sendMessageText(token, chatId, limited);
      return "rate-limited";
    }
  }

  if (!isAiConfigured()) {
    await sendMessageText(token, chatId, AI_FALLBACK_TEXT);
    return "handled-fallback";
  }

  await sendTyping(token, chatId);
  try {
    const result: HtmlStudioResult = await runHtmlStudio({
      prompt: parsed.prompt,
      archetype: parsed.archetype,
      deadlineMs: Date.now() + HTML_DEADLINE_MS,
    });
    await sendTyping(token, chatId);
    const sent = await sendDocumentWith(
      token,
      chatId,
      safeFileName(result.title),
      result.html,
      htmlCaption(result)
    );
    return sent ? "handled-html" : "handled-fallback";
  } catch (e) {
    const honest = e instanceof Error && e.message ? e.message : HTML_ERROR_TEXT;
    await sendMessageText(token, chatId, honest);
    return "handled-fallback";
  }
}

// ---------------------------------------------------------------------------
// الأدوات الدراسية (r86) — خمس أدوات مستلهمة من خدمات منصات التوليد
// (Alborihi AI نموذجاً) على سلسلة المزوّدين نفسها: مخطط (Mermaid)، ترجم،
// تحليل، كشف، مراجعة. كل أداة: محلّل أمر → حرس (التوليد فقط) → حصة
// مستقلة → نداء واحد إلى نداءين → تسليم صادق. صفر تخزين في الكل.
// ---------------------------------------------------------------------------

const DIAGRAM_DEADLINE_MS = 52_000;

export async function handleDiagramCommand(msg: TgMessage, token: string): Promise<PrivateChatOutcome> {
  const chatId = msg.chat.id;
  const rest = (msg.text ?? "").trim().replace(/^\/(مخطط|diagram)(@\S+)?\s*/i, "");

  const parsed = parseDiagramCommand(rest);
  if (parsed.kind === "help") {
    await sendMessageText(token, chatId, diagramHelpText());
    return "handled-command";
  }
  if (parsed.kind === "bad-prompt") {
    await sendMessageText(token, chatId, promptLengthWhy(parsed.reason, DIAGRAM_PROMPT_MAX));
    return "handled-fallback";
  }

  // حرس المالك الأمني — قبل أي مزوّد وقبل احتساب أي حصة
  const refused = studyGuard(parsed.prompt);
  if (refused) {
    await sendMessageText(token, chatId, refused);
    return "handled-fallback";
  }

  if (msg.from?.id) {
    const limited = diagramLimitCheck(msg.from.id);
    if (limited) {
      await sendMessageText(token, chatId, limited);
      return "rate-limited";
    }
  }
  if (!(await ensureAiForTool(token, chatId))) return "handled-fallback";

  await sendTyping(token, chatId);
  try {
    const result: DiagramStudioResult = await runDiagramStudio({
      prompt: parsed.prompt,
      type: parsed.type,
      deadlineMs: Date.now() + DIAGRAM_DEADLINE_MS,
    });
    await sendTyping(token, chatId);
    const sent = await sendDocumentWith(
      token,
      chatId,
      diagramFileName(parsed.prompt),
      result.code,
      diagramCaption(result),
      "text/plain; charset=utf-8"
    );
    return sent ? "handled-tool" : "handled-fallback";
  } catch (e) {
    const honest = e instanceof Error && e.message ? e.message : DIAGRAM_ERROR_TEXT;
    await sendMessageText(token, chatId, honest);
    return "handled-fallback";
  }
}

export async function handleTranslateCommand(msg: TgMessage, token: string): Promise<PrivateChatOutcome> {
  const chatId = msg.chat.id;
  const rest = (msg.text ?? "").trim().replace(/^\/(ترجم|translate)(@\S+)?\s*/i, "");

  const parsed = parseTranslateCommand(rest);
  if (parsed.kind === "help") {
    await sendMessageText(token, chatId, translateHelpText());
    return "handled-command";
  }
  if (parsed.kind === "bad-prompt") {
    await sendMessageText(token, chatId, promptLengthWhy(parsed.reason, TRANSLATE_PROMPT_MAX));
    return "handled-fallback";
  }

  if (msg.from?.id) {
    const limited = lightToolLimitCheck(msg.from.id);
    if (limited) {
      await sendMessageText(token, chatId, limited);
      return "rate-limited";
    }
  }
  if (!(await ensureAiForTool(token, chatId))) return "handled-fallback";

  await sendTyping(token, chatId);
  try {
    const r = await runTranslateStudio(parsed.text, parsed.target);
    const sent = await sendMessageText(token, chatId, r.translation);
    return sent ? "handled-tool" : "handled-fallback";
  } catch {
    await sendMessageText(token, chatId, TRANSLATE_ERROR_TEXT);
    return "handled-fallback";
  }
}

export async function handleAnalyzeCommand(msg: TgMessage, token: string): Promise<PrivateChatOutcome> {
  const chatId = msg.chat.id;
  const rest = (msg.text ?? "").trim().replace(/^\/(تحليل|analyze)(@\S+)?\s*/i, "");

  const parsed = parseAnalyzeCommand(rest);
  if (parsed.kind === "help") {
    await sendMessageText(token, chatId, analyzeHelpText());
    return "handled-command";
  }
  if (parsed.kind === "bad-prompt") {
    await sendMessageText(token, chatId, promptLengthWhy(parsed.reason, ANALYZE_PROMPT_MAX));
    return "handled-fallback";
  }

  if (msg.from?.id) {
    const limited = lightToolLimitCheck(msg.from.id);
    if (limited) {
      await sendMessageText(token, chatId, limited);
      return "rate-limited";
    }
  }
  if (!(await ensureAiForTool(token, chatId))) return "handled-fallback";

  await sendTyping(token, chatId);
  try {
    const r = await runAnalyzeStudio(parsed.text);
    const sent = await sendMessageText(token, chatId, r.analysis);
    return sent ? "handled-tool" : "handled-fallback";
  } catch {
    await sendMessageText(token, chatId, ANALYZE_ERROR_TEXT);
    return "handled-fallback";
  }
}

export async function handleDetectCommand(msg: TgMessage, token: string): Promise<PrivateChatOutcome> {
  const chatId = msg.chat.id;
  const rest = (msg.text ?? "").trim().replace(/^\/(كشف|detect|scan)(@\S+)?\s*/i, "");

  const parsed = parseDetectCommand(rest);
  if (parsed.kind === "help") {
    await sendMessageText(token, chatId, detectHelpText());
    return "handled-command";
  }
  if (parsed.kind === "bad-prompt") {
    const why =
      parsed.reason === "short"
        ? "النص أقصر من ١٢٠ حرفاً — النص القصير لا يحمل إشارات كافية، والحكم بلا إشارات ظنٌّ لا تحليل. أرسل نصاً أطول."
        : `النص طويل جداً — الخلاصة أصدق من الإحالة: اكتب الجوهر في ${DETECT_PROMPT_MAX} حرفاً كحد أقصى.`;
    await sendMessageText(token, chatId, why);
    return "handled-fallback";
  }

  if (msg.from?.id) {
    const limited = lightToolLimitCheck(msg.from.id);
    if (limited) {
      await sendMessageText(token, chatId, limited);
      return "rate-limited";
    }
  }
  if (!(await ensureAiForTool(token, chatId))) return "handled-fallback";

  await sendTyping(token, chatId);
  try {
    const r = await runDetectStudio(parsed.text);
    const sent = await sendMessageText(token, chatId, formatDetectMessage(r.verdict));
    return sent ? "handled-tool" : "handled-fallback";
  } catch (e) {
    const honest = e instanceof Error && e.message ? e.message : DETECT_ERROR_TEXT;
    await sendMessageText(token, chatId, honest);
    return "handled-fallback";
  }
}

export async function handleReviewCommand(msg: TgMessage, token: string): Promise<PrivateChatOutcome> {
  const chatId = msg.chat.id;
  const rest = (msg.text ?? "").trim().replace(/^\/(مراجعة|review)(@\S+)?\s*/i, "");

  const parsed = parseReviewCommand(rest);
  if (parsed.kind === "help") {
    await sendMessageText(token, chatId, reviewHelpText());
    return "handled-command";
  }
  if (parsed.kind === "bad-prompt") {
    await sendMessageText(token, chatId, promptLengthWhy(parsed.reason, REVIEW_PROMPT_MAX));
    return "handled-fallback";
  }

  // حرس المالك الأمني — قبل أي مزوّد وقبل احتساب أي حصة
  const refused = studyGuard(parsed.code + " " + parsed.note);
  if (refused) {
    await sendMessageText(token, chatId, refused);
    return "handled-fallback";
  }

  if (msg.from?.id) {
    const limited = lightToolLimitCheck(msg.from.id);
    if (limited) {
      await sendMessageText(token, chatId, limited);
      return "rate-limited";
    }
  }
  if (!(await ensureAiForTool(token, chatId))) return "handled-fallback";

  await sendTyping(token, chatId);
  try {
    const r = await runReviewStudio(parsed.code, parsed.note);
    const sent = await sendMessageText(token, chatId, r.review);
    return sent ? "handled-tool" : "handled-fallback";
  } catch {
    await sendMessageText(token, chatId, REVIEW_ERROR_TEXT);
    return "handled-fallback";
  }
}

// ---------------------------------------------------------------------------
// Main entry — called by processTelegramUpdate for chat.type === "private"
// ---------------------------------------------------------------------------

export type PrivateChatOutcome =
  | "handled-command"
  | "handled-ai"
  | "handled-html"
  | "handled-tool"
  | "handled-classify"
  | "handled-fallback"
  | "rate-limited"
  | "ignored";

export async function handlePrivateMessage(msg: TgMessage, token: string): Promise<PrivateChatOutcome> {
  try {
    const chatId = msg.chat.id;
    const rawText = (msg.text ?? "").trim();
    // "/start@gu_mo_bot" → "/start" (تيليجرام يضيف اسم البوت في المجموعات)
    const command = rawText.split(/\s+/, 1)[0]?.replace(/@.+$/, "") ?? "";

    // 1) الأوامر — بلا ذكاء اصطناعي ولا حدود معدّة
    if (command === "/start") {
      await sendMessageText(token, chatId, WELCOME_TEXT);
      return "handled-command";
    }
    if (command === "/help") {
      await sendMessageText(token, chatId, HELP_TEXT);
      return "handled-command";
    }
    if (command === "/html") {
      // الاستوديو يفحص حرسه وحصّته بنفسه (قبل حدود الدردشة العامة)
      return await handleHtmlCommand(msg, token);
    }
    // الأدوات الدراسية (r86) — كل أداة تفحص حرسها وحصّتها بنفسها
    // (قبل حدود الدردشة العامة) مثل /html تماماً.
    if (command === "/مخطط" || command === "/diagram") {
      return await handleDiagramCommand(msg, token);
    }
    if (command === "/ترجم" || command === "/translate") {
      return await handleTranslateCommand(msg, token);
    }
    if (command === "/تحليل" || command === "/analyze") {
      return await handleAnalyzeCommand(msg, token);
    }
    if (command === "/كشف" || command === "/detect" || command === "/scan") {
      return await handleDetectCommand(msg, token);
    }
    if (command === "/مراجعة" || command === "/review") {
      return await handleReviewCommand(msg, token);
    }

    // 2) حدود الاستخدام (أفضل جهد — لكل نسخة خادم)
    if (msg.from?.id) {
      const limited = rateLimitCheck(msg.from.id);
      if (limited !== null) {
        if (limited) await sendMessageText(token, chatId, limited);
        return "rate-limited";
      }
    }

    // 3) صوت؟ غير مدعوم — ردّ واضح بدل الصمت
    if (msg.voice) {
      await sendMessageText(token, chatId, VOICE_UNSUPPORTED);
      return "handled-fallback";
    }

    // 4) ملف/صورة/فيديو → ترتيب ذكي (تصنيف فقط، بلا تخزين)
    const hasMedia = !!(msg.photo?.length || msg.document || msg.video || msg.audio);
    if (hasMedia) {
      return await classifyAndReply(msg, token);
    }

    // 5) نص → تفكير حقيقي عبر سلسلة المزوّدين
    if (rawText) {
      // مفاجأة المالك أولاً (r81): جواب محسوم بلا ذكاء اصطناعي وبلا تكلفة
      const egg = smartestPersonEgg(rawText);
      if (egg) {
        await sendMessageText(token, chatId, egg);
        rememberTurn(chatId, "user", rawText);
        rememberTurn(chatId, "assistant", egg);
        return "handled-ai";
      }
      if (!isAiConfigured()) {
        await sendMessageText(token, chatId, AI_FALLBACK_TEXT);
        return "handled-fallback";
      }
      await sendTyping(token, chatId);
      const history = conversationFor(chatId);
      const messages: ChatMessage[] = [...history, { role: "user", content: rawText.slice(0, 6000) }];
      try {
        const { answer } = await chatComplete(privateSystemRole(), messages);
        const sent = await sendMessageText(token, chatId, answer);
        rememberTurn(chatId, "user", rawText);
        if (sent) rememberTurn(chatId, "assistant", answer);
        return "handled-ai";
      } catch {
        await sendMessageText(token, chatId, AI_FALLBACK_TEXT);
        return "handled-fallback";
      }
    }

    // 6) لا نص ولا وسائط (رسالة خدمة…)
    await sendMessageText(token, chatId, NO_CONTENT_TEXT);
    return "ignored";
  } catch {
    return "ignored"; // البوت لا يرمي استثناءً أبداً — الويبهوك يبقى 200
  }
}
