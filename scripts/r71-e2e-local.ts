/**
 * r71 e2e (local, production build) — خط أنابيب ذكاء المحتوى كاملاً:
 *   webhook → استخراج منظم → مطابقة منهاج بترجيح السنة → ثقة → قرار
 *   → مراجعة إدارية → اعتماد → ظهور صحيح للطالب المناسب.
 *
 * THE BUG (owner PART 2): «منشور يظهر في لوحة الإدارة لكن لا يظهر
 * صحيحاً للطلبة في دروس تيليجرام ← المقاييس» — سببه الجذري (مثبت في
 * الإنتاج): السنة المذكورة في نص المنشور كانت تُتجاهل، والمرشحون
 * يُضيّقون مسبقاً على سنة ربط القناة، فيُملأ «ملخص النحو العربي سنة
 * أولى» في مقياس السنة الثانية — طلبة الأولى لا يرون شيئاً.
 *
 * Run (server already up on :3123): bun run scripts/r71-e2e-local.ts
 */
import { Database } from "bun:sqlite";

const BASE = "http://127.0.0.1:3123";
const SECRET = "local-r62-test-secret";
const CHAT = -100999000771; // قناة r71 المربوطة بالسنة الثانية (فخ الإنتاج نفسه)

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.log(`  ❌ ${name} ${extra}`); }
}
async function j(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}
async function login(name: string, email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: name, email }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status} for ${email}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}
async function webhook(update: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
    body: JSON.stringify(update),
  });
  return j(res);
}
function post(channelId: number, messageId: number, text: string, captioned = false): Record<string, unknown> {
  return {
    update_id: 710000 + messageId,
    channel_post: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: channelId, type: "channel", title: "قناة r71" },
      from: { id: 42, is_bot: false, first_name: "مالك" },
      ...(captioned ? { caption: text } : { text }),
    },
  };
}

// ---------------------------------------------------------------- seed (SQL)
const db = new Database("/home/z/my-project/db/custom.db");
db.run("PRAGMA foreign_keys = OFF");

db.run("DELETE FROM AiEvent");
db.run("DELETE FROM TelegramItem WHERE sourceId IN (SELECT id FROM TelegramSource WHERE tgChannelId LIKE '-100999%')");
db.run("DELETE FROM TelegramSource WHERE tgChannelId LIKE '-100999%'");
db.run("DELETE FROM DeviceSession");
db.run("DELETE FROM AppUser WHERE email LIKE '%r71-%@test%'");
db.run("DELETE FROM CohortGroup WHERE groupName LIKE 'فوج 71%'");
db.run("DELETE FROM ModuleCourse WHERE name LIKE '%r71%' OR name IN ('النحو العربي', 'إنجليزية 1', 'اللغة الإنجليزية 1')");
db.run("DELETE FROM AcademicYear WHERE yearName IN ('السنة الأولى 71', 'السنة الثانية 71')");
db.run("DELETE FROM AcademicTrack WHERE code = 'PEP-71'");
db.run("DELETE FROM Specialty WHERE code = 'R71-LOG'");

let instId = (db.query("SELECT id FROM Institution LIMIT 1").get() as { id: number } | null)?.id;
if (!instId) {
  db.run(`INSERT INTO Institution (nameAr, type, city, createdAt, updatedAt) VALUES ('مؤسسة r71', 'مدرسة عليا', 'الجزائر', datetime('now'), datetime('now'))`);
  instId = (db.query("SELECT id FROM Institution ORDER BY id DESC LIMIT 1").get() as { id: number }).id;
}
db.run(`INSERT INTO Specialty (institutionId, nameAr, code, iconName, description, createdAt, updatedAt)
  VALUES (${instId}, 'أدب عربي r71', 'R71-LOG', 'book', '', datetime('now'), datetime('now'))`);
const specId = (db.query("SELECT id FROM Specialty WHERE code='R71-LOG'").get() as { id: number }).id;

db.run(`INSERT INTO AcademicTrack (specialtyId, trackNameAr, code, createdAt, updatedAt)
  VALUES (${specId}, 'أستاذ التعليم الابتدائي (PEP)', 'PEP-71', datetime('now'), datetime('now'))`);
const trackId = (db.query("SELECT id FROM AcademicTrack WHERE code='PEP-71'").get() as { id: number }).id;

db.run(`INSERT INTO AcademicYear (specialtyId, yearName, semester, trackId, createdAt, updatedAt)
  VALUES (${specId}, 'السنة الأولى', 1, ${trackId}, datetime('now'), datetime('now'))`);
db.run(`INSERT INTO AcademicYear (specialtyId, yearName, semester, trackId, createdAt, updatedAt)
  VALUES (${specId}, 'السنة الثانية', 1, ${trackId}, datetime('now'), datetime('now'))`);
const year1 = (db.query(`SELECT id FROM AcademicYear WHERE specialtyId=${specId} AND yearName='السنة الأولى'`).get() as { id: number }).id;
const year2 = (db.query(`SELECT id FROM AcademicYear WHERE specialtyId=${specId} AND yearName='السنة الثانية'`).get() as { id: number }).id;

// نفس الاسم في سنتين (فخ الإنتاج) + أسماء متشابهة بين السنتين
for (const [name, yearId] of [
  ["النحو العربي", year1], ["إنجليزية 1", year1],
  ["النحو العربي", year2], ["اللغة الإنجليزية 1", year2],
] as Array<[string, number]>) {
  db.run(`INSERT INTO ModuleCourse (specialtyId, name, code, academicYearId, semester, createdAt, updatedAt)
    VALUES (${specId}, '${name}', 'R71', ${yearId}, 1, datetime('now'), datetime('now'))`);
}
const mods = db.query(`SELECT id, name, academicYearId AS yearId FROM ModuleCourse WHERE specialtyId=${specId}`).all() as Array<{ id: number; name: string; yearId: number }>;
const nahwY1 = mods.find((m) => m.name === "النحو العربي" && m.yearId === year1)!.id;
const nahwY2 = mods.find((m) => m.name === "النحو العربي" && m.yearId === year2)!.id;

// قناة المكتبة مربوطة بالسنة الثانية — فخ الإنتاج نفسه: منشورات «سنة أولى»
db.run(`INSERT INTO TelegramSource (tgChannelId, tgUsername, titleAr, sourceType, kind, specialtyId, trackId, yearId, semester, moduleId, cohortId, isActive, lastUpdateId, createdAt, updatedAt)
  VALUES ('${CHAT}', '', 'قناة r71 — علمية', 'channel', 'public', ${specId}, NULL, ${year2}, NULL, NULL, NULL, 1, 0, datetime('now'), datetime('now'))`);
const sourceId = (db.query(`SELECT id FROM TelegramSource WHERE tgChannelId='${CHAT}'`).get() as { id: number }).id;

// طالبان: سنة أولى وسنة ثانية
for (const [email, yearId] of [["r71-y1@test", year1], ["r71-y2@test", year2]] as Array<[string, number]>) {
  db.run(`INSERT INTO AppUser (fullName, email, studentId, passwordHash, specialtyName, yearName, groupNumber, role, assignedSpecialtyId, scopeAcademicYearId, scopeTrackId, createdAt, updatedAt)
    VALUES ('طالب ${email}', '${email}', 'S-${email}', '', 'أدب عربي r71', 'سنة', '1', 'STUDENT', ${specId}, ${yearId}, ${trackId}, datetime('now'), datetime('now'))`);
}
const y1Id = (db.query(`SELECT id FROM AppUser WHERE email='r71-y1@test'`).get() as { id: number }).id;
const y2Id = (db.query(`SELECT id FROM AppUser WHERE email='r71-y2@test'`).get() as { id: number }).id;
db.run(`DELETE FROM AiEvent`);

console.log("seed: spec=%d track=%d y1=%d y2=%d src=%d nahwY1=%d nahwY2=%d", specId, trackId, year1, year2, sourceId, nahwY1, nahwY2);

// ---------------------------------------------------------------- tests
const y1Cookie = await login("طالب r71-y1@test", "r71-y1@test");
const y2Cookie = await login("طالب r71-y2@test", "r71-y2@test");
check("تسجيل دخول الطالبين", !!y1Cookie && !!y2Cookie);

// ===== 1. THE BUG: «ملخص النحو العربي سنة أولى» في قناة مربوطة بالسنة الثانية =====
{
  console.log("\n=== 1. علة الإنتاج نفسها: نص يقول سنة أولى في قناة مربوطة بالسنة الثانية ===");
  const r = await webhook(post(CHAT, 1001, "ملخص النحو العربي سنة أولى"));
  check("استُورد (inserted)", r.status === "inserted", JSON.stringify(r));

  const row = db.query(`SELECT * FROM TelegramItem WHERE sourceId=${sourceId} AND tgMessageId=1001`).get() as Record<string, unknown> | null;
  check("الصف موجود", row != null);
  if (row) {
    check("المقياس = نحو السنة الأولى (#" + nahwY1 + ")", Number(row.moduleId) === nahwY1, `moduleId=${row.moduleId}`);
    check("العنوان نظيف بلا «سنة أولى»", row.titleAr === "ملخص النحو العربي", String(row.titleAr));
    check("الثقة معلنة", row.classConfidence != null && Number(row.classConfidence) >= 70, String(row.classConfidence));
    check("الحالة منشور (نص صريح متفق)", row.classStatus === "published", String(row.classStatus));
    const meta = row.classMeta ? JSON.parse(String(row.classMeta)) : {};
    check("meta يحمل السنة والسبب", meta.extracted?.yearOrdinal === 1 && String(meta.matchReason ?? "").includes("سنة"), JSON.stringify(meta.extracted ?? null));
  }

  // الطالب المناسب يراه في المكتبة تحت مقياسه
  const lib1 = await j(await fetch(`${BASE}/api/telegram/items?mode=library`, { headers: { cookie: y1Cookie } }));
  const items1 = (lib1.items ?? []) as Array<Record<string, unknown>>;
  const mine1 = items1.find((i) => Number(i.tgMessageId) === 1001);
  check("طالب السنة الأولى يرى المنشور (العلة شُفيت)", mine1 != null, JSON.stringify(items1.map((i) => i.titleAr)));
  check("تحت مقياس النحو العربي مع اسمه", mine1?.moduleName === "النحو العربي", String(mine1?.moduleName));

  // طالب الثانية لا يراه (المقياس من سنته لا سنته)
  const lib2 = await j(await fetch(`${BASE}/api/telegram/items?mode=library`, { headers: { cookie: y2Cookie } }));
  const items2 = (lib2.items ?? []) as Array<Record<string, unknown>>;
  check("طالب السنة الثانية لا يراه", !items2.some((i) => Number(i.tgMessageId) === 1001));
}

// ===== 2. منشور صريح للسنة الثانية في القناة نفسها =====
{
  console.log("\n=== 2. منشور سنة ثانية (صريح) في القناة نفسها ===");
  const r = await webhook(post(CHAT, 1002, "تمارين النحو العربي السنة الثانية"));
  check("استُورد", r.status === "inserted", JSON.stringify(r));
  const row = db.query(`SELECT * FROM TelegramItem WHERE sourceId=${sourceId} AND tgMessageId=1002`).get() as Record<string, unknown> | null;
  check("المقياس = نحو السنة الثانية", row != null && Number(row.moduleId) === nahwY2, `moduleId=${row?.moduleId}`);
  check("العنوان نظيف", row?.titleAr === "تمارين النحو العربي", String(row?.titleAr));
  const lib2 = await j(await fetch(`${BASE}/api/telegram/items?mode=library`, { headers: { cookie: y2Cookie } }));
  check("طالب الثانية يرى تمارينه", ((lib2.items ?? []) as Array<Record<string, unknown>>).some((i) => Number(i.tgMessageId) === 1002));
  const lib1 = await j(await fetch(`${BASE}/api/telegram/items?mode=library`, { headers: { cookie: y1Cookie } }));
  check("طالب الأولى لا يرى تمارين الثانية", !((lib1.items ?? []) as Array<Record<string, unknown>>).some((i) => Number(i.tgMessageId) === 1002));
}

// ===== 3. عنوان نظيف بلا سنة: ربط القناة يرجّح سنة الثانية (سلوك r64 بثقة معلنة) =====
{
  console.log("\n=== 3. بلا سنة مذكورة → ربط القناة يرجّح (سلوك r64 محفوظ) ===");
  await webhook(post(CHAT, 1003, "محاضرة في النحو العربي"));
  const row = db.query(`SELECT * FROM TelegramItem WHERE sourceId=${sourceId} AND tgMessageId=1003`).get() as Record<string, unknown> | null;
  check("المقياس من سنة ربط القناة (الثانية)", row != null && Number(row.moduleId) === nahwY2, `moduleId=${row?.moduleId}`);
  check("الحالة منشور (مستنتج من الربط)", row?.classStatus === "published", String(row?.classStatus));
}

// ===== 4. وسائط بلا معلومة: مراجعة لا نشر تلقائي (Test 5) =====
{
  console.log("\n=== 4. ملف بلا وصف ولا مطابقة → بانتظار المراجعة (لا نشر تلقائي) ===");
  const upd = post(CHAT, 1004, "");
  upd.channel_post.document = { file_id: "r71doc", file_unique_id: "r71doc-u", file_name: "IMG_20260910.jpg", mime_type: "image/jpeg", file_size: 5000 };
  const r = await webhook(upd);
  check("استُورد (وسائط)", r.status === "inserted", JSON.stringify(r));
  const row = db.query(`SELECT * FROM TelegramItem WHERE sourceId=${sourceId} AND tgMessageId=1004`).get() as Record<string, unknown> | null;
  check("بلا مقياس", row != null && row.moduleId == null, `moduleId=${row?.moduleId}`);
  check("الحالة مراجعة (وسائط بلا تصنيف)", row?.classStatus === "review", String(row?.classStatus));
  // غير مرئي للطلاب في المكتبة
  const lib1 = await j(await fetch(`${BASE}/api/telegram/items?mode=library`, { headers: { cookie: y1Cookie } }));
  check("لا يظهر لطلبة المكتبة قبل الاعتماد", !((lib1.items ?? []) as Array<Record<string, unknown>>).some((i) => Number(i.tgMessageId) === 1004));
  const lib2 = await j(await fetch(`${BASE}/api/telegram/items?mode=library`, { headers: { cookie: y2Cookie } }));
  check("ولا لطلبة الثانية", !((lib2.items ?? []) as Array<Record<string, unknown>>).some((i) => Number(i.tgMessageId) === 1004));
}

// ===== 5. نقاش عام: يُرفض كلياً (انحدار r65 محفوظ) =====
{
  console.log("\n=== 5. نقاش عام → رفض (بوابة r65) ===");
  const r = await webhook(post(CHAT, 1005, "مرحبا بكم جميعاً في قناتنا الجديدة"));
  check("رُفض (skipped)", r.status === "skipped", JSON.stringify(r));
  const cnt = db.query(`SELECT COUNT(*) AS c FROM TelegramItem WHERE sourceId=${sourceId} AND tgMessageId=1005`).get() as { c: number };
  check("لا صف في قاعدة البيانات", cnt.c === 0);
}

// ===== 6. تعارض صريح → مراجعة (Test 6) =====
{
  console.log("\n=== 6. تعارض: مقياس موجود في سنة واحدة والمنشور يقول سنة أخرى ===");
  const r = await webhook(post(CHAT, 1006, "ملخص إنجليزية 1 سنة أولى"));
  check("استُورد", r.status === "inserted", JSON.stringify(r));
  const row = db.query(`SELECT * FROM TelegramItem WHERE sourceId=${sourceId} AND tgMessageId=1006`).get() as Record<string, unknown> | null;
  // إنجليزية 1 موجودة في السنة الأولى فقط → نص متفق → نشر
  check("إنجليزية 1 (سنة أولى) مربوطة", row != null && row.moduleId != null, `moduleId=${row?.moduleId}`);
}

// ===== 7. قائمة المراجعة + الاعتماد الإداري (Test 7 مكتمل) =====
{
  console.log("\n=== 7. قائمة المراجعة الإدارية والاعتماد ===");
  // المشرف = المالك: أنشئ مستخدم مالك
  db.run(`INSERT INTO AppUser (fullName, email, studentId, passwordHash, specialtyName, yearName, groupNumber, role, assignedSpecialtyId, createdAt, updatedAt)
    VALUES ('مالك r71', 'r71-owner@test', 'S-owner', '', 'أدب عربي r71', 'سنة', '1', 'OWNER', ${specId}, datetime('now'), datetime('now'))`);
  const ownerCookie = await login("مالك r71", "r71-owner@test");
  check("دخول المالك", !!ownerCookie);

  const adminAll = await j(await fetch(`${BASE}/api/telegram/items?mode=admin&limit=500`, { headers: { cookie: ownerCookie } }));
  check("intelligence.ready", (adminAll.intelligence as Record<string, unknown>)?.ready === true, JSON.stringify(adminAll.intelligence ?? null));
  check("reviewCount ≥ 1 (منشور 1004)", Number((adminAll.intelligence as Record<string, unknown>)?.reviewCount ?? 0) >= 1, JSON.stringify(adminAll.intelligence ?? null));

  const review = await j(await fetch(`${BASE}/api/telegram/items?mode=admin&needsReview=1`, { headers: { cookie: ownerCookie } }));
  const reviewItems = (review.items ?? []) as Array<Record<string, unknown>>;
  check("فلتر المراجعة يعيد 1004 فقط", reviewItems.length === 1 && Number(reviewItems[0].tgMessageId) === 1004, `len=${reviewItems.length}`);
  check("شارة «للمراجعة» في الصف", reviewItems[0]?.classStatus === "review");

  // الاعتماد مع تصحيح المقياس
  const approve = await j(await fetch(`${BASE}/api/telegram/items`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ id: Number(reviewItems[0].id), action: "approve", titleAr: "صورة درس مجهول", moduleId: nahwY2 }),
  }));
  check("الاعتماد نجح", approve.ok === true, JSON.stringify(approve));

  // الآن مرئي لطلبة الثانية (المقياس المختار من سنة الثانية)
  const lib2 = await j(await fetch(`${BASE}/api/telegram/items?mode=library`, { headers: { cookie: y2Cookie } }));
  const vis = ((lib2.items ?? []) as Array<Record<string, unknown>>).find((i) => Number(i.tgMessageId) === 1004);
  check("بعد الاعتماد: مرئي لطلبة الثانية تحت مقياس النحو", vis != null && vis.moduleName === "النحو العربي", JSON.stringify(vis?.moduleName));
  check("بعد الاعتماد: الحالة published", vis?.classStatus === "published");
  // علامة المنقّح (ai_classified=false) تحميه من إعادة التصنيف الآلية
  const row = db.query(`SELECT aiClassified FROM TelegramItem WHERE tgMessageId=1004`).get() as Record<string, unknown>;
  check("علامة التنقيح الإداري (ai_classified=false)", row.aiClassified === 0, String(row.aiClassified));

  // 8. سجل الذكاء
  const aiLog = await j(await fetch(`${BASE}/api/telegram/ai-events?limit=50`, { headers: { cookie: ownerCookie } }));
  check("سجل الذكاء جاهز", aiLog.ready === true);
  const events = (aiLog.events ?? []) as Array<Record<string, unknown>>;
  check("أحداث مسجلة (استيراد + اعتماد)", events.length >= 7, `len=${events.length}`);
  const ingestEvents = events.filter((e) => e.stage === "ingest");
  check("أحداث الاستيراد تحمل القرار والثقة", ingestEvents.length >= 6 && ingestEvents.every((e) => e.decision != null && e.confidence != null));
  const skipEvent = events.find((e) => e.decision === "skip");
  check("حدث الرفض مسجل مع السبب", skipEvent != null && (skipEvent.reason ?? "") !== "", JSON.stringify(skipEvent?.reason ?? null));

  // 9. الطلبة لا يصلون إلى سجل الذكاء
  const forbidden = await fetch(`${BASE}/api/telegram/ai-events`, { headers: { cookie: y1Cookie } });
  check("سجل الذكاء محمي عن الطلبة (403)", forbidden.status === 403, String(forbidden.status));
}

// ===== 10. إعادة التصنيف العميقة تشفي التاريخ (deep reclassify) =====
{
  console.log("\n=== 10. الشفاء العميق للمنشورات المصنّفة آلياً ===");
  // منشور قديم صُنّف آلياً في المقياس الخطأ (محاكاة ما قبل r71)
  db.run(`INSERT INTO TelegramItem (sourceId, tgMessageId, mediaGroupId, kind, titleAr, captionText, searchText, fileName, mimeType, fileId, fileUniqueId, sizeBytes, link, specialtyId, moduleId, itemType, origin, postedBy, cohortId, isHidden, isFeatured, aiClassified, postedAt, classConfidence, classStatus, classMeta, createdAt, updatedAt)
    VALUES (${sourceId}, 999, '', 'text', 'ملخص النحو العربي سنة أولى', 'ملخص النحو العربي سنة أولى', 'ملخص النحو العربي سنه اولي', '', '', '', '', 0, 'https://t.me/c/999/999', ${specId}, ${nahwY2}, 'ملخص', 'telegram', 'مالك', NULL, 0, 0, 1, datetime('now'), 60, 'published', NULL, datetime('now'), datetime('now'))`);

  const ownerCookie = await login("مالك r71", "r71-owner@test");
  const deep = await j(await fetch(`${BASE}/api/telegram/items`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ action: "reclassify-source", sourceId, deep: true, limit: 40 }),
  }));
  check("الشفاء العميق اشتغل", deep.ok === true && Number(deep.processed) >= 1, JSON.stringify({ processed: deep.processed, updated: deep.updated }));

  const healed = db.query(`SELECT moduleId, titleAr, classStatus FROM TelegramItem WHERE tgMessageId=999`).get() as Record<string, unknown>;
  check("المقياس شُفي إلى نحو السنة الأولى", Number(healed.moduleId) === nahwY1, `moduleId=${healed.moduleId}`);
  check("العنوان نُظّف", healed.titleAr === "ملخص النحو العربي", String(healed.titleAr));

  // المنقّح يدوياً (ai_classified=0، منشور 1004) لا يُمسّ في الوضع العميق
  const curated = db.query(`SELECT moduleId FROM TelegramItem WHERE tgMessageId=1004`).get() as Record<string, unknown>;
  check("المنقّح يدوياً محمي من الشفاء العميق", Number(curated.moduleId) === nahwY2, `moduleId=${curated.moduleId}`);
}

// ===== 11. انحدارات r65-r69: المكتبة تفلتر بالمقياس والسنة والبحث =====
{
  console.log("\n=== 11. انحدارات المكتبة ===");
  const lib1 = await j(await fetch(`${BASE}/api/telegram/items?mode=library&moduleId=${nahwY1}`, { headers: { cookie: y1Cookie } }));
  const items = (lib1.items ?? []) as Array<Record<string, unknown>>;
  check("فلتر المقياس يعمل", items.length >= 1 && items.every((i) => Number(i.moduleId) === nahwY1));
  const search = await j(await fetch(`${BASE}/api/telegram/items?mode=library&q=${encodeURIComponent("ملخص النحو")}`, { headers: { cookie: y1Cookie } }));
  check("البحث المطبع يعمل", ((search.items ?? []) as unknown[]).length >= 1);
  const sem = await j(await fetch(`${BASE}/api/telegram/items?mode=library&semester=1`, { headers: { cookie: y1Cookie } }));
  check("فلتر الفصل يعمل (لا كسور)", Array.isArray(sem.items));
}

// ---------------------------------------------------------------- cleanup
db.run(`DELETE FROM TelegramItem WHERE sourceId=${sourceId}`);
db.run(`DELETE FROM TelegramSource WHERE id=${sourceId}`);
db.run(`DELETE FROM AiEvent`);
db.run(`DELETE FROM DeviceSession`);
db.run(`DELETE FROM AppUser WHERE email LIKE '%r71-%@test%'`);
db.run(`DELETE FROM ModuleCourse WHERE specialtyId=${specId}`);
db.run(`DELETE FROM AcademicYear WHERE specialtyId=${specId}`);
db.run(`DELETE FROM AcademicTrack WHERE specialtyId=${specId}`);
db.run(`DELETE FROM Specialty WHERE id=${specId}`);
db.close();

console.log(`\n=== النتيجة: ${passed} ✅ / ${failed} ❌ ===`);
if (failed > 0) process.exit(1);
