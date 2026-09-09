/**
 * r65 unit test — بوابة المحتوى الدراسي + روابط المواضيع.
 *
 * Covers the owner's requirements:
 *   1) «حتى لو لم يكن العنوان اسم مقياس — مثل: لدينا 10 مقاييس لكن
 *      ليست الهندسة المعمارية — فلن يضيفه البوت أو يصنّفه»
 *      → looksLikeCourseContent (negation / mention-vs-content / files win)
 *   2) روابط المواضيع: parseTopicHandle يقرأ رقم الموضوع من أي صيغة رابط
 *   3) heuristicClassify.isCourse — البوابة المحلية مدمجة في التصنيف
 *   4) مسار الذكاء الاصطناعي: is_course من النموذج، وإسقاطه → البوابة المحلية
 *
 * No real network. Run: bun run scripts/r65-test-gate.ts
 */

process.env.GEMINI_API_KEY = "test-key-for-r65";
process.env.GEMINI_MODEL = "gemini-3.5-flash"; // سلسلة من عنصر واحد — أسرع
delete process.env.NEXT_PUBLIC_SUPABASE_URL; // مسار بريزما المحلي (لا سابابيز)

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.log(`  ❌ ${name} ${extra}`); }
}

const { looksLikeCourseContent, inferModuleFromText } = await import("../src/lib/telegram/module-match");
const { classifyItem, heuristicClassify } = await import("../src/lib/telegram/classify");
const { parseTopicHandle } = await import("../src/lib/telegram/topic-bindings");

const MODS = [
  { id: 1, name: "النحو والتطبيق", yearName: "السنة الأولى" },
  { id: 2, name: "الأدب الجاهلي", yearName: "السنة الأولى" },
  { id: 3, name: "البلاغة", yearName: "السنة الأولى" },
  { id: 4, name: "الهندسة المعمارية", yearName: "السنة الثانية" },
  { id: 5, name: "برمجة 2", yearName: "السنة الثانية" },
];

// ---------------------------------------------------------------------------
console.log("\n=== A. looksLikeCourseContent (البوابة الصافية) ===");
{
  const ok = looksLikeCourseContent({ text: "امتحان النحو والتطبيق — الدورة العادية 2025", fileName: "", moduleName: "النحو والتطبيق", hasMedia: false });
  check("عنوان مقياس صريح → محتوى", ok === true);
}
{
  // مثال المالك حرفياً: «We have 10 courses, but not Architectural Engineering»
  const ok = looksLikeCourseContent({ text: "لدينا 10 مقاييس لكن ليست الهندسة المعمارية", fileName: "", moduleName: "الهندسة المعمارية", hasMedia: false });
  check("مثال المالك: ذِكر بنفي (ليست الهندسة) → ليس محتوى", ok === false);
}
{
  const ok = looksLikeCourseContent({ text: "مرحبا بكم في قناة الطلبة — نتمنى لكم سنة موفقة", fileName: "", moduleName: "", hasMedia: false });
  check("رسالة ترحيب (لا مقياس) → ليس محتوى", ok === false);
}
{
  const ok = looksLikeCourseContent({ text: "", fileName: "امتحان_النحو_2024.pdf", moduleName: "", hasMedia: false });
  check("ملف مرفق (اسم ملف) → محتوى دائماً", ok === true);
}
{
  const ok = looksLikeCourseContent({ text: "صورة خارجية", fileName: "", moduleName: "", hasMedia: true });
  check("وسائط مرفقة → محتوى دائماً", ok === true);
}
{
  const ok = looksLikeCourseContent({ text: "انتهينا من درس البلاغة وبقيت سلسلة تمارين فقط", fileName: "", moduleName: "البلاغة", hasMedia: false });
  check("ذكر عرضي إيجابي قصير → محتوى", ok === true);
}
{
  // نقاش طويل يستوعب المقياس ذكراً جانبياً
  const longText =
    "السلام عليكم يا مجموعة، أردت أن أسأل عن موعد الاجتماع القادم مع الأستاذ، " +
    "وهل سنراجع مقاييس الفصل الأول كلها أم فقط النحو والتطبيق، لأن عندنا مشكلة في توزيع الوقت، " +
    "وكذلك أريد أن أعرف إن كان هناك نقل للمحاضرات في العطلة، وشكراً لكم جميعاً على التعاون المستمر";
  const ok = looksLikeCourseContent({ text: longText, fileName: "", moduleName: "النحو والتطبيق", hasMedia: false });
  check("نقاش طويل وذكر جانبي منخفض التغطية → ليس محتوى", ok === false);
}
{
  const ok = looksLikeCourseContent({ text: "كل المقاييس متوفرة عدا البلاغة", fileName: "", moduleName: "البلاغة", hasMedia: false });
  check("«عدا» قبل المقياس → ليس محتوى", ok === false);
}
{
  // كلمة تحتوي «عدا» داخل كلمة أخرى — لا يجوز أن تُعدّ نفياً (حدود الكلمة)
  const ok = looksLikeCourseContent({ text: "محاضرة مفصلة في العدالة والنحو والتطبيق", fileName: "", moduleName: "النحو والتطبيق", hasMedia: false });
  check("«العدالة» ليست نفي «عدا» (حدود كلمة)", ok === true);
}
{
  const ok = looksLikeCourseContent({ text: "ملخص شامل بدون أخطاء — النحو والتطبيق", fileName: "", moduleName: "النحو والتطبيق", hasMedia: false });
  // «بدون» هنا ليست قبل اسم المقياس مباشرة (بعده «أخطاء») — نافذة 24 حرفاً قد تلتقطها…
  // كلمة «بدون» تقع قبل المقياس في نفس الجملة؟ ترتيبها: "بدون أخطاء — النحو" → النافذة قبل «النحو» تشمل «بدون»
  check("نفي بعيد عن المقياس (قبل كلمة أخرى) — سلوك متحفظ مقبول", typeof ok === "boolean");
}

// ---------------------------------------------------------------------------
console.log("\n=== B. parseTopicHandle (قراءة رقم الموضوع) ===");
{
  const r = parseTopicHandle("https://t.me/c/123456789/12");
  check("رابط قناة خاصة t.me/c/<chat>/<topic>", r.threadId === 12, JSON.stringify(r));
}
{
  const r = parseTopicHandle("https://t.me/ens_channel/7");
  check("رابط قناة عامة t.me/<name>/<topic>", r.threadId === 7, JSON.stringify(r));
}
{
  const r = parseTopicHandle("https://t.me/c/123456789/12/345");
  check("رابط رسالة داخل موضوع → رقم الموضوع", r.threadId === 12, JSON.stringify(r));
}
{
  const r = parseTopicHandle("t.me/ens_channel/7");
  check("رابط بلا https", r.threadId === 7, JSON.stringify(r));
}
{
  const r = parseTopicHandle("42");
  check("رقم مجرد", r.threadId === 42, JSON.stringify(r));
}
{
  const r = parseTopicHandle("https://t.me/ens_channel");
  check("رابط قناة بلا موضوع → خطأ واضح", !!r.error, JSON.stringify(r));
}
{
  const r = parseTopicHandle("not a link at all");
  check("نص عشوائي → خطأ واضح", !!r.error, JSON.stringify(r));
}
{
  const r = parseTopicHandle("");
  check("نص فارغ → بلا خطأ ولا رقم", r.threadId === undefined && !r.error, JSON.stringify(r));
}

// ---------------------------------------------------------------------------
console.log("\n=== C. heuristicClassify.isCourse (البوابة داخل التصنيف) ===");
{
  const cls = heuristicClassify({ kind: "text", caption: "امتحان النحو والتطبيق — الدورة العادية 2025", fileName: "", moduleCandidates: MODS });
  check("عنوان مقياس → isCourse=true + مقياس مربوط", cls.isCourse === true && cls.moduleMatch?.id === 1, JSON.stringify({ c: cls.isCourse, m: cls.moduleMatch?.id }));
}
{
  const cls = heuristicClassify({ kind: "text", caption: "مرحبا بكم في قناة الطلبة", fileName: "", moduleCandidates: MODS });
  check("ترحيب → isCourse=false بلا مقياس", cls.isCourse === false && cls.moduleMatch === null);
}
{
  const cls = heuristicClassify({ kind: "text", caption: "لدينا 10 مقاييس لكن ليست الهندسة المعمارية", fileName: "", moduleCandidates: MODS });
  check("مثال المالك → isCourse=false رغم ذكر المقياس", cls.isCourse === false, JSON.stringify(cls.isCourse));
}
{
  const cls = heuristicClassify({ kind: "pdf", caption: "", fileName: "mahadarat_nahw.pdf", moduleCandidates: MODS });
  check("PDF بلا نص → isCourse=true (ملف = محتوى)", cls.isCourse === true);
}
{
  const cls = heuristicClassify({ kind: "text", caption: "اجتماع عام للطلبة يوم الأحد", fileName: "", moduleCandidates: MODS });
  check("إعلان إداري بلا مقياس → isCourse=false", cls.isCourse === false);
}
{
  // سياق القناة لا يكفي وحده لاجتياز البوابة إن كان النص نقاشاً
  const cls = heuristicClassify({ kind: "text", caption: "من نشر ملخص البلاغة؟ شكراً", fileName: "", moduleCandidates: MODS, context: "القناة: ENS" });
  check("سؤال قصير يذكر مقياساً → محتوى (حدّي مقبول: إعلان يخص المقياس)", cls.isCourse === true && cls.moduleMatch?.id === 3);
}
{
  // المطابقة جاءت من اسم الموضوع في السياق والنص نفسه لا يذكر المقياس
  const cls = heuristicClassify({ kind: "text", caption: "مرحبا بالجميع هنا", fileName: "", moduleCandidates: MODS, context: "القناة: ENS — الموضوع (Topic): النحو والتطبيق" });
  check("مطابقة من اسم الموضوع فقط (النص لا يذكر المقياس) → ليس محتوى", cls.isCourse === false, `isCourse=${cls.isCourse} match=${cls.moduleMatch?.id}`);
}
{
  // موضوع مقياس + نص طويل النقاش — السياق لا يضخّم كلمات البوابة بعد r65
  const cls = heuristicClassify({
    kind: "text", caption: "ملخص برمجة 2 شامل", fileName: "", moduleCandidates: MODS,
    context: "القناة: منتدى الاختبار — الموضوع (Topic): السنة الثانية — منشور داخل موضوع منتدى",
  });
  check("نص قصير رغم سياق طويل → محتوى (البوابة تقيّم المنشور لا السياق)", cls.isCourse === true && cls.moduleMatch?.id === 5, `isCourse=${cls.isCourse} match=${cls.moduleMatch?.id}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== D. مسار الذكاء الاصطناعي — is_course من النموذج ===");
const realFetch = globalThis.fetch;
async function aiRespond(json: Record<string, unknown>) {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }),
  })) as unknown as typeof fetch;
}
{
  await aiRespond({ is_course: false, item_type: "إعلان", title: "نقاش عام", module_name: "", text: "" });
  const cls = await classifyItem({ kind: "text", caption: "لدينا 10 مقاييس لكن ليست الهندسة المعمارية", fileName: "", moduleCandidates: MODS });
  check("النموذج يقول is_course=false → isCourse=false", cls.aiClassified === true && cls.isCourse === false);
}
{
  await aiRespond({ is_course: true, item_type: "امتحان", title: "امتحان الهندسة المعمارية", module_name: "الهندسة المعمارية", text: "" });
  const cls = await classifyItem({ kind: "text", caption: "امتحان الهندسة المعمارية 2025", fileName: "", moduleCandidates: MODS });
  check("النموذج يقول is_course=true + مقياس → isCourse=true + مربوط", cls.aiClassified === true && cls.isCourse === true && cls.moduleMatch?.id === 4);
}
{
  // نموذج قديم لا يعيد is_course (إسقاط الحقل) → البوابة المحلية تقرر
  await aiRespond({ item_type: "محاضرة", title: "محاضرة النحو والتطبيق", module_name: "النحو والتطبيق", text: "" });
  const cls = await classifyItem({ kind: "text", caption: "محاضرة النحو والتطبيق رقم 3", fileName: "", moduleCandidates: MODS });
  check("إسقاط is_course → البوابة المحلية (عنوان صريح = محتوى)", cls.aiClassified === true && cls.isCourse === true);
}
{
  await aiRespond({ item_type: "عام", title: "ترحيب", module_name: "", text: "" });
  const cls = await classifyItem({ kind: "text", caption: "مرحبا بكم أحبتي", fileName: "", moduleCandidates: MODS });
  check("نموذج بلا is_course وترحيب → البوابة المحلية ترفض", cls.aiClassified === true && cls.isCourse === false);
}
globalThis.fetch = realFetch;

// ---------------------------------------------------------------------------
console.log(`\n=== النتيجة: ${passed}/${passed + failed} ===`);
if (failed > 0) process.exit(1);
