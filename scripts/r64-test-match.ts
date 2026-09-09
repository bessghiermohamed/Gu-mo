/**
 * r64 unit test — module matching (ربط منشورات تيليجرام بالمقاييس).
 *
 * Covers the user's bug: «صنّف البوت المنشور لكن لا أجده عند التصفية» —
 * items got an item_type but module_id stayed NULL so every module filter
 * excluded them. r64 adds module matching at three levels:
 *   1) resolveModuleByName / inferModuleFromText (pure, normalized Arabic)
 *   2) heuristicClassify with moduleCandidates (local, no AI key)
 *   3) classifyItem with patched fetch → Gemini returns module_name (AI path)
 *
 * No real network. Run: bun run scripts/r64-test-match.ts
 */

process.env.GEMINI_API_KEY = "test-key-for-r64";
process.env.GEMINI_MODEL = "gemini-3.5-flash"; // سلسلة من عنصر واحد — أسرع
delete process.env.NEXT_PUBLIC_SUPABASE_URL; // مسار بريزما المحلي (لا سابابيز)

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.log(`  ❌ ${name} ${extra}`); }
}

const {
  resolveModuleByName,
  inferModuleFromText,
} = await import("../src/lib/telegram/module-match");
const { classifyItem, heuristicClassify } = await import("../src/lib/telegram/classify");

const MODS = [
  { id: 1, name: "النحو والتطبيق", yearName: "السنة الأولى" },
  { id: 2, name: "الأدب الجاهلي", yearName: "السنة الأولى" },
  { id: 3, name: "البلاغة", yearName: "السنة الأولى" },
  { id: 4, name: "النحو والتطبيق", yearName: "السنة الثانية" }, // تعادل الاسم — تُكسر بالسنة
  { id: 5, name: "برمجة 2", yearName: "السنة الثانية" },
];

// ---------------------------------------------------------------------------
console.log("\n=== A. resolveModuleByName (اسم يعيده الذكاء الاصطناعي) ===");
{
  const m = resolveModuleByName(MODS, "النحو والتطبيق", "");
  check("تطابق تام", m?.id === 1, `got ${m?.id}`);
}
{
  const m = resolveModuleByName(MODS, "نحو والتطبيق", ""); // همزة/تطبيق مطبَّع
  check("تطابق مع تطبيع النص (نحو والتطبيق)", m?.id === 1, `got ${m?.id}`);
}
{
  const m = resolveModuleByName(MODS, "أدب جاهلي", "");
  check("احتواء جزئي (أدب جاهلي ⊂ الأدب الجاهلي)", m?.id === 2, `got ${m?.id}`);
}
{
  const m = resolveModuleByName(MODS, "البرمجة بلغة C", "السنة الثانية");
  check("لا مطابقة لمقياس غير موجود", m === null);
}
{
  const m = resolveModuleByName(MODS, "", "");
  check("اسم فارغ → null", m === null);
}
{
  // تعادل الاسم بين سنتين — السياق يذكر السنة الثانية
  const m = resolveModuleByName(MODS, "النحو والتطبيق", "منشور للسنة الثانية — مقياس النحو");
  check("كسر التعادل بذكر السنة في السياق", m?.id === 4, `got ${m?.id}`);
}
{
  const m = resolveModuleByName(MODS, "برمجة 2", "القناة: ENS — السنة الثانية");
  check("مقياس رقمي قصير يطابق تاما", m?.id === 5, `got ${m?.id}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== B. inferModuleFromText (محلي بلا ذكاء اصطناعي) ===");
{
  const m = inferModuleFromText(MODS, "امتحان النحو والتطبيق الدورة العادية 2025");
  check("اسم المقياس داخل نص المنشور", m?.id === 1, `got ${m?.id}`);
}
{
  const m = inferModuleFromText(MODS, "مرحبا بكم في قناة الطلبة");
  check("رسالة ترحيب بلا مقياس → null", m === null);
}
{
  const m = inferModuleFromText(MODS, "ملخص الأدب الجاهلي للمحاضرة الخامسة");
  check("ملخص الأدب الجاهلي → id 2", m?.id === 2, `got ${m?.id}`);
}
{
  const m = inferModuleFromText([], "امتحان النحو والتطبيق");
  check("قائمة فارغة → null (لا يستقرئ أبداً)", m === null);
}

// ---------------------------------------------------------------------------
console.log("\n=== C. heuristicClassify مع مقاييس مرشحة (بلا مفتاح فعلي) ===");
{
  const r = heuristicClassify({
    kind: "text",
    caption: "امتحان النحو والتطبيق — الدورة العادية",
    moduleCandidates: MODS,
  });
  check("النوع امتحان", r.itemType === "امتحان", `got ${r.itemType}`);
  check("المقياس مربوط محلياً", r.moduleMatch?.id === 1, `got ${r.moduleMatch?.id}`);
}
{
  const r = heuristicClassify({ kind: "text", caption: "مرحبا بكم أيها الطلبة", moduleCandidates: MODS });
  check("ترحيب → بلا مقياس (سلوك صحيح)", r.moduleMatch === null);
}
{
  const r = heuristicClassify({ kind: "pdf", fileName: "برمجة 2 - TD رقم 3.pdf", moduleCandidates: MODS });
  check("اسم المقياس داخل اسم الملف يكفي", r.moduleMatch?.id === 5, `got ${r.moduleMatch?.id}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== D. classifyItem — مسار الذكاء الاصطناعي (fetch مُرقَّع) ===");
const realFetch = globalThis.fetch;
type GeminiCall = { model: string; hasCandidates: boolean; bodyText: string };
const geminiCalls: GeminiCall[] = [];
let geminiResponse: { json: string; status: number } = { json: "{}", status: 200 };

globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  if (u.includes("generativelanguage.googleapis.com")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const parts = body?.contents?.[0]?.parts ?? [];
    const bodyText = parts.map((p: { text?: string }) => p.text ?? "").join("\n");
    geminiCalls.push({ model: u.split("/models/")[1]?.split(":")[0] ?? "", hasCandidates: bodyText.includes("المقاييس المتاحة"), bodyText });
    return new Response(geminiResponse.json, { status: geminiResponse.status, headers: { "Content-Type": "application/json" } });
  }
  return realFetch(url, init);
}) as typeof fetch;

function okJson(fields: Record<string, string>): string {
  return JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(fields) }] } }] });
}

{
  geminiResponse = { json: okJson({ item_type: "امتحان", title: "امتحان النحو والتطبيق", module_name: "النحو والتطبيق", text: "" }), status: 200 };
  const r = await classifyItem({ kind: "text", caption: "امتحان مادة النحو", moduleCandidates: MODS, context: "القناة: ENS" });
  check("AI صنّف امتحاناً", r.aiClassified && r.itemType === "امتحان", `ai=${r.aiClassified} type=${r.itemType}`);
  check("AI ربط المقياس المعاد حرفياً", r.moduleMatch?.id === 1, `got ${r.moduleMatch?.id}`);
  check("قائمة المقاييس داخل البرومبت", geminiCalls.at(-1)?.hasCandidates === true);
}
{
  // الذكاء الاصطناعي يعيد اسماً مطبَّعاً مختلفاً (همزة/تاء مربوطة)
  geminiResponse = { json: okJson({ item_type: "محاضرة", title: "درس الأدب الجاهلي", module_name: "ادب جاهلي", text: "" }), status: 200 };
  const r = await classifyItem({ kind: "text", caption: "درس جديد", moduleCandidates: MODS });
  check("اسم مطبَّع من AI يطابق بالمحتوى", r.moduleMatch?.id === 2, `got ${r.moduleMatch?.id}`);
}
{
  // AI يعيد مقياساً غير موجود → بلا ربط، لا استثناء
  geminiResponse = { json: okJson({ item_type: "إعلان", title: "إعلان عام", module_name: "مقياس غير موجود إطلاقاً", text: "" }), status: 200 };
  const r = await classifyItem({ kind: "text", caption: "اجتماع الطلبة", moduleCandidates: MODS });
  check("مقياس غير موجود → moduleMatch null", r.moduleMatch === null);
}
{
  // AI يعيد module_name فارغاً → null
  geminiResponse = { json: okJson({ item_type: "عام", title: "منشور", module_name: "", text: "" }), status: 200 };
  const r = await classifyItem({ kind: "text", caption: "منشور عام", moduleCandidates: MODS });
  check("module_name فارغ → null", r.moduleMatch === null);
}
{
  // JSON تالف → fallback إلى المحلي — والمقياس يُستنتج من النص
  geminiResponse = { json: JSON.stringify({ candidates: [{ content: { parts: [{ text: "ليس JSON" }] } }] }), status: 200 };
  const r = await classifyItem({ kind: "text", caption: "امتحان النحو والتطبيق", moduleCandidates: MODS });
  check("JSON تالف → heuristic fallback", !r.aiClassified);
  check("heuristic يربط المقياس رغم فشل AI", r.moduleMatch?.id === 1, `got ${r.moduleMatch?.id}`);
}
{
  // بلا مقاييس مرشحة أصلاً (مصدر مربوط بمقياس واحد) — سلوك قديم سليم
  geminiCalls.length = 0;
  geminiResponse = { json: okJson({ item_type: "محاضرة", title: "محاضرة", module_name: "", text: "" }), status: 200 };
  const r = await classifyItem({ kind: "text", caption: "محاضرة جديدة" });
  check("بلا مرشحين → لا قائمة في البرومبت", geminiCalls.at(-1)?.hasCandidates === false);
  check("بلا مرشحين → moduleMatch null", r.moduleMatch === null);
}

globalThis.fetch = realFetch;

console.log(`\n=== النتيجة: ${passed} ناجح / ${failed} فاشل ===`);
process.exit(failed > 0 ? 1 : 0);
