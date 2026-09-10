/**
 * r71 unit test — خط أنابيب ذكاء المحتوى (استخراج/مطابقة/ثقة/قرار).
 *
 * Covers the owner's PART-15 scenarios at the pure-logic level:
 *   Test 1  «ملخص الإنجليزية - سنة أولى - ملمح ابتدائي»
 *           → clean title + correct year + correct track
 *   Test 2  «محاضرة أحياء ابتدائي» (no year) → curriculum infers the year
 *   Test 3  filename «جمع تكسير.pdf» → curriculum matching narrows by
 *           channel binding; ambiguity flagged
 *   Test 4  image w/ educational text, no caption → OCR text feeds the
 *           deterministic extraction (mocked Gemini vision response)
 *   Test 5  image/file with no useful info → NOT auto-published (skip)
 *   Test 6  ambiguous content → review (never blindly published)
 *   Test 7  correctly classified content → publish + lands in the
 *           year-1 module (student visibility follows the module's year)
 *
 * No real network (fetch mocked). Run: bun run scripts/r71-test-pipeline.ts
 */

process.env.GEMINI_API_KEY = "test-key-r71";
process.env.GEMINI_MODEL = "gemini-3.5-flash"; // single-model chain
delete process.env.NEXT_PUBLIC_SUPABASE_URL;   // Prisma local path (no Supabase)

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.log(`  ❌ ${name} ${extra}`); }
}

const { extractMeta, cleanTitle, matchWithCurriculum, scoreConfidence, decideModeration, isMeaningfulTitle } =
  await import("../src/lib/telegram/pipeline");
const { heuristicClassify } = await import("../src/lib/telegram/classify");
const { looksLikeCourseContent } = await import("../src/lib/telegram/module-match");

/** Curriculum mirror of production specialty 6 (PEP track 13) */
const CANDIDATES = [
  { id: 25, name: "النحو العربي", yearName: "السنة الأولى (PEP)" },
  { id: 32, name: "إنجليزية 1", yearName: "السنة الأولى (PEP)" },
  { id: 33, name: "الأدب العربي قديمًا وحديثًا 1", yearName: "السنة الأولى (PEP)" },
  { id: 13, name: "النحو العربي", yearName: "السنة الثانية (PEP)" },
  { id: 22, name: "اللغة الإنجليزية 1", yearName: "السنة الثانية (PEP)" },
  { id: 18, name: "مدخل إلى علم الأحياء", yearName: "السنة الثانية (PEP)" },
  { id: 19, name: "قضايا النقد", yearName: "السنة الثانية (PEP)" },
  { id: 14, name: "الصرف العربي", yearName: "السنة الثانية (PEP)" },
];

const baseConf = (over: Partial<Parameters<typeof scoreConfidence>[0]>, match: ReturnType<typeof matchWithCurriculum>) =>
  scoreConfidence({
    moduleFromBinding: false,
    match,
    ambiguous: match.ambiguous,
    aiClassified: true,
    meaningfulTitle: true,
    hasOcrText: false,
    hasMedia: true,
    isCourse: true,
    ...over,
  });

// =====================================================
console.log("\n=== 1. الاستخراج الحتمي (extractMeta) ===");
{
  const m1 = extractMeta("ملخص الإنجليزية - سنة أولى - ملمح ابتدائي");
  check("السنة الأولى تُستخرج", m1.yearOrdinal === 1, JSON.stringify(m1));
  check("الملمح الابتدائي PEP", m1.trackCode === "PEP");
  check("النوع ملخص", m1.typeHint === "ملخص");

  const m2 = extractMeta("برنامج قضايا النقد السنة الثانية");
  check("السنة الثانية تُستخرج", m2.yearOrdinal === 2);

  const m3 = extractMeta("محاضرة أحياء ملمح متوسط");
  check("الملمح المتوسط PEM", m3.trackCode === "PEM");
  check("لا سنة مذكورة → null", m3.yearOrdinal === null);

  const m4 = extractMeta("امتحان الفصل الثاني في الصرف");
  check("الفصل الثاني", m4.semester === 2, JSON.stringify(m4));

  const m5 = extractMeta("السداسي الأول: أعمال موجهة");
  check("السداسي الأول", m5.semester === 1);

  const m6 = extractMeta("تمرين عادي بلا بيانات");
  check("بلا سنة/ملمح/فصل", m6.yearOrdinal === null && m6.trackCode === null && m6.semester === null);

  const m7 = extractMeta("ملخص إنجليزية 1 سنة اولى pep");
  check("الصيغة بلا فواصل (pep ملتصقة)", m7.yearOrdinal === 1 && m7.trackCode === "PEP", JSON.stringify(m7));
}

// =====================================================
console.log("\n=== 2. تنظيف العنوان (cleanTitle) — Test 1 ===");
{
  check(
    "«ملخص الإنجليزية - سنة أولى - ملمح ابتدائي» → «ملخص الإنجليزية»",
    cleanTitle("ملخص الإنجليزية - سنة أولى - ملمح ابتدائي") === "ملخص الإنجليزية",
    JSON.stringify(cleanTitle("ملخص الإنجليزية - سنة أولى - ملمح ابتدائي"))
  );
  check(
    "«ملخص النحو العربي سنة أولى» → «ملخص النحو العربي»",
    cleanTitle("ملخص النحو العربي سنة أولى") === "ملخص النحو العربي",
    JSON.stringify(cleanTitle("ملخص النحو العربي سنة أولى"))
  );
  check(
    "«ملخص إنجليزية 1 سنة اولى pep» → «ملخص إنجليزية 1»",
    cleanTitle("ملخص إنجليزية 1 سنة اولى pep") === "ملخص إنجليزية 1",
    JSON.stringify(cleanTitle("ملخص إنجليزية 1 سنة اولى pep"))
  );
  check("عنوان نظيف لا يُمس", cleanTitle("جمع التكسير") === "جمع التكسير");
  check(
    "«امتحان الفصل الثاني» → «امتحان»",
    cleanTitle("امتحان الفصل الثاني") === "امتحان",
    JSON.stringify(cleanTitle("امتحان الفصل الثاني"))
  );
}

// =====================================================
console.log("\n=== 3. مطابقة المنهاج (matchWithCurriculum) ===");
// Test 1 scenario: post says year 1 + PEP in a channel bound to year 2
{
  const ext = extractMeta("ملخص إنجليزية 1 سنة اولى pep");
  const m = matchWithCurriculum(CANDIDATES, {
    moduleName: "إنجليزية 1",
    extracted: ext,
    sourceYearOrdinal: 2, // القناة مربوطة بالسنة الثانية (حالة الإنتاج)
    sourceTrackCode: "PEP",
  });
  check("يختار مقياس السنة الأولى (#32)", m.module?.id === 32, JSON.stringify(m.module));
  check("اتفاق السنة صريح", m.yearAgreement === "exact");
  check("اتفاق الممح صريح", m.trackAgreement === "exact");
  check("لا غموض بعد الترجيح", m.ambiguous === false);
}
// Same name in two years, no year mentioned anywhere → ambiguous
{
  const m = matchWithCurriculum(CANDIDATES, {
    moduleName: "النحو العربي",
    extracted: { yearOrdinal: null, trackCode: null, semester: null, lessonHint: null, typeHint: null },
    sourceYearOrdinal: null,
    sourceTrackCode: null,
  });
  check("بلا سنة → مرشحان يبقيان (غموض)", m.ambiguous === true);
  check("اتفاق مجهول", m.yearAgreement === "unknown");
}
// Source binding narrows when the post is silent
{
  const m = matchWithCurriculum(CANDIDATES, {
    moduleName: "النحو العربي",
    extracted: { yearOrdinal: null, trackCode: null, semester: null, lessonHint: null, typeHint: null },
    sourceYearOrdinal: 2,
    sourceTrackCode: "PEP",
  });
  check("ربط القناة يرجّح سنة الثانية (#13)", m.module?.id === 13, JSON.stringify(m.module));
  check("اتفاق مستنتج من ربط القناة", m.yearAgreement === "inferred");
}
// Test 2 scenario: «محاضرة أحياء ابتدائي» — biology exists ONLY in year 2
{
  const ext = extractMeta("محاضرة أحياء ابتدائي");
  const m = matchWithCurriculum(CANDIDATES, {
    moduleName: "مدخل إلى علم الأحياء",
    extracted: ext,
    sourceYearOrdinal: null,
    sourceTrackCode: null,
  });
  check("الأحياء في السنة الثانية (#18)", m.module?.id === 18);
  check("لا غموض (اسم فريد في المنهاج)", m.ambiguous === false);
}
// Explicit conflict: post says year 1, module only exists in year 2
{
  const ext = extractMeta("ملخص مدخل إلى علم الأحياء سنة أولى");
  const m = matchWithCurriculum(CANDIDATES, {
    moduleName: "مدخل إلى علم الأحياء",
    extracted: ext,
    sourceYearOrdinal: null,
    sourceTrackCode: null,
  });
  check("التعارض يُكتشف", m.yearAgreement === "conflict", m.yearAgreement ?? "");
}
// Test 3 scenario: filename «جمع تكسير.pdf» — no module name; AI infers النحو العربي
{
  // AI returns module_name "النحو العربي" from lesson knowledge
  const ext = extractMeta("جمع تكسير.pdf");
  const m = matchWithCurriculum(CANDIDATES, {
    moduleName: "النحو العربي",
    extracted: ext, // year null
    sourceYearOrdinal: 1, // channel bound to year 1
    sourceTrackCode: "PEP",
  });
  check("درس جمع التكسير → النحو العربي لسنة القناة (#25)", m.module?.id === 25, JSON.stringify(m.module));
}

// =====================================================
console.log("\n=== 4. الثقة والقرار (scoreConfidence + decideModeration) ===");
{
  const noMatch = { module: null, yearAgreement: "unknown" as const, trackAgreement: "unknown" as const, ambiguous: false, reason: "لا مطابقة" };
  const exact = matchWithCurriculum(CANDIDATES, {
    moduleName: "إنجليزية 1",
    extracted: extractMeta("ملخص إنجليزية 1 سنة اولى pep"),
    sourceYearOrdinal: 2,
    sourceTrackCode: "PEP",
  });
  const conflict = matchWithCurriculum(CANDIDATES, {
    moduleName: "مدخل إلى علم الأحياء",
    extracted: extractMeta("ملخص الأحياء سنة أولى"),
    sourceYearOrdinal: null,
    sourceTrackCode: null,
  });
  const amb = matchWithCurriculum(CANDIDATES, {
    moduleName: "النحو العربي",
    extracted: { yearOrdinal: null, trackCode: null, semester: null, lessonHint: null, typeHint: null },
    sourceYearOrdinal: null,
    sourceTrackCode: null,
  });

  const cExact = baseConf({}, exact);
  const cConflict = baseConf({}, conflict);
  const cAmb = baseConf({}, amb);
  const cNoMatch = baseConf({ hasMedia: false, meaningfulTitle: true }, noMatch);
  const cBinding = scoreConfidence({
    moduleFromBinding: true, match: noMatch, ambiguous: false,
    aiClassified: true, meaningfulTitle: true, hasOcrText: false, hasMedia: true, isCourse: true,
  });

  check("ربط إداري ≈ 95", cBinding.score >= 90, String(cBinding.score));
  check("مطابقة صريحة ≥ 70", cExact.score >= 70, String(cExact.score));
  check("تعارض أقل من الصريح", cConflict.score < cExact.score, `${cConflict.score} < ${cExact.score}`);
  check("غموض أقل من الصريح", cAmb.score < cExact.score, `${cAmb.score} < ${cExact.score}`);
  check("بلا مطابقة منخفضة", cNoMatch.score < 40, String(cNoMatch.score));

  // Test 5: image with NO useful info → skip for library (never auto-publish)
  const d5 = decideModeration(
    { moduleFromBinding: false, match: noMatch, ambiguous: false, aiClassified: false, meaningfulTitle: false, hasOcrText: false, hasMedia: true, isCourse: true },
    { isLibrarySource: true, columnsReady: true }
  );
  check("وسائط بلا أي معلومة → مراجعة (لا نشر تلقائي)", d5 === "review", d5);
  const d5b = decideModeration(
    { moduleFromBinding: false, match: noMatch, ambiguous: false, aiClassified: false, meaningfulTitle: false, hasOcrText: false, hasMedia: false, isCourse: true },
    { isLibrarySource: true, columnsReady: true }
  );
  check("نص بلا أي معلومة → رفض", d5b === "skip", d5b);

  // Test 6: ambiguous → review
  const d6 = decideModeration(
    { moduleFromBinding: false, match: amb, ambiguous: true, aiClassified: true, meaningfulTitle: true, hasOcrText: false, hasMedia: true, isCourse: true },
    { isLibrarySource: true, columnsReady: true }
  );
  check("غموض → مراجعة", d6 === "review", d6);

  // conflict → review
  const d6b = decideModeration(
    { moduleFromBinding: false, match: conflict, ambiguous: false, aiClassified: true, meaningfulTitle: true, hasOcrText: false, hasMedia: true, isCourse: true },
    { isLibrarySource: true, columnsReady: true }
  );
  check("تعارض → مراجعة", d6b === "review", d6b);

  // Test 7: exact match → publish
  const d7 = decideModeration(
    { moduleFromBinding: false, match: exact, ambiguous: false, aiClassified: true, meaningfulTitle: true, hasOcrText: false, hasMedia: true, isCourse: true },
    { isLibrarySource: true, columnsReady: true }
  );
  check("مطابقة صريحة → نشر", d7 === "publish", d7);

  // غير المحتوى الدراسي → رفض للمكتبة
  const dGate = decideModeration(
    { moduleFromBinding: false, match: noMatch, ambiguous: false, aiClassified: true, meaningfulTitle: true, hasOcrText: false, hasMedia: false, isCourse: false },
    { isLibrarySource: true, columnsReady: true }
  );
  check("ليس محتوى دراسياً → رفض", dGate === "skip", dGate);

  // مساحة الفوج: وعد r67 — يبقى مرئياً (review) لا يُحذف
  const dShared = decideModeration(
    { moduleFromBinding: false, match: noMatch, ambiguous: false, aiClassified: false, meaningfulTitle: false, hasOcrText: false, hasMedia: false, isCourse: false },
    { isLibrarySource: false, columnsReady: true }
  );
  check("مساحة الفوج: حتى غير الدراسي → مراجعة (مرئي للفوج)", dShared === "review", dShared);

  // قبل أعمدة SQL: مراجعة المكتبة تسقط إلى رفض (سلوك ما قبل r71)
  const dPre = decideModeration(
    { moduleFromBinding: false, match: noMatch, ambiguous: false, aiClassified: false, meaningfulTitle: false, hasOcrText: false, hasMedia: true, isCourse: true },
    { isLibrarySource: true, columnsReady: false }
  );
  check("قبل SQL: مراجعة المكتبة → رفض (توافق خلفي)", dPre === "skip", dPre);
}

// =====================================================
console.log("\n=== 5. المسار الكامل عبر Gemini مُحاكى (Test 1 + Test 4) ===");
{
  // Mock Gemini: returns structured JSON per the r71 prompt
  const realFetch = globalThis.fetch;
  let lastPrompt = "";
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    lastPrompt = body;
    return new Response(
      JSON.stringify({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({
            is_course: true,
            item_type: "ملخص",
            title: "ملخص الإنجليزية",
            module_name: "إنجليزية 1",
            year: 1,
            track: "PEP",
            semester: 0,
            lesson: "",
            confidence: 92,
            text: "",
          }) }] },
        }],
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  const { classifyItem } = await import("../src/lib/telegram/classify");
  const cls = await classifyItem({
    kind: "text",
    caption: "ملخص الإنجليزية - سنة أولى - ملمح ابتدائي",
    fileName: "",
    moduleCandidates: CANDIDATES,
    context: "القناة: Alk",
  });

  check("محرك Gemini", cls.engine === "gemini");
  check("Test 1: العنوان نظيف", cls.title === "ملخص الإنجليزية", cls.title);
  check("Test 1: السنة 1", cls.extracted.yearOrdinal === 1);
  check("Test 1: الممح PEP", cls.extracted.trackCode === "PEP");
  check("Test 1: المقياس مرشح بالاسم", cls.moduleMatch?.id === 32 || cls.moduleMatch?.name === "إنجليزية 1", JSON.stringify(cls.moduleMatch));
  check("البرومبت يطلب الحقول المنظمة", lastPrompt.includes("year") && lastPrompt.includes("track") && lastPrompt.includes("lesson") && lastPrompt.includes("module_name"));

  // Test 4: image with educational text (vision OCR) — OCR text mentions the year
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({
            is_course: true,
            item_type: "تمارين",
            title: "تمارين جمع التكسير",
            module_name: "النحو العربي",
            year: 0,
            track: "",
            semester: 0,
            lesson: "جمع التكسير",
            confidence: 85,
            text: "السنة الأولى — النحو العربي — تمارين على جمع التكسير: مفرده وجمعه",
          }) }] },
        }],
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  const cls4 = await classifyItem({
    kind: "image",
    caption: "",             // no caption — everything comes from vision
    fileName: "",
    imageBase64: "dGVzdA==", // 4 bytes fake image
    imageMimeType: "image/jpeg",
    moduleCandidates: CANDIDATES,
    context: "القناة: Alk",
  });
  check("Test 4: نص الصورة يغذي الاستخراج (سنة 1 من OCR)", cls4.extracted.yearOrdinal === 1, JSON.stringify(cls4.extracted));
  check("Test 4: العنوان من الصورة", cls4.title === "تمرين جمع التكسير" || cls4.title.includes("جمع التكسير"), cls4.title);
  check("Test 4: الدرس مستخرج", cls4.extracted.lessonHint === "جمع التكسير");
  check("Test 4: النوع تمارين", cls4.itemType === "تمارين");

  // Match over the OCR-derived extraction with a year-2-bound channel → conflict → review
  const m4 = matchWithCurriculum(CANDIDATES, {
    moduleName: cls4.moduleMatch?.name ?? "النحو العربي",
    extracted: cls4.extracted,
    sourceYearOrdinal: 2,
    sourceTrackCode: "PEP",
  });
  check("Test 4: نص الصورة يفوز على ربط القناة (سنة أولى → مقياس سنة أولى)", m4.yearAgreement === "exact", m4.yearAgreement ?? "");
  check("Test 4: تعارض الربط يُسجَّل تنبيهاً للمشرف", m4.reason.includes("تنبيه") && m4.reason.includes("ربوطة") || m4.reason.includes("من سنة 1"), m4.reason);
  check("Test 4: لكن مقياس السنة الأولى هو المختار", m4.module?.id === 25, JSON.stringify(m4.module));

  globalThis.fetch = realFetch;
}

// =====================================================
console.log("\n=== 6. المسار المحلي (heuristic) بالاستخراج الجديد ===");
{
  const oldKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY; // force heuristic
  const { classifyItem } = await import("../src/lib/telegram/classify");

  const cls = await classifyItem({
    kind: "pdf",
    caption: "ملخص النحو العربي سنة أولى",
    fileName: "ملخص النحو العربي.pdf",
    moduleCandidates: CANDIDATES,
    context: "القناة: Alk — مربوطة بالسنة الثانية",
  });
  check("محرك محلي", cls.engine === "heuristic");
  check("استخراج السنة حتى محلياً", cls.extracted.yearOrdinal === 1);
  check("العنوان منظف حتى محلياً", cls.title === "ملخص النحو العربي", cls.title);
  check("مطابقة محلية تجد النحو العربي", cls.moduleMatch != null);

  process.env.GEMINI_API_KEY = oldKey;
}

// =====================================================
console.log("\n=== 7. بوابة المحتوى القديمة ما زالت سليمة (انحدار r65) ===");
{
  check("«لدينا عشرة مقاييس لكن ليست الهندسة» ليست محتوى",
    !looksLikeCourseContent({ text: "لدينا عشرة مقاييس لكن ليست الهندسة المعمارية", fileName: "", moduleName: "الهندسة المعمارية", hasMedia: false }));
  check("ملف PDF دائماً محتوى",
    looksLikeCourseContent({ text: "", fileName: "درس.pdf", moduleName: "", hasMedia: true }));
  check("«ملخص الإنجليزية» محتوى (الاسم الكامل في النص)",
    looksLikeCourseContent({ text: "ملخص الإنجليزية — إنجليزية 1", fileName: "", moduleName: "إنجليزية 1", hasMedia: false }));
  check("ذِكر اسم المقياس كاملاً داخل نص أطول محتوى",
    looksLikeCourseContent({ text: "نرفع لكم ملخص مقياس النحو والتطبيق مفصلاً", fileName: "", moduleName: "النحو والتطبيق", hasMedia: false }));
}

// =====================================================
console.log(`\n=== النتيجة: ${passed} ✅ / ${failed} ❌ ===`);
if (failed > 0) process.exit(1);
