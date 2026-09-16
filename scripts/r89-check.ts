/**
 * r89 — استوديو المولّدات test (bun, no Next.js, no real network).
 *
 * Verifies:
 *   A) Catalog: 8 actions, unique ids, valid pools, min < max, field names
 *   B) validateStudioRequest: accept/reject per action + optional fields
 *   C) studioGuard: study/credentials/study-plus — same examples as bot checks
 *   D) Research: outline parser + outline error + report validator + honesty note
 *   E) Arena: pickArenaProviders (2+/1), single-provider error, display names
 *   F) Limiters: 5 independent pools — gap, daily cap, day rollover (injected clock)
 *   G) Route contract: /api/ai/studio serves all 8 actions + needsConfig + maxDuration
 *   H) UI contract: studio-tool + tools-tab wiring (card, routing, search)
 *
 * Run from the repo root:  bun scripts/r89-check.ts
 */

import {
  STUDIO_ACTIONS,
  findStudioAction,
  validateStudioRequest,
  studioGuard,
  createStudioPoolLimiter,
  STUDIO_POOL_LIMITS,
  parseResearchOutline,
  outlineError,
  validateResearchReport,
  buildResearchOutlineSystem,
  buildResearchReportSystem,
  buildArenaSystem,
  pickArenaProviders,
  arenaSingleProviderError,
  providerDisplayName,
  RESEARCH_MIN_OUTLINE,
  RESEARCH_MAX_OUTLINE,
  RESEARCH_HONESTY_NOTE,
} from "../src/lib/ai/studio";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  ok(name, actual === expected, `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
}
function section(t: string) {
  console.log(`\n——— ${t} ———`);
}

// ---------------------------------------------------------------------------
// A) الكتالوج
// ---------------------------------------------------------------------------

section("A) الكتالوج — الأفعال الثمانية");

eq("8 أدوات بالضبط", STUDIO_ACTIONS.length, 8);
eq("المعرّفات فريدة", new Set(STUDIO_ACTIONS.map((a) => a.id)).size, 8);
const validPools = new Set(["research", "arena", "diagram", "html", "light"]);
ok("كل برك صالحة", STUDIO_ACTIONS.every((a) => validPools.has(a.pool)));
ok("min < max لكل أداة", STUDIO_ACTIONS.every((a) => a.min < a.max));
const validFields = new Set(["topic", "question", "prompt", "text", "code"]);
ok("أسماء الحقول صالحة", STUDIO_ACTIONS.every((a) => validFields.has(a.field)));
ok("الحرس معرّف لكل أداة", STUDIO_ACTIONS.every((a) => a.guard === null || ["study", "credentials", "study-plus"].includes(a.guard)));
eq("بحث موسّع موجود", findStudioAction("research")?.id, "research");
eq("قارن موجود", findStudioAction("arena")?.id, "arena");
eq("أداة مجهولة → null", findStudioAction("nope"), null);
ok("سقف الـ html يطابق بوت (20000ms)", STUDIO_POOL_LIMITS.html.gapMs === 20_000);
ok("سقف البحث الأدنى معقول (≥8 حروف)", (findStudioAction("research")?.min ?? 0) >= 8);

// ---------------------------------------------------------------------------
// B) التحقق من الطلب
// ---------------------------------------------------------------------------

section("B) validateStudioRequest");

const vResearch = validateStudioRequest({ action: "research", topic: "أثر القراءة في التحصيل الدراسي" });
ok("بحث: يقبل موضوعاً سليماً", vResearch.ok && vResearch.body.action === "research");
const vArena = validateStudioRequest({ action: "arena", question: "ما الفرق بين السباتة والعطلة؟" });
ok("قارن: يقبل سؤالاً سليماً", vArena.ok && vArena.body.action === "arena");
const vDiagram = validateStudioRequest({ action: "diagram", prompt: "دورة حياة وثيقة", typeId: "flowchart" });
ok("مخطط: يقبل نوعاً اختيارياً", vDiagram.ok && vDiagram.body.action === "diagram" && (vDiagram.body as { typeId?: string }).typeId === "flowchart");
const vTranslate = validateStudioRequest({ action: "translate", text: "Bonjour le monde", lang: "en" });
ok("ترجمة: تقبل لغة اختيارية", vTranslate.ok && (vTranslate.body as { lang?: string }).lang === "en");
const vReview = validateStudioRequest({ action: "review", code: "function f() { return 1 }", note: "ملاحظة" });
ok("مراجعة: تقبل ملاحظة ≤500", vReview.ok && (vReview.body as { note?: string }).note === "ملاحظة");
const vHtml = validateStudioRequest({ action: "html", prompt: "بطاقة مراجعة للإحصاء", archetypeId: "study-card" });
ok("html: يقبل نمطاً اختيارياً", vHtml.ok && (vHtml.body as { archetypeId?: string }).archetypeId === "study-card");

eq("فشل: فعل مجهول", validateStudioRequest({ action: "x", topic: "abcdefgh" }).ok, false);
eq("فشل: نص مفقود", validateStudioRequest({ action: "research", topic: "   " }).ok, false);
eq("فشل: أقل من الحد", validateStudioRequest({ action: "research", topic: "قصير" }).ok, false);
eq("فشل: أطول من الحد", validateStudioRequest({ action: "research", topic: "م".repeat(301) }).ok, false);
eq("فشل: كشف بنص قصير جداً (120 حرفاً)", validateStudioRequest({ action: "detect", text: "قصير" }).ok, false);
eq("فشل: جسم غير كائن", validateStudioRequest("hello").ok, false);
eq("فشل: حقل خاطئ النوع", validateStudioRequest({ action: "arena", question: 42 }).ok, false);
ok("طلب فاسد لا يحمل جسماً", !validateStudioRequest({ action: "x" }).ok);

// ---------------------------------------------------------------------------
// C) الحرس الأمني — نفس أمثلة فحوص البوت
// ---------------------------------------------------------------------------

section("C) studioGuard — الحرس قبل أي مزوّد");

const g1 = validateStudioRequest({ action: "diagram", prompt: "مخطط لصفحة تجمع كلمات المرور الضحايا" }) as { ok: true; body: { action: "diagram"; prompt: string } };
ok("مخطط: حصاد أسرار يُرفض", typeof studioGuard(g1.body) === "string");
const g2 = validateStudioRequest({ action: "html", prompt: "صفحة تسجيل دخول مزيفة لجمع بيانات المستخدمين" }) as { ok: true; body: { action: "html"; prompt: string } };
ok("html: تصيّد يُرفض", typeof studioGuard(g2.body) === "string");
const g3 = validateStudioRequest({ action: "review", code: "let x = 1; console.log(x);", note: "" }) as { ok: true; body: { action: "review"; code: string; note?: string } };
ok("مراجعة: كود بريء يمر", studioGuard(g3.body) === null);
const g4 = validateStudioRequest({ action: "review", code: "let x = 1; console.log(x);", note: "يجمع كلمات المرور ويرسلها" }) as { ok: true; body: { action: "review"; code: string; note?: string } };
ok("مراجعة: ملاحظة خبيثة تُرفض", typeof studioGuard(g4.body) === "string");
const g5 = validateStudioRequest({ action: "research", topic: "تطور نظرية النشوء في المناهج" }) as { ok: true; body: { action: "research"; topic: string } };
ok("بحث: تحليلي بلا حرس — يمر", studioGuard(g5.body) === null);
const g6 = validateStudioRequest({ action: "arena", question: "اشرح قانون نيوتن الثاني" }) as { ok: true; body: { action: "arena"; question: string } };
ok("قارن: تحليلي بلا حرس — يمر", studioGuard(g6.body) === null);
const g7 = validateStudioRequest({ action: "translate", text: "Bonjour, comment allez-vous?" }) as { ok: true; body: { action: "translate"; text: string } };
ok("ترجمة: بلا حرس — تمر", studioGuard(g7.body) === null);

// ---------------------------------------------------------------------------
// D) بحث موسّع
// ---------------------------------------------------------------------------

section("D) بحث موسّع — الخطّان");

const outlineRaw = [
  "إليك مخططاً مقترحاً:",
  "1. **مفهوم الذكاء الاصطناعي وتعريفه (ما الذي يقع ضمنه؟)**",
  "2. - تطبيقاته في التعليم الجامعي (أين يُستعمل فعلاً؟)",
  "3. * الفرص والتحديات (ما المكاسب والمخاطر؟)",
  "4. آثارها على سوق العمل (ما المهن المتأثرة؟)",
  "5. الخلاصة والتوصيات (ماذا يُنصح الطالب؟)",
  "6. محور زائد سادس (سؤال؟)",
  "7. محور زائد سابع يُقص من السقف (سؤال؟)",
].join("\n");
const outline = parseResearchOutline(outlineRaw);
eq("المخطط: 6 أسطر بعد السقف", outline.length, RESEARCH_MAX_OUTLINE);
ok("نُزعت علامات الماركداون والترقيم طبقةً فوق طبقة", outline.every((l) => !/^\d+[).:]/.test(l) && !l.startsWith("-") && !l.startsWith("*") && !l.includes("**")));
ok("أول سطر تجاهل (تمهيد النموذج)", !outline.some((l) => l.includes("إليك مخططاً")));
eq("مخطط قصير جداً → أقل من الحد الأدنى", parseResearchOutline("جواب قصير").length < RESEARCH_MIN_OUTLINE, true);
ok("رسالة فشل المخطط عربية", outlineError().includes("خطة المحاور"));

const goodReport = [
  "المقدمة: هذا تقرير تحضيري طويل بما يكفي لاجتياز مدقق الطول لأنه يتجاوز الحد الأدنى المطلوب بفارق مريح.",
  ...Array.from(
    { length: 8 },
    (_, i) =>
      `محور ${i + 1}: تفصيل وافٍ بأمثلة توضيحية من الواقع الجامعي الجزائري، مع شرح للمصطلحات وربطها بالمنهاج وملاحظات صادقة عن حدود المعرفة في هذا الموضع تحديداً، وبأمثلة عددية تقريبية مؤطرة بصراحة تامة دون أي ادعاء دقة زائف، وقائمة نقاط عملية يستطيع الطالب اتباعها في مراجعته لهذا الموضع.`
  ),
  "ما يجب التحقق منه: الأرقام المذكورة تقديرية وقد تكون قديمة.",
  "مصادر مقترحة للتوثيق: الكتاب المدرسي الرسمي ودروس الوزارة.",
].join("\n");
eq("تقرير كامل → null", validateResearchReport(goodReport), null);
ok("تقرير قصير → فشل", validateResearchReport("قصير جداً") !== null);
ok("تقرير بلا «ما يجب التحقق منه» → فشل", validateResearchReport(goodReport.replace("ما يجب التحقق منه", "تنبيهات")) !== null);
ok("تقرير بلا «مصادر مقترحة» → فشل", validateResearchReport(goodReport.replace("مصادر مقترحة للتوثيق", "المراجع")) !== null);
ok("تقرير بلا «المقدمة» → فشل", validateResearchReport(goodReport.replace("المقدمة:", "الافتتاح:")) !== null);
ok("ملاحظة الأمانة تذكر تاريخ القطع", RESEARCH_HONESTY_NOTE.includes("تاريخ قطع"));
ok("دور المخطط يطلب أسطراً فقط بلا تمهيد", buildResearchOutlineSystem().includes("بلا مقدمة"));
ok("دور التقرير يمنع الأرقام المخترعة", buildResearchReportSystem().includes("لا تختلق أرقاماً"));
ok("دور التقرير يمنع الروابط المخترعة", buildResearchReportSystem().includes("بلا روابط"));

// ---------------------------------------------------------------------------
// E) قارن النماذج
// ---------------------------------------------------------------------------

section("E) قارن النماذج — مزوّدان بالتوازي");

const pair = pickArenaProviders(["groq", "gemini", "xai"]);
ok("ثلاثة متاحين → أول اثنين", pair?.a === "groq" && pair?.b === "gemini");
eq("مزوّد واحد → null", pickArenaProviders(["groq"]), null);
eq("لا شيء → null", pickArenaProviders([]), null);
ok("رسالة مزوّد وحيد عربية بالاسم", arenaSingleProviderError(["gemini"]).includes("Gemini"));
eq("أسماء العرض", providerDisplayName("xai"), "Grok");
ok("دور القارن يصرّح بتاريخ القطع", buildArenaSystem().includes("تاريخ قطع"));

// ---------------------------------------------------------------------------
// F) الحصص — خمس برك مستقلة بساعة محقونة
// ---------------------------------------------------------------------------

section("F) خمس برك مستقلة (ساعة محقونة)");

{
  let t = 1_000_000;
  const now = () => t;
  const research = createStudioPoolLimiter("research", now);
  const arena = createStudioPoolLimiter("arena", now);
  ok("بركة البحث: أول نداء يمر", research.check(1) === null);
  ok("بركة القارن مستقلة عن البحث", arena.check(1) === null);
  t += 1;
  ok("الفجوة تحرس البركة نفسها", typeof research.check(1) === "string" && research.check(1) !== null);
  const gap = STUDIO_POOL_LIMITS.light.gapMs;
  const light = createStudioPoolLimiter("light", now);
  ok("خفيفة: أول نداء يمر", light.check(9) === null);
  t += gap;
  ok("خفيفة: بعد الفجوة يمر", light.check(9) === null);
  const diagram = createStudioPoolLimiter("diagram", now);
  for (let i = 0; i < STUDIO_POOL_LIMITS.diagram.dailyCap; i++) {
    t += STUDIO_POOL_LIMITS.diagram.gapMs;
    diagram.check(7);
  }
  t += STUDIO_POOL_LIMITS.diagram.gapMs;
  ok("مخطط: السقف اليومي يحرس", typeof diagram.check(7) === "string");
  t += 24 * 60 * 60 * 1000;
  ok("مخطط: اليوم الجديد يصفّر", diagram.check(7) === null);
}

// ---------------------------------------------------------------------------
// G) عقد الشبكة
// ---------------------------------------------------------------------------

section("G) عقد /api/ai/studio");

const routeText = await Bun.file("src/app/api/ai/studio/route.ts").text();
for (const action of ["research", "arena", "diagram", "translate", "arabic", "detect", "review", "html"]) {
  ok(`الشبكة تخدم ${action}`, routeText.includes(`case "${action}"`));
}
ok("needsConfig بعُرف r44", routeText.includes("needsConfig"));
ok("maxDuration 60", routeText.includes("maxDuration = 60"));
ok("الجلسة أولاً (401)", routeText.includes("يجب تسجيل الدخول أولاً"));
ok("الحرس قبل الحصص", routeText.indexOf("studioGuard") < routeText.indexOf("limiters[spec.pool].check"));
ok("chatWithProvider مستورد للقارن", routeText.includes("chatWithProvider"));
ok("مهلة صارمة داخل السقف", routeText.includes("52_000"));

// ---------------------------------------------------------------------------
// H) عقد الواجهة
// ---------------------------------------------------------------------------

section("H) عقد الواجهة — الاستوديو وأدواتي");

const uiText = await Bun.file("src/components/talib/tools/studio-tool.tsx").text();
ok("الواجهة تستدعي /api/ai/studio", uiText.includes('fetch("/api/ai/studio"'));
ok("ملاحظة الأمانة تُعرض مع البحث", uiText.includes("RESEARCH_HONESTY_NOTE") || uiText.includes("note"));
ok("بطاقات القارن بلا فائز تلقائي", uiText.includes("لا يوجد فائز تلقائي"));
ok("صفر تخزين معلن", uiText.includes("صفر تخزين") || uiText.includes("لا يُخزَّن"));
ok("needsConfig شاشة إعداد", uiText.includes("غير مفعّل بعد"));
ok("سلوك دون اتصال محروس", uiText.includes("navigator.onLine"));
ok("نسخ + تنزيل متاحان", uiText.includes("ClipboardCopy") && uiText.includes("Download"));

const tabText = await Bun.file("src/components/talib/tools/tools-tab.tsx").text();
ok("أدواتي: بطاقة استوديو مميزة", tabText.includes("استوديو المولّدات") && tabText.includes('setActiveTool("studio")'));
ok("أدواتي: بحث يستجيب للاستوديو", tabText.includes("matchesStudio"));
ok("أدواتي: دفتر طالب ما يزال مميزاً", tabText.includes('setActiveTool("notebook")'));
ok("أدواتي: الأدوات التسع باقية", (tabText.match(/id: "(gpa|images|compress|merge|extract|counter|timer|compress-img|ocr)"/g) ?? []).length === 9);

// ---------------------------------------------------------------------------

console.log(`\n===== r89: ${pass} passed, ${fail} failed =====`);
if (fail > 0) process.exit(1);
